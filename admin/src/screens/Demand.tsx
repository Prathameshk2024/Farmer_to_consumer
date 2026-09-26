import { useState } from 'react'
import { cropById } from '@shared/crops.js'
import { useI18n } from '../i18n/I18nProvider.js'
import { api, type DemandRow } from '../lib/api.js'
import { TopBar } from '../components/Shell.js'
import { Card, EmptyState, ErrorNote, Loading, SectionTitle, useAsync } from '../components/ui.js'

const PERIODS = [7, 30, 90]
const ORDERED = 'var(--leaf)'
const LISTED = 'var(--maroon)'

/**
 * Demand against supply, per crop: what buyers ordered in the period beside
 * what is on the shelf now. A plain count drawn as bars, not a forecast.
 *
 * Each crop's pair shares one scale and different crops do not: a pair is in
 * one unit, but kilos of onion and dozens of bananas are not one axis. The
 * value is printed on every bar, and the table under the chart is the same
 * numbers for anyone who cannot read colour.
 */
export function Demand() {
  const { t, lang } = useI18n()
  const [days, setDays] = useState(30)
  const [data, loading, error] = useAsync(() => api.demand(days), [days])

  const crop = (r: DemandRow) => {
    const c = cropById(r.cropId)
    return c ? c[lang] : r.cropId
  }
  const unit = (r: DemandRow) => t(`unit.${r.unit}`)

  return (
    <>
      <TopBar title={t('dm.title')} sub={t('dm.sub')} />
      <div className="body stack">
        <select
          className="select"
          style={{ maxWidth: 240 }}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label={t('dm.period')}
        >
          {PERIODS.map((d) => <option key={d} value={d}>{t('dm.days', { n: d })}</option>)}
        </select>

        {loading ? <Loading /> : error ? <ErrorNote error={error} /> : !data?.rows.length ? (
          <EmptyState title={t('dm.empty')} />
        ) : (
          <>
            <Card>
              <ul className="legend" style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <li><span className="legend__sw" style={{ background: ORDERED }} aria-hidden="true" />{t('dm.ordered')}</li>
                <li><span className="legend__sw" style={{ background: LISTED }} aria-hidden="true" />{t('dm.listed')}</li>
              </ul>
              <div className="stack">
                {data.rows.map((r) => {
                  const top = Math.max(1, r.ordered, r.listed)
                  return (
                    <div key={`${r.cropId}|${r.unit}`}>
                      <div className="small">{crop(r)} · {unit(r)}</div>
                      <Bar value={r.ordered} top={top} color={ORDERED} label={`${t('dm.ordered')}: ${r.ordered} ${unit(r)}`} />
                      <Bar value={r.listed} top={top} color={LISTED} label={`${t('dm.listed')}: ${r.listed} ${unit(r)}`} />
                    </div>
                  )
                })}
              </div>
            </Card>

            <section>
              <SectionTitle>{t('dm.table')}</SectionTitle>
              <Card flush>
                <div className="tablewrap">
                  <table className="t">
                    <thead>
                      <tr>
                        <th>{t('dm.crop')}</th>
                        <th>{t('dm.unit')}</th>
                        <th className="right">{t('dm.ordered')}</th>
                        <th className="right">{t('dm.listed')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((r) => (
                        <tr key={`${r.cropId}|${r.unit}`}>
                          <td>{crop(r)}</td>
                          <td>{unit(r)}</td>
                          <td className="right num">{r.ordered}</td>
                          <td className="right num">{r.listed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          </>
        )}
      </div>
    </>
  )
}

function Bar({ value, top, color, label }: { value: number; top: number; color: string; label: string }) {
  return (
    <div className="row" style={{ alignItems: 'center', gap: 8, marginTop: 4 }} title={label}>
      <div className="bar__track" style={{ flex: 1 }}>
        <div className="bar__fill" style={{ width: `${Math.round((value / top) * 100)}%`, background: color }} />
      </div>
      <span className="num small" style={{ minWidth: 48, textAlign: 'right' }}>{value}</span>
    </div>
  )
}
