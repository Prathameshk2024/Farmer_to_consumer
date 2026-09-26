import { Router } from 'express'
import type { Product } from '@shared/types.js'
import {
  canSellNow, initialListingStatus, fssaiProblem, normalizeFssai, sizeProblems,
} from '@shared/seller.js'
import { getDb, newId, save } from '../db/store.js'
import { requireRole } from '../middleware/auth.js'
import { destroyImage } from './uploads.routes.js'

export const productsRouter: Router = Router()

/**
 * What a listing must have before the public can see it.
 *
 * Shared by "publish a new product" and "publish a draft she saved earlier",
 * because a draft that skipped the check on the way in would otherwise reach
 * the catalogue by the back door.
 */
function listingProblems(b: Partial<Product>): Record<string, string> {
  const fields: Record<string, string> = {}
  if (!b.name?.trim()) fields.name = 'उत्पादनाचे नाव आवश्यक आहे'
  if (!b.categoryId) fields.categoryId = 'प्रकार निवडा'
  if (!b.price || Number(b.price) <= 0) fields.price = 'किंमत टाका'
  // How much one of these IS. A price without it cannot be compared with the
  // shop next door - see sizeProblems in shared/src/seller.ts.
  Object.assign(fields, sizeProblems(b))

  if (b.isFood) {
    if (!b.ingredients?.trim()) fields.ingredients = 'यात काय आहे ते सांगा'
    if (!b.vegType) fields.vegType = 'शाकाहारी की मांसाहारी ते निवडा'
    // Never required - most home kitchens are under the threshold - but a
    // number that cannot be a licence is refused rather than published.
    const fssai = fssaiProblem(b.fssai)
    if (fssai) fields.fssai = fssai
  } else if (!b.material?.trim()) {
    fields.material = 'कोणत्या वस्तूपासून बनवले ते सांगा'
  }
  return fields
}

/** Her own products, drafts included. */
productsRouter.get('/mine', requireRole('seller'), (req, res) => {
  const sellerId = req.auth!.sellerId!
  res.json({ products: getDb().products.filter((p) => p.sellerId === sellerId) })
})

/** Why an unverified farmer's listing cannot go on sale yet. */
const NOT_VERIFIED_MR = 'तुमची तपासणी झाल्यावर माल विक्रीसाठी जाईल'

productsRouter.post('/', requireRole('seller'), (req, res) => {
  const db = getDb()
  const sellerId = req.auth!.sellerId!
  const seller = db.sellers.find((s) => s.id === sellerId)
  if (!seller) {
    res.status(404).json({ error: 'Seller not found' })
    return
  }

  const b = req.body as Partial<Product> & { asDraft?: boolean }
  const asDraft = !!b.asDraft

  // Drafts are his to write before the check; putting one on sale waits for it.
  if (!asDraft && !canSellNow(seller)) {
    res.status(403).json({ error: 'Not verified', messageMr: NOT_VERIFIED_MR })
    return
  }

  const fields = listingProblems(b)

  if (!asDraft && Object.keys(fields).length) {
    res.status(400).json({ error: 'Validation failed', messageMr: 'माहिती तपासा', fields })
    return
  }

  const product: Product = {
    id: newId('p'),
    sellerId,
    emoji: b.emoji ?? '📦',
    imageUrl: b.imageUrl,
    imagePublicId: b.imagePublicId,
    name: (b.name ?? '').trim(),
    nameEn: b.nameEn,
    categoryId: b.categoryId ?? '',
    isFood: !!b.isFood,
    // Stamped from her seller record - one source of truth.
    ingredients: b.isFood ? b.ingredients : undefined,
    vegType: b.isFood ? b.vegType : undefined,
    fssai: b.isFood ? normalizeFssai(b.fssai) || undefined : undefined,
    material: b.isFood ? undefined : b.material,
    price: Number(b.price ?? 0),
    mrp: Number(b.mrp ?? 0),
    unit: b.unit ?? 'piece',
    packSize: Number(b.packSize) > 0 ? Number(b.packSize) : undefined,
    piecesPerPack: Number(b.piecesPerPack) > 0 ? Number(b.piecesPerPack) : undefined,
    stock: b.madeToOrder ? 0 : Number(b.stock ?? 0),
    madeToOrder: !!b.madeToOrder,
    // LIVE at once for a verified farmer - see initialListingStatus.
    status: initialListingStatus(asDraft),
    views: 0,
    createdAt: new Date().toISOString(),
  }

  db.products.push(product)
  save()
  res.status(201).json({ product })
})

