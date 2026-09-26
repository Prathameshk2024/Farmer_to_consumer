import { Router } from 'express'
import type { Survey } from '@shared/types.js'
import { FDRI_INDICATORS } from '@shared/fdri.js'
import { isValidPhone, normalizePhone, samePhone } from '@shared/farmer.js'
import { isValidLatLng } from '@shared/geo.js'
import { cropById } from '@shared/crops.js'
import {
  AGE_GROUPS, EDUCATION_LEVELS, FARMER_TYPES, LANDHOLDINGS, SELLING_CHANNELS, SELLING_PROBLEMS, pick, pickMany,
} from '@shared/profile.js'
import { getDb, save } from '../db/store.js'
import { newId } from '../db/ids.js'
import { requireRole } from '../middleware/auth.js'
import { verifierName } from './admin.routes.js'

/**
 * Questionnaires a coordinator types in for farmers without an account.
 * Mounted at /api/admin/surveys from index.ts rather than inside adminRouter,
 * so that this file can borrow `verifierName` without an import cycle; the
 * admin check is repeated here for the same reason.
 */
export const surveysRouter: Router = Router()

surveysRouter.use(requireRole('admin'))

surveysRouter.get('/', (_req, res) => { res.json({ surveys: getDb().surveys }) })

surveysRouter.post('/', (req, res) => {
  const db = getDb()
  const b = req.body ?? {}
  const village = String(b.village ?? '').trim()
  if (!village) { res.status(400).json({ error: 'Village required', messageMr: 'गाव आवश्यक आहे', fields: { village: 'गाव आवश्यक आहे' } }); return }
  const phone = b.phone ? normalizePhone(String(b.phone)) : undefined
  if (phone && !isValidPhone(phone)) { res.status(400).json({ error: 'Bad phone', messageMr: '10 अंकी मोबाईल नंबर टाका', fields: { phone: 'invalid' } }); return }
  const fdriIn = (b.fdri && typeof b.fdri === 'object') ? b.fdri : {}
  // Only answered questions are stored: a skipped one must stay "not answered", not "no".
  const fdri = Object.fromEntries(FDRI_INDICATORS.filter((k) => typeof fdriIn[k] === 'boolean').map((k) => [k, fdriIn[k]]))
  const survey: Survey = {
    id: newId('sv'), village, taluka: String(b.taluka ?? '').trim() || undefined, phone,
    ageGroup: pick(AGE_GROUPS, b.ageGroup), education: pick(EDUCATION_LEVELS, b.education),
    landholding: pick(LANDHOLDINGS, b.landholding), farmerTypes: pickMany(FARMER_TYPES, b.farmerTypes),
    crops: Array.isArray(b.crops) ? [...new Set(b.crops.map(String).filter((c: string) => cropById(c)))] as string[] : [],
    sellingChannels: pickMany(SELLING_CHANNELS, b.sellingChannels), problems: pickMany(SELLING_PROBLEMS, b.problems),
    fdri, ...(isValidLatLng(b.lat, b.lng) ? { lat: b.lat, lng: b.lng } : {}),
    // Only a web address: anything else would be a link nobody should click.
    photoUrl: typeof b.photoUrl === 'string' && /^https:\/\//.test(b.photoUrl) ? b.photoUrl : undefined,
    enteredBy: verifierName(db, req), at: new Date().toISOString(),
  }
  // Same phone already registered as a farmer: link now, count once.
  const farmer = phone ? db.farmers.find((f) => samePhone(f.phone, phone)) : undefined
  if (farmer) survey.linkedFarmerId = farmer.id
  db.surveys.push(survey)
  save()
  res.json({ survey })
})

surveysRouter.post('/:id/link', (req, res) => {
  const db = getDb()
  const s = db.surveys.find((x) => x.id === req.params.id)
  const f = db.farmers.find((x) => x.id === String(req.body?.farmerId ?? ''))
  if (!s || !f) { res.status(404).json({ error: 'Not found', messageMr: 'सापडले नाही' }); return }
  s.linkedFarmerId = f.id
  save()
  res.json({ survey: s })
})

surveysRouter.delete('/:id', (req, res) => {
  const db = getDb()
  const i = db.surveys.findIndex((x) => x.id === req.params.id)
  if (i < 0) { res.status(404).json({ error: 'Not found', messageMr: 'सापडले नाही' }); return }
  db.surveys.splice(i, 1)
  save()
  res.json({ ok: true })
})
