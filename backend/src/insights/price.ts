import type { Db } from '../db/seed.js'
import type { Unit } from '@shared/produce.js'
import { cropById } from '@shared/crops.js'
import { canSellNow } from '@shared/subscription.js'
import { DATA_GOV_IN_API_KEY } from '../config.js'

/**
 * The price hint on the listing form. Advice, never a default: nothing here
 * writes into a price field, and each number travels with its source.
 */

export function median(values: number[]): number | undefined {
  if (!values.length) return undefined
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 100) / 100
}

/** Mandi prices are per quintal (100 kg). Only kg and quintal convert honestly. */
export function perUnitFromQuintal(pricePerQuintal: number, unit: Unit): number | undefined {
  if (unit === 'quintal') return pricePerQuintal
  if (unit === 'kg') return Math.round(pricePerQuintal) / 100
  return undefined
}

const DAY = 86_400_000

/** What others on this platform ask for the same crop in the same unit, plus what sold in the last 30 days. */
export function platformPrice(db: Db, cropId: string, unit: Unit, now = Date.now()) {
  const farmers = new Map(db.farmers.map((f) => [f.id, f]))
  const live = db.products.filter((p) => {
    const f = farmers.get(p.farmerId)
    return p.cropId === cropId && p.unit === unit && p.status === 'LIVE' && !!f && canSellNow(f)
  })
  const productIds = new Set(db.products.filter((p) => p.cropId === cropId && p.unit === unit).map((p) => p.id))
  const recent = db.orders
    .filter((o) => o.status === 'DELIVERED' && now - Date.parse(o.placedAt) <= 30 * DAY)
    .flatMap((o) => o.items.filter((i) => productIds.has(i.productId)).map((i) => i.price))
  return { median: median([...live.map((p) => p.price), ...recent]), listings: live.length, orders: recent.length }
}

/** The most recent record of an Agmarknet response, or nothing for anything else. */
export function parseAgmarknet(json: unknown): { market: string; date: string; modal: number } | undefined {
  const records = (json as { records?: unknown } | null)?.records
  if (!Array.isArray(records)) return undefined
  const rows = records.flatMap((r: Record<string, unknown> | null) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(r?.arrival_date ?? ''))
    const modal = Number(r?.modal_price)
    return m && modal > 0 ? [{ market: String(r?.market ?? ''), date: `${m[3]}-${m[2]}-${m[1]}`, modal }] : []
  })
  return rows.sort((a, b) => b.date.localeCompare(a.date))[0]
}

type Fetcher = (url: string) => Promise<unknown>
const defaultFetcher: Fetcher = async (url) => (await fetch(url, { signal: AbortSignal.timeout(8000) })).json()
type Mandi = { market: string; date: string; perQuintal: number } | undefined
const cache = new Map<string, { at: number; value: Mandi }>()
const SIX_HOURS = 6 * 3_600_000

/**
 * Agmarknet "Current daily price" resource. Filter names are the ones the
 * plan documents (`state.keyword`, `district`, `commodity`); not yet checked
 * against the live feed with a key - update this line if it uses others.
 * District first (the feed may still say Osmanabad), then the state.
 */
function mandiUrls(commodity: string): string[] {
  const base = `https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070?api-key=${DATA_GOV_IN_API_KEY}&format=json&limit=50`
  const c = `&filters%5Bcommodity%5D=${encodeURIComponent(commodity)}`
  const st = '&filters%5Bstate.keyword%5D=Maharashtra'
  return [
    `${base}${c}${st}&filters%5Bdistrict%5D=Dharashiv`,
    `${base}${c}${st}&filters%5Bdistrict%5D=Osmanabad`,
    `${base}${c}${st}`,
  ]
}

/** The latest mandi modal price for a crop. Cached six hours; a failing feed is `undefined`, never a throw. */
export async function mandiPrice(cropId: string, fetcher: Fetcher = defaultFetcher, now = Date.now()): Promise<Mandi> {
  const commodity = cropById(cropId)?.agmarknet
  if (!commodity) return undefined
  const hit = cache.get(cropId)
  if (hit && now - hit.at < SIX_HOURS) return hit.value
  let value: Mandi
  try {
    for (const url of mandiUrls(commodity)) {
      const rec = parseAgmarknet(await fetcher(url))
      if (rec) { value = { market: rec.market, date: rec.date, perQuintal: rec.modal }; break }
    }
  } catch (e) {
    console.warn('[insights] mandi price failed:', (e as Error).message)
  }
  cache.set(cropId, { at: now, value })
  return value
}
