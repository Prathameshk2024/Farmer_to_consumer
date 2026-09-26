/** Roughly India. A phone that reports 0,0 or a VPN's Europe is not a farm here. */
export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98
}

export function roundCoord(n: number, places = 2): number {
  const f = 10 ** places
  return Math.round(n * f) / f
}

/**
 * What a buyer may see: about a kilometre, and only with the farmer's yes.
 * Two decimals is the village, not the house.
 */
export function publicLocation(p: { lat?: number; lng?: number; locationConsent?: boolean }):
  { lat: number; lng: number } | undefined {
  if (!p.locationConsent || !isValidLatLng(p.lat, p.lng)) return undefined
  return { lat: roundCoord(p.lat!), lng: roundCoord(p.lng!) }
}
