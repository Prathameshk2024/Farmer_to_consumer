import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapPin { id: string; lat: number; lng: number; label: string; tone?: 'primary' | 'accent' }

/**
 * OpenStreetMap through Leaflet, imperatively: one map object per mount,
 * pins redrawn when the list changes. Circle markers, not the image pins,
 * because Leaflet's default icon URLs break under a bundler and a circle
 * costs no download. Colours are read from the theme tokens.
 *
 * `pins` and `onSelect` are effect dependencies, so callers pass a memoised
 * list and a stable callback - a fresh array every render would refit the
 * view under the thumb of whoever is panning it.
 *
 * This file is copied byte for byte between frontend/ and admin/.
 */
export default function MapView({ pins, height = 320, onSelect, center = [17.99, 76.23], zoom = 11, label }: {
  pins: MapPin[]; height?: number; onSelect?: (id: string) => void; center?: [number, number]; zoom?: number
  /** Read aloud for the map region; passed in so it goes through the caller's `t()`. */
  label: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map>()
  const layer = useRef<L.LayerGroup>()

  useEffect(() => {
    if (!box.current || map.current) return
    map.current = L.map(box.current, { scrollWheelZoom: false }).setView(center, zoom)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => { map.current?.remove(); map.current = undefined; layer.current = undefined }
  }, [])

  useEffect(() => {
    const g = layer.current; if (!g || !map.current) return
    g.clearLayers()
    const css = getComputedStyle(document.documentElement)
    const colour = {
      primary: css.getPropertyValue('--primary').trim() || '#2e7d32',
      accent: css.getPropertyValue('--maroon').trim() || '#7b1e2e',
    }
    for (const p of pins) {
      L.circleMarker([p.lat, p.lng], { radius: 10, weight: 2, color: '#fff', fillOpacity: 0.9, fillColor: colour[p.tone ?? 'primary'] })
        .bindTooltip(p.label)
        .on('click', () => onSelect?.(p.id))
        .addTo(g)
    }
    if (pins.length) map.current.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng])).pad(0.3), { maxZoom: 13 })
  }, [pins, onSelect])

  return <div ref={box} style={{ height, borderRadius: 'var(--r)', zIndex: 0 }} role="region" aria-label={label} />
}