productsRouter.patch('/:id', requireRole('seller'), (req, res) => {
  const db = getDb()
  const i = db.products.findIndex(
    (p) => p.id === req.params.id && p.sellerId === req.auth!.sellerId,
  )
  if (i < 0) {
    res.status(404).json({ error: 'Product not found' })
    return
  }

  const allowed = [
    'name', 'nameEn', 'emoji', 'categoryId', 'price', 'mrp', 'unit', 'stock',
    'packSize', 'piecesPerPack', 'fssai',
    'madeToOrder', 'ingredients', 'vegType', 'material',
    'imageUrl', 'imagePublicId',
  ] as const

  const patch: Record<string, unknown> = {}
  for (const key of allowed) if (key in req.body) patch[key] = req.body[key]

  /**
   * The licence number is checked on the way in HERE too, not only when a
   * listing is first submitted.
   *
   * `listingProblems` runs on a submission, so without this an edit was the
   * way round it: a live listing could be given "oops" as its FSSAI number
   * and publish it to buyers as if somebody had looked. Blank still clears
   * it - a woman whose licence lapsed must be able to take the number down.
   */
  if ('fssai' in patch) {
    const problem = fssaiProblem(patch.fssai)
    if (problem) {
      res.status(400).json({
        error: 'Invalid FSSAI number',
        messageMr: problem,
        fields: { fssai: problem },
      })
      return
    }
    patch.fssai = normalizeFssai(patch.fssai) || undefined
  }

  const current = db.products[i]!

  // Pausing and un-pausing is the only status change a seller may make herself.
  if (req.body.status === 'PAUSED' || req.body.status === 'LIVE') {
    if (current.status === 'LIVE' || current.status === 'PAUSED') patch.status = req.body.status
  }

  /**
   * Putting a draft on sale. The same checks as a new listing, so "save as
   * draft" is never a way round them.
   */
  if (req.body.status === 'LIVE' && current.status === 'DRAFT') {
    const seller = db.sellers.find((s) => s.id === req.auth!.sellerId)!
    if (!canSellNow(seller)) {
      res.status(403).json({ error: 'Not verified', messageMr: NOT_VERIFIED_MR })
      return
    }
    const fields = listingProblems({ ...current, ...patch } as Product)
    if (Object.keys(fields).length) {
      res.status(400).json({ error: 'Validation failed', messageMr: 'माहिती तपासा', fields })
      return
    }
    patch.status = initialListingStatus(false)
  }

  const merged = { ...current, ...patch } as Product
  db.products[i] = merged
  save()
  res.json({ product: db.products[i] })
})

/**
 * A farmer removes any listing of his own - a sold-out crop is his to take
 * down. A real delete, not a tombstone.
 */
productsRouter.delete('/:id', requireRole('seller'), (req, res) => {
  const db = getDb()
  const i = db.products.findIndex(
    (p) => p.id === req.params.id && p.sellerId === req.auth!.sellerId,
  )
  if (i < 0) {
    res.status(404).json({ error: 'Product not found' })
    return
  }

  const [gone] = db.products.splice(i, 1)
  save()

  // Best effort, and deliberately not awaited: the record is already gone, the
  // seller is waiting on a phone, and an image left behind is a smaller
  // problem than a delete that appears to hang. This is the only moment we
  // still know the public id, so it is now or never.
  void destroyImage(gone?.imagePublicId)

  res.json({ ok: true })
})
