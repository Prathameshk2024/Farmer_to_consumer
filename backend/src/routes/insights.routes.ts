import { Router } from 'express'
import { requireRole } from '../middleware/auth.js'
import { getDb } from '../db/store.js'
import { UNITS, type Unit } from '@shared/produce.js'
import { cropById } from '@shared/crops.js'
import { DATA_GOV_IN_API_KEY } from '../config.js'
import { mandiPrice, perUnitFromQuintal, platformPrice } from '../insights/price.js'

export const insightsRouter: Router = Router()

insightsRouter.get('/price', requireRole('farmer'), async (req, res) => {
  const cropId = String(req.query.cropId ?? '')
  const unit = String(req.query.unit ?? '') as Unit
  if (!cropById(cropId) || !UNITS.includes(unit)) {
    res.status(400).json({ error: 'Bad crop or unit', messageMr: 'पीक आणि एकक निवडा' }); return
  }
  const platform = platformPrice(getDb(), cropId, unit)
  const m = DATA_GOV_IN_API_KEY ? await mandiPrice(cropId) : undefined
  const price = m && perUnitFromQuintal(m.perQuintal, unit)
  res.json({ platform, mandi: m && price !== undefined ? { market: m.market, date: m.date, price } : undefined })
})
