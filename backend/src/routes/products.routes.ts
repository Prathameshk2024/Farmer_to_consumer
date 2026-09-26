import { Router } from 'express'
import type { Product } from '@shared/types.js'
import { canSellNow, initialListingStatus } from '@shared/farmer.js'
import { categoryFor, listingProblems } from '@shared/produce.js'
import { getDb, newId, save } from '../db/store.js'
import { CATEGORIES, isCategoryId } from '../db/seed.js'
import { requireRole } from '../middleware/auth.js'
import { destroyImage } from './uploads.routes.js'

export const productsRouter: Router = Router()

const CHECK_MR = 'माहिती तपासा'
const CATEGORY_MR = 'प्रकार निवडा'

/**
 * What a listing must have before the public can see it: the shared rules,
 * plus a category the catalogue knows.
 *
 * Shared by "publish a new product" and "publish a draft he saved earlier",
 * because a draft that skipped the check on the way in would otherwise reach
 * the catalogue by the back door.
 */
function publishProblems(p: Partial<Product>): Record<string, string> {
  const fields = listingProblems(p)
  if (!isCategoryId(p.categoryId)) fields.categoryId = CATEGORY_MR
  return fields
}

/**
 * A categoryId that is not in the list is refused outright, draft or not -
 * it would otherwise sit in the database as a filter no buyer can reach.
 */
function unknownCategory(sent: unknown): boolean {
  return sent != null && sent !== '' && !isCategoryId(sent)
}

/** Numbers arrive from a form as text; store them as numbers. */
const NUMERIC = ['price', 'stock', 'minOrder'] as const

/** Her own products, drafts included. */
productsRouter.get('/mine', requireRole('farmer'), (req, res) => {
  const farmerId = req.auth!.farmerId!
  res.json({ products: getDb().products.filter((p) => p.farmerId === farmerId) })
})

/** Why an unverified farmer's listing cannot go on sale yet. */
const NOT_VERIFIED_MR = 'तुमची तपासणी झाल्यावर माल विक्रीसाठी जाईल'

productsRouter.post('/', requireRole('farmer'), (req, res) => {
  const db = getDb()
  const farmerId = req.auth!.farmerId!
  const farmer = db.farmers.find((s) => s.id === farmerId)
  if (!farmer) {
    res.status(404).json({ error: 'Farmer not found' })
    return
  }

  const b = req.body as Partial<Product> & { asDraft?: boolean }
  const asDraft = !!b.asDraft

  // Drafts are his to write before the check; putting one on sale waits for it.
  if (!asDraft && !canSellNow(farmer)) {
    res.status(403).json({ error: 'Not verified', messageMr: NOT_VERIFIED_MR })
    return
  }
  if (unknownCategory(b.categoryId)) {
    res.status(400).json({ error: 'Unknown category', messageMr: CATEGORY_MR, fields: { categoryId: CATEGORY_MR } })
    return
  }

  const categoryId = categoryFor(b.cropId, b.categoryId) ?? ''
  const product: Product = {
    id: newId('p'),
    farmerId,
    cropId: b.cropId ?? '',
    name: String(b.name ?? '').trim(),
    categoryId,
    imageUrl: b.imageUrl,
    imagePublicId: b.imagePublicId,
    emoji: b.emoji ?? CATEGORIES.find((c) => c.id === categoryId)?.icon ?? '📦',
    // A draft may still be missing these; publishing checks them.
    unit: b.unit!,
    price: Number(b.price ?? 0),
    stock: Number(b.stock ?? 0),
    minOrder: Number(b.minOrder ?? 1),
    harvestDate: String(b.harvestDate ?? ''),
    cultivation: b.cultivation!,
    description: String(b.description ?? '').trim() || undefined,
    // LIVE at once for a verified farmer - see initialListingStatus.
    status: initialListingStatus(asDraft),
    views: 0,
    createdAt: new Date().toISOString(),
  }

  const fields = publishProblems(product)
  if (!asDraft && Object.keys(fields).length) {
    res.status(400).json({ error: 'Validation failed', messageMr: CHECK_MR, fields })
    return
  }

  db.products.push(product)
  save()
  res.status(201).json({ product })
})

