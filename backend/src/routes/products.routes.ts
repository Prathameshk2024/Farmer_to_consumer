import { Router } from 'express'
import type { Product } from '@shared/types.js'
import {
  MAX_EDITS, countsAsEdit, editsAreLimited, editsLeft, initialListingStatus,
  fssaiProblem, normalizeFssai, sellerMayDelete, sizeProblems, slotInfo,
} from '@shared/seller.js'
import { getDb, newId, save } from '../db/store.js'
import { requireRole } from '../middleware/auth.js'
import { purgeArchived, purgeRejected } from '../db/moderation.js'
import { isExpired, subscriptionView } from '@shared/subscription.js'
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

/** Her own products, including drafts and rejected ones. */
productsRouter.get('/mine', requireRole('seller'), (req, res) => {
  const db = getDb()
  // A rejection she has already had 48 hours to read is gone by now. Swept on
  // read as well as on the timer, so her list and the server never disagree.
  // `purgeArchived` clears tombstones from before deleting meant deleting.
  if (purgeRejected(db.products) + purgeArchived(db.products)) save()
  const sellerId = req.auth!.sellerId!
  const products = db.products.filter((p) => p.sellerId === sellerId)
  const seller = db.sellers.find((s) => s.id === sellerId)!
  // Her list shows live products as paused while the shop is, so it needs the
  // state - on the server's clock, not the phone's.
  res.json({ products, slots: slotInfo(seller, products), subscription: subscriptionView(seller) })
})

const EXPIRED_MR = 'तुमची वर्गणी संपली आहे. ₹50 भरून नूतनीकरण केल्यावर उत्पादने पाठवता येतील.'



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

  // She cannot publish until the 50 rupees is approved.
  if (!asDraft && seller.status !== 'ACTIVE') {
    res.status(403).json({
      error: 'Not active',
      messageMr: 'प्रशासकाच्या मंजुरीची वाट पहा',
    })
    return
  }
  // Drafts are still hers to write while the shop is paused; sending one in
  // waits for the renewal, like everything else a buyer would see.
  if (!asDraft && isExpired(seller)) {
    res.status(403).json({ error: 'Subscription expired', messageMr: EXPIRED_MR })
    return
  }

  // THE SLOT GATE. Enforced here, not just by the disabled button in the UI -
  // the button is a courtesy, this is the rule.
  const existing = db.products.filter((p) => p.sellerId === sellerId)
  const slots = slotInfo(seller, existing)
  if (!asDraft && slots.isFull) {
    res.status(402).json({
      error: 'No slots left',
      messageMr: 'सर्व जागा भरल्या आहेत. आणखी 5 जागांसाठी 50 रुपये भरा.',
      slots,
    })
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
    // PENDING, never LIVE - see initialListingStatus. An admin publishes it.
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
   * Sending a draft - or a rejected listing she has since fixed - back to the
   * moderation queue. It goes to PENDING, never straight to LIVE: a seller
   * cannot approve her own listing, and skipping the queue here would make
   * "save as draft" the way around it.
   *
   * Neither a draft nor a rejected listing holds a slot, so sending one in
   * takes one, which is why the slot gate has to run here too and not only on
   * create.
   */
  if (req.body.status === 'LIVE' && (current.status === 'DRAFT' || current.status === 'REJECTED')) {
    const seller = db.sellers.find((s) => s.id === req.auth!.sellerId)!
    if (seller.status !== 'ACTIVE') {
      res.status(403).json({ error: 'Not active', messageMr: 'प्रशासकाच्या मंजुरीची वाट पहा' })
      return
    }
    if (isExpired(seller)) {
      res.status(403).json({ error: 'Subscription expired', messageMr: EXPIRED_MR })
      return
    }

    const merged = { ...current, ...patch } as Product
    const fields = listingProblems(merged)
    if (Object.keys(fields).length) {
      res.status(400).json({ error: 'Validation failed', messageMr: 'माहिती तपासा', fields })
      return
    }

    const others = db.products.filter(
      (p) => p.sellerId === seller.id && p.id !== current.id,
    )
    const slots = slotInfo(seller, others)
    if (slots.isFull) {
      res.status(402).json({
        error: 'No slots left',
        messageMr: 'सर्व जागा भरल्या आहेत. आणखी 5 जागांसाठी 50 रुपये भरा.',
        slots,
      })
      return
    }

    // Publishing a draft is submitting it, exactly like a new listing: the
    // slot is spent now, and an admin decides whether it goes live.
    patch.status = initialListingStatus(false)
  }

  // Editing a live listing no longer knocks it back into a queue. She can fix
  // a price or a photo and have the change go live, which is what editing
  // means everywhere else she has ever used a phone.

  /**
   * THE EDIT LIMIT. Two changes to what the listing IS, then no more.
   *
   * `countsAsEdit` compares values rather than keys, because this form posts
   * the whole product on every save: opening the screen, changing nothing and
   * pressing save must not cost her one. Price and stock are outside the
   * count entirely - see EDIT_COUNTED_FIELDS for why.
   *
   * The client disables the button at zero, which is a courtesy. This is the
   * rule.
   */
  const merged = { ...current, ...patch } as Product
  const spendsAnEdit = editsAreLimited(current.status) && countsAsEdit(current, merged)

  if (spendsAnEdit && editsLeft(current) <= 0) {
    res.status(409).json({
      error: 'No edits left',
      messageMr: `या उत्पादनात ${MAX_EDITS} वेळा बदल करून झाले आहेत. किंमत आणि साठा मात्र कधीही बदलता येतो.`,
      editsLeft: 0,
    })
    return
  }

  if (spendsAnEdit) merged.editCount = (current.editCount ?? 0) + 1

  db.products[i] = merged
  save()
  res.json({ product: db.products[i] })
})

/**
 * A SELLER DELETES DRAFTS, AND NOTHING ELSE.
 *
 * Deleting a submitted listing used to free its slot, so one ₹50 pack of five
 * became a rotating shop of as many products as she cared to upload. Now a
 * listing keeps its slot until an admin rejects it or takes it down - see
 * SLOT_CONSUMING. The button is gone from her screen; this is the rule.
 *
 * A draft holds no slot and nobody else has seen it, so that one she may
 * still throw away. It is a real delete, not an `ARCHIVED` tombstone.
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

  if (!sellerMayDelete(db.products[i]!.status)) {
    res.status(403).json({
      error: 'Only a draft can be deleted by the seller',
      messageMr: 'पाठवलेले उत्पादन काढता येत नाही. ते काढायचे असल्यास प्रशासकाशी संपर्क करा.',
    })
    return
  }

  const [gone] = db.products.splice(i, 1)
  save()

  // Best effort, and deliberately not awaited: the record is already gone, the
  // seller is waiting on a phone, and an image left behind is a smaller
  // problem than a delete that appears to hang. This is the only moment we
  // still know the public id, so it is now or never.
  void destroyImage(gone?.imagePublicId)

  const seller = db.sellers.find((s) => s.id === req.auth!.sellerId)!
  const remaining = db.products.filter((p) => p.sellerId === seller.id)
  res.json({ ok: true, slots: slotInfo(seller, remaining) })
})
