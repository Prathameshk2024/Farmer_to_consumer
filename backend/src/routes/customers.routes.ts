import { Router } from 'express'
import { confirmProblem } from '@shared/accountClose.js'
import { requireRole } from '../middleware/auth.js'
import { getDb, save } from '../db/store.js'
import { closeCustomer, openOrdersForCustomer } from '../db/accountClose.js'
import {
  addAddress,
  deleteAddress,
  ensureCustomer,
  updateAddress,
  type AddressInput,
} from '../db/customers.js'

/**
 * HER OWN RECORD
 * ==============
 * Every handler resolves the customer from `req.auth.customerId` - the id
 * inside her signed token - and never from a path parameter or a request body.
 * There is no route here that takes a customer id as input, which is what
 * makes reading somebody else's addresses impossible rather than merely
 * forbidden.
 *
 * An address id IS taken from the path, but it is only ever looked up inside
 * her own array. A guessed id belonging to another customer returns 404,
 * indistinguishable from one that does not exist.
 */
export const customersRouter: Router = Router()

customersRouter.use(requireRole('customer'))

/** Her record, created empty the first time she is seen. */
customersRouter.get('/me', (req, res) => {
  const auth = req.auth!
  const customer = ensureCustomer(getDb(), auth.customerId!, auth.phone ?? '')
  save()
  res.json({ customer })
})

customersRouter.patch('/me', (req, res) => {
  const auth = req.auth!
  const name = String(req.body?.name ?? '').trim()
  if (!name) {
    res.status(400).json({ error: 'Name required', messageMr: 'नाव टाका' })
    return
  }

  const customer = ensureCustomer(getDb(), auth.customerId!, auth.phone ?? '', name)
  save()
  res.json({ customer })
})

/** Shared shape check, so a bad pincode fails the same way everywhere. */
function readAddress(body: unknown): { input: AddressInput } | { error: string; messageMr: string } {
  const b = (body ?? {}) as Record<string, unknown>
  const line = String(b.line ?? '').trim()
  const pincode = String(b.pincode ?? '').trim()

  if (!line) return { error: 'Address required', messageMr: 'पत्ता टाका' }
  if (!/^\d{6}$/.test(pincode)) {
    return { error: 'Pincode must be 6 digits', messageMr: 'पिनकोड 6 अंकी हवा' }
  }

  return {
    input: {
      label: b.label === undefined ? undefined : String(b.label),
      line,
      landmark: b.landmark === undefined ? undefined : String(b.landmark),
      city: b.city === undefined ? undefined : String(b.city),
      pincode,
      isDefault: b.isDefault === true,
    },
  }
}

customersRouter.post('/me/addresses', (req, res) => {
  const auth = req.auth!
  const parsed = readAddress(req.body)
  if ('error' in parsed) {
    res.status(400).json(parsed)
    return
  }

  const db = getDb()
  ensureCustomer(db, auth.customerId!, auth.phone ?? '')
  const address = addAddress(db, auth.customerId!, parsed.input)
  save()
  res.status(201).json({ address })
})

customersRouter.patch('/me/addresses/:id', (req, res) => {
  const auth = req.auth!
  const b = (req.body ?? {}) as Record<string, unknown>

  // A patch may be nothing more than "make this one the default", so the full
  // shape check only applies when she is actually editing the address itself.
  const patch: Partial<AddressInput> = {}
  if (b.label !== undefined) patch.label = String(b.label)
  if (b.line !== undefined) patch.line = String(b.line).trim()
  if (b.landmark !== undefined) patch.landmark = String(b.landmark)
  if (b.city !== undefined) patch.city = String(b.city)
  if (b.isDefault === true) patch.isDefault = true
  if (b.pincode !== undefined) {
    const pincode = String(b.pincode).trim()
    if (!/^\d{6}$/.test(pincode)) {
      res.status(400).json({ error: 'Pincode must be 6 digits', messageMr: 'पिनकोड 6 अंकी हवा' })
      return
    }
    patch.pincode = pincode
  }
  if (patch.line !== undefined && !patch.line) {
    res.status(400).json({ error: 'Address required', messageMr: 'पत्ता टाका' })
    return
  }

  const address = updateAddress(getDb(), auth.customerId!, req.params.id, patch)
  if (!address) {
    res.status(404).json({ error: 'Address not found', messageMr: 'पत्ता सापडला नाही' })
    return
  }

  save()
  res.json({ address })
})

customersRouter.delete('/me/addresses/:id', (req, res) => {
  const auth = req.auth!

  if (!deleteAddress(getDb(), auth.customerId!, req.params.id)) {
    res.status(404).json({ error: 'Address not found', messageMr: 'पत्ता सापडला नाही' })
    return
  }

  save()
  res.json({ ok: true })
})

/**
 * Delete this buyer's account.
 *
 * No week to think it over, unlike a seller: what a buyer loses is a name and
 * a list of addresses, and her account is her phone number, so signing in
 * again gives her a new empty one rather than this one back.
 *
 * Refused while an order is on its way, because the seller on the other end
 * has cooked or packed for it and needs an address to deliver to.
 */
customersRouter.post('/me/close', (req, res) => {
  const auth = req.auth!
  const db = getDb()
  const phone = auth.phone ?? ''

  const problem = confirmProblem(phone, req.body?.confirm)
  if (problem) {
    res.status(400).json({ error: 'Confirmation failed', messageMr: problem, fields: { confirm: problem } })
    return
  }

  const open = openOrdersForCustomer(db, auth.customerId!, phone)
  if (open.length > 0) {
    res.status(409).json({
      error: 'Open orders',
      messageMr: 'सुरू असलेली ऑर्डर पूर्ण झाल्यावर खाते बंद करता येईल.',
      openOrders: open.map((o) => ({ id: o.id, status: o.status })),
    })
    return
  }

  closeCustomer(db, auth.customerId!, phone)
  save()
  res.json({ ok: true })
})
