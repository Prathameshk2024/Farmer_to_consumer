import { Router } from 'express'
import type { Product } from '@shared/types.js'
import {
  MAX_EDITS, countsAsEdit, editsAreLimited, editsLeft, farmerMayDelete, initialListingStatus, slotInfo,
} from '@shared/farmer.js'
import { subscriptionView, termOpen } from '@shared/subscription.js'
import { categoryFor, descriptionProblem, listingProblems } from '@shared/produce.js'
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
 * Shared by "publish a new product" and "publish a draft saved earlier",
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

/**
 * What is refused outright, draft or not: a category not in the list, and a
 * description past the cap. Both would otherwise sit in the database whatever
 * the listing's status.
 */
export function hardRefusal(body: Record<string, unknown>): { error: string; messageMr: string; fields: Record<string, string> } | null {
  if (unknownCategory(body.categoryId)) {
    return { error: 'Unknown category', messageMr: CATEGORY_MR, fields: { categoryId: CATEGORY_MR } }
  }
  const desc = descriptionProblem(body.description)
  if (desc) return { error: 'Description too long', messageMr: desc, fields: { description: desc } }
  return null
}

/**
 * What an edit to a listing on sale is judged on. Only the fields the farmer touched:
 * a tomato listed 61 days ago must still be pausable, and its stale harvest
 * date is not what they came to change. But a field is judged whenever
 * something it depends on moves - the minimum against the stock, and the
 * harvest date against the crop, or grain relabelled as tomatoes would turn
 * a 61-day-old listing into "fresh" produce.
 */
export function patchProblems(merged: Partial<Product>, patchKeys: string[], now = Date.now()): Record<string, string> {
  const touched = new Set(patchKeys)
  if (touched.has('cropId')) { touched.add('categoryId'); touched.add('harvestDate') }
  if (touched.has('categoryId')) touched.add('harvestDate')
  if (touched.has('stock')) touched.add('minOrder')
  const all = listingProblems(merged, now)
  if (!isCategoryId(merged.categoryId)) all.categoryId = CATEGORY_MR
  return Object.fromEntries(Object.entries(all).filter(([k]) => touched.has(k)))
}

/** Numbers arrive from a form as text; store them as numbers. */
const NUMERIC = ['price', 'stock', 'minOrder'] as const

/** The farmer's own products, drafts included. */
productsRouter.get('/mine', requireRole('farmer'), (req, res) => {
  const db = getDb()
  const farmerId = req.auth!.farmerId!
  const farmer = db.farmers.find((s) => s.id === farmerId)
  const products = db.products.filter((p) => p.farmerId === farmerId)
  res.json({
    products,
    slots: slotInfo(farmer ?? {}, products),
    subscription: subscriptionView(farmer ?? {}),
  })
})

