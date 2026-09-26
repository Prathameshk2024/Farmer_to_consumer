import { Suspense, lazy, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cropById } from '@shared/crops.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { api, type MapPinRow } from '../../lib/api.js'
import { AppBar, Button, Card, EmptyState, Loading, SectionTitle, useAsync } from '../../components/ui.js'
import { IconMap, IconNext } from '../../components/icons.js'

// Leaflet is ~40KB gzipped and only this screen needs it.
const MapView = lazy(() => import('../../components/MapView.js'))

/**
 * Farmers near the buyer, on a map and in a list. The list is the same pins
 * as text, because a map alone fails anyone who cannot read one. Points are
 * the rounded public ones - the village, not the house.
 */
export default function FarmerMap() {
  const t = useT()
  const nav = useNavigate()
  const { lang } = useI18n()
  const [categoryId, setCategoryId] = useState('')
  const [selected, setSelected] = useState<string>()

  const [cats] = useAsync(() => api.categories(), [], 'categories')
  const [data, loading] = useAsync(() => api.mapPins(categoryId || undefined), [categoryId], `map:${categoryId}`)
  const rows = data?.pins ?? []
  const pins = useMemo(
    () => rows.map((p) => ({ id: p.farmerId, lat: p.lat, lng: p.lng, label: `${p.name} · ${p.village}` })),
    [rows],
  )
  const chosen = rows.find((p) => p.farmerId === selected)

  const crops = (p: MapPinRow) =>
    p.crops.map((id) => cropById(id)).filter(Boolean).map((c) => (lang === 'mr' ? c!.mr : c!.en)).join(', ')

  return (
    <>
      <AppBar title={t('map.title')} backTo="/shop" />
      <div className="screen stack">
        <div className="row wrap" style={{ gap: 8 }}>
          <button type="button" className={`chip ${categoryId ? '' : 'chip--on'}`} onClick={() => { setCategoryId(''); setSelected(undefined) }}>
            {t('map.all')}
          </button>
          {(cats?.categories ?? []).map((c) => (
            <button key={c.id} type="button" className={`chip ${categoryId === c.id ? 'chip--on' : ''}`}
              onClick={() => { setCategoryId(c.id); setSelected(undefined) }}>
              {lang === 'mr' ? c.mr : c.en}
            </button>
          ))}
        </div>

        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <EmptyState icon={IconMap} title={t('map.empty')} />
        ) : (
          <>
            <Suspense fallback={<Loading />}>
              <MapView pins={pins} onSelect={setSelected} label={t('map.title')} />
            </Suspense>

            {chosen && (
              <Card>
                <div style={{ fontWeight: 700 }}>{chosen.name} · {chosen.village}</div>
                {chosen.crops.length > 0 && <div className="small">{crops(chosen)}</div>}
                <Button onClick={() => nav(`/shop/farmer/${chosen.farmerId}`)}>
                  {t('map.openShop')} <IconNext aria-hidden="true" />
                </Button>
              </Card>
            )}

            <SectionTitle>{t('map.listTitle')}</SectionTitle>
            {rows.map((p) => (
              <button key={p.farmerId} type="button" className="card card--tap" style={{ textAlign: 'start' }}
                onClick={() => nav(`/shop/farmer/${p.farmerId}`)}>
                <div style={{ fontWeight: 700 }}>{p.name} · {p.village}</div>
                {p.crops.length > 0 && <div className="small">{crops(p)}</div>}
                <div className="small">{t('map.liveCount', { n: p.liveCount })}</div>
              </button>
            ))}
          </>
        )}
      </div>
    </>
  )
}
