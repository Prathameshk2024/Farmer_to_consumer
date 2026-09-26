import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FdriBand } from '@shared/fdri.js'
import { cropById } from '@shared/crops.js'
import { useI18n, useT } from '../i18n/I18nProvider.js'
import { api } from '../lib/api.js'
import { TopBar } from '../components/Shell.js'
import { IconMap } from '../components/icons.js'
import { Card, EmptyState, ErrorNote, Loading, useAsync } from '../components/ui.js'

// Leaflet is loaded only when somebody opens the map.
const MapView = lazy(() => import('../components/MapView.js'))

/**
 * The programme's field map: every farmer who gave a location, at the exact
 * point, and every survey record once survey entry exists. Filtered by crop,
 * village and FDRI band, to find where training should go first.
 */
export function MapScreen() {
  const t = useT()
  const nav = useNavigate()
  const { lang } = useI18n()
  const [data, loading, error] = useAsync(() => api.map(), [])
  const [crop, setCrop] = useState('')
  const [village, setVillage] = useState('')
  const [band, setBand] = useState<FdriBand | ''>('')

  // Memoised so the pin list below only changes when a filter or the data does.
  const farmers = useMemo(() => data?.farmers ?? [], [data])
  const surveys = useMemo(() => data?.surveys ?? [], [data])
  const crops = [...new Set(farmers.flatMap((f) => f.crops))]
  const villages = [...new Set([...farmers, ...surveys].map((x) => x.village).filter(Boolean))].sort()

  const pins = useMemo(() => {
    const keep = (x: { village: string; fdriBand: FdriBand }) =>
      (!village || x.village === village) && (!band || x.fdriBand === band)
    return [
      ...farmers.filter((f) => keep(f) && (!crop || f.crops.includes(crop)))
        .map((f) => ({ id: `f:${f.id}`, lat: f.lat, lng: f.lng, label: `${f.name} · ${f.village}`, tone: 'primary' as const })),
      // A survey record has no crops field, so a crop filter leaves only farmers.
      ...(crop ? [] : surveys.filter(keep)
        .map((s) => ({ id: `s:${s.id}`, lat: s.lat, lng: s.lng, label: `${t('map.legendSurvey')} · ${s.village}`, tone: 'accent' as const }))),
    ]
  }, [farmers, surveys, crop, village, band, t])

  const open = useCallback((id: string) => {
    if (id.startsWith('f:')) nav(`/farmers/${id.slice(2)}`)
  }, [nav])

  const cropName = (id: string) => { const c = cropById(id); return c ? (lang === 'mr' ? c.mr : c.en) : id }

  return (
    <>
      <TopBar title={t('map.title')} sub={data ? `${pins.length}` : undefined} />
      <div className="body stack">
        <div className="row wrap">
          <select className="select" style={{ maxWidth: 240 }} value={crop} onChange={(e) => setCrop(e.target.value)} aria-label={t('pr.crop')}>
            <option value="">{t('map.allCrops')}</option>
            {crops.map((c) => <option key={c} value={c}>{cropName(c)}</option>)}
          </select>
          <select className="select" style={{ maxWidth: 240 }} value={village} onChange={(e) => setVillage(e.target.value)} aria-label={t('se.village')}>
            <option value="">{t('map.allVillages')}</option>
            {villages.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select className="select" style={{ maxWidth: 240 }} value={band} onChange={(e) => setBand(e.target.value as FdriBand | '')} aria-label={t('se.fdri')}>
            <option value="">{t('se.fdriAll')}</option>
            {(['low', 'moderate', 'high'] as const).map((b) => (
              <option key={b} value={b}>{t('se.fdri')}: {t(`fdri.band.${b}`)}</option>
            ))}
          </select>
        </div>

        {/* Colour is never the only signal: each swatch sits beside its word. */}
        <div className="row wrap small" aria-label={t('map.legend')}>
          <span className="row"><Swatch colour="var(--primary)" /> {t('map.legendFarmer')}</span>
          <span className="row"><Swatch colour="var(--maroon)" /> {t('map.legendSurvey')}</span>
        </div>

        <ErrorNote error={error} />
        {loading ? (
          <Loading />
        ) : pins.length === 0 ? (
          <Card><EmptyState icon={IconMap} title={t('map.empty')} /></Card>
        ) : (
          <Suspense fallback={<Loading />}>
            <MapView pins={pins} height={520} onSelect={open} label={t('map.title')} />
          </Suspense>
        )}
      </div>
    </>
  )
}

function Swatch({ colour }: { colour: string }) {
  return (
    <span aria-hidden="true" style={{
      display: 'inline-block', width: 14, height: 14, borderRadius: '50%',
      background: colour, border: '2px solid #fff', boxShadow: '0 0 0 1px var(--line-2)',
    }} />
  )
}