/** Why an unverified farmer's listing cannot go on sale yet. */
const NOT_VERIFIED_MR = 'तुमची तपासणी झाल्यावर माल विक्रीसाठी जाईल'
const NO_TERM_MR = 'तुमची वर्गणी सुरू नाही. ₹50 भरून मंजुरी मिळाल्यावर उत्पादने पाठवता येतील.'
const SLOTS_FULL_MR = 'सर्व जागा भरल्या आहेत. आणखी 5 जागांसाठी ₹50 भरा.'

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

  // Drafts are the farmer's to write before the check, before paying and
  // with no slot free; sending one in waits for all three, in that order, so
  // the message names the first thing the farmer can do about it.
  if (!asDraft && farmer.status !== 'ACTIVE') {
    res.status(403).json({ error: 'Not verified', messageMr: NOT_VERIFIED_MR })
    return
  }
  if (!asDraft && !termOpen(farmer)) {
    res.status(403).json({ error: 'No open subscription', messageMr: NO_TERM_MR })
    return
  }
  // THE SLOT GATE. The disabled button is a courtesy; this is the rule.
  const slots = slotInfo(farmer, db.products.filter((p) => p.farmerId === farmerId))
  if (!asDraft && slots.isFull) {
    res.status(402).json({ error: 'No slots left', messageMr: SLOTS_FULL_MR, slots })
    return
  }
  const refused = hardRefusal(b as Record<string, unknown>)
  if (refused) {
    res.status(400).json(refused)
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
    // PENDING, never LIVE - an admin publishes it.
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

  // Every field may change; what the produce IS, only MAX_EDITS times once live.
  const allowed = [
    'cropId', 'name', 'categoryId', 'emoji', 'unit', 'price', 'stock', 'minOrder',
    'harvestDate', 'cultivation', 'description', 'imageUrl', 'imagePublicId',
  ] as const

  const patch: Record<string, unknown> = {}
  for (const key of allowed) if (key in req.body) patch[key] = req.body[key]
  for (const key of NUMERIC) if (key in patch) patch[key] = Number(patch[key])

  const refused = hardRefusal(patch)
  if (refused) {
    res.status(400).json(refused)
    return
  }

  const current = db.products[i]!
  const merged = { ...current, ...patch } as Product
  merged.categoryId = categoryFor(merged.cropId, merged.categoryId) ?? ''

  // Pausing and un-pausing is the only status change a farmer may make themselves.
  if (req.body.status === 'PAUSED' || req.body.status === 'LIVE') {
    if (current.status === 'LIVE' || current.status === 'PAUSED') merged.status = req.body.status
  }

  if (req.body.status === 'LIVE' && current.status === 'DRAFT') {
    // Putting a draft on sale: the same checks as a new listing, so "save as
    // draft" is never a way round them.
    const farmer = db.farmers.find((s) => s.id === req.auth!.farmerId)!
    if (farmer.status !== 'ACTIVE') {
      res.status(403).json({ error: 'Not verified', messageMr: NOT_VERIFIED_MR })
      return
    }
    if (!termOpen(farmer)) {
      res.status(403).json({ error: 'No open subscription', messageMr: NO_TERM_MR })
      return
    }
    // THE SLOT GATE. The draft itself holds none, so it is counted without.
    const others = db.products.filter((p) => p.farmerId === farmer.id && p.id !== current.id)
    const slots = slotInfo(farmer, others)
    if (slots.isFull) {
      res.status(402).json({ error: 'No slots left', messageMr: SLOTS_FULL_MR, slots })
      return
    }
    const fields = publishProblems(merged)
    if (Object.keys(fields).length) {
      res.status(400).json({ error: 'Validation failed', messageMr: CHECK_MR, fields })
      return
    }
    merged.status = initialListingStatus(false)
  } else if (merged.status !== 'DRAFT') {
    // An edit to a listing on sale may not make it wrong (patchProblems).
    const fields = patchProblems(merged, Object.keys(patch))
    if (Object.keys(fields).length) {
      res.status(400).json({ error: 'Validation failed', messageMr: CHECK_MR, fields })
      return
    }
  }

  // THE EDIT LIMIT. Two changes to what the listing IS, then no more; the
  // client disables the fields at zero, this is the rule.
  const spends = editsAreLimited(current.status) && countsAsEdit(current, merged)
  if (spends && editsLeft(current) <= 0) {
    res.status(409).json({
      error: 'No edits left',
      messageMr: `या उत्पादनात ${MAX_EDITS} वेळा बदल करून झाले आहेत. किंमत, साठा, किमान ऑर्डर आणि काढणीची तारीख मात्र कधीही बदलता येतात.`,
      editsLeft: 0,
    })
    return
  }
  if (spends) merged.editCount = (current.editCount ?? 0) + 1

  db.products[i] = merged
  save()
  res.json({ product: merged })
})

/**
 * A farmer deletes their own drafts only. Anything sent in holds a slot, and
 * freeing a slot is the admin's decision (reject or take-down). A real
 * delete, not a tombstone.
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

  if (!farmerMayDelete(db.products[i]!.status)) {
    res.status(403).json({
      error: 'Only a draft can be deleted by the farmer',
      messageMr: 'पाठवलेले उत्पादन काढता येत नाही. ते काढायचे असल्यास प्रशासकाशी संपर्क करा.',
    })
    return
  }

  const [gone] = db.products.splice(i, 1)
  save()

  // Best effort, and deliberately not awaited: the record is already gone, the
  // farmer is waiting on a phone, and an image left behind is a smaller
  // problem than a delete that appears to hang. This is the only moment we
  // still know the public id, so it is now or never.
  void destroyImage(gone?.imagePublicId)

  const farmer = db.farmers.find((s) => s.id === req.auth!.farmerId)
  const slots = slotInfo(farmer ?? {}, db.products.filter((p) => p.farmerId === req.auth!.farmerId))
  res.json({ ok: true, slots })
})