productsRouter.patch('/:id', requireRole('farmer'), (req, res) => {
  const db = getDb()
  const i = db.products.findIndex(
    (p) => p.id === req.params.id && p.farmerId === req.auth!.farmerId,
  )
  if (i < 0) {
    res.status(404).json({ error: 'Product not found' })
    return
  }

  // Every field of the listing may change, as often as he likes.
  const allowed = [
    'cropId', 'name', 'categoryId', 'emoji', 'unit', 'price', 'stock', 'minOrder',
    'harvestDate', 'cultivation', 'description', 'imageUrl', 'imagePublicId',
  ] as const

  const patch: Record<string, unknown> = {}
  for (const key of allowed) if (key in req.body) patch[key] = req.body[key]
  for (const key of NUMERIC) if (key in patch) patch[key] = Number(patch[key])

  if (unknownCategory(patch.categoryId)) {
    res.status(400).json({ error: 'Unknown category', messageMr: CATEGORY_MR, fields: { categoryId: CATEGORY_MR } })
    return
  }

  const current = db.products[i]!
  const merged = { ...current, ...patch } as Product
  merged.categoryId = categoryFor(merged.cropId, merged.categoryId) ?? ''

  // Pausing and un-pausing is the only status change a farmer may make himself.
  if (req.body.status === 'PAUSED' || req.body.status === 'LIVE') {
    if (current.status === 'LIVE' || current.status === 'PAUSED') merged.status = req.body.status
  }

  if (req.body.status === 'LIVE' && current.status === 'DRAFT') {
    // Putting a draft on sale: the same checks as a new listing, so "save as
    // draft" is never a way round them.
    const farmer = db.farmers.find((s) => s.id === req.auth!.farmerId)!
    if (!canSellNow(farmer)) {
      res.status(403).json({ error: 'Not verified', messageMr: NOT_VERIFIED_MR })
      return
    }
    const fields = publishProblems(merged)
    if (Object.keys(fields).length) {
      res.status(400).json({ error: 'Validation failed', messageMr: CHECK_MR, fields })
      return
    }
    merged.status = initialListingStatus(false)
  } else if (merged.status !== 'DRAFT') {
    // An edit to a listing on sale may not make it wrong. Only the fields he
    // touched are judged: a tomato listed 61 days ago must still be pausable,
    // and its stale harvest date is not what he came to change.
    const touched = new Set([...Object.keys(patch), ...('cropId' in patch ? ['categoryId'] : [])])
    const fields = Object.fromEntries(
      Object.entries(publishProblems(merged)).filter(([k]) => touched.has(k)
        // A minimum is judged against the stock, so changing either judges both.
        || (k === 'minOrder' && touched.has('stock'))),
    )
    if (Object.keys(fields).length) {
      res.status(400).json({ error: 'Validation failed', messageMr: CHECK_MR, fields })
      return
    }
  }

  db.products[i] = merged
  save()
  res.json({ product: merged })
})

/**
 * A farmer removes any listing of his own - a sold-out crop is his to take
 * down. A real delete, not a tombstone.
 */
productsRouter.delete('/:id', requireRole('farmer'), (req, res) => {
  const db = getDb()
  const i = db.products.findIndex(
    (p) => p.id === req.params.id && p.farmerId === req.auth!.farmerId,
  )
  if (i < 0) {
    res.status(404).json({ error: 'Product not found' })
    return
  }

  const [gone] = db.products.splice(i, 1)
  save()

  // Best effort, and deliberately not awaited: the record is already gone, the
  // farmer is waiting on a phone, and an image left behind is a smaller
  // problem than a delete that appears to hang. This is the only moment we
  // still know the public id, so it is now or never.
  void destroyImage(gone?.imagePublicId)

  res.json({ ok: true })
})
