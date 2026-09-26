import { useState } from 'react'
import { useT } from '../i18n/I18nProvider.js'
import { api, type ImpactReport } from '../lib/api.js'
import { rupees, when } from '../lib/format.js'
import { TopBar } from '../components/Shell.js'
import {
  Button, Card, ErrorNote, Loading, SectionTitle, useAsync,
} from '../components/ui.js'

/**
 * The numbers a funder or a government department asks for.
 *
 * The API builds this so nobody assembles "N women, ₹X earned, Y villages" by
 * hand every month. The screen's job is to make them copyable, not pretty -
 * so there is a button that puts the whole thing on the clipboard as text
 * that can be pasted straight into a report.
 */
export function Impact() {
  const t = useT()
  const [data, loading, error] = useAsync(() => api.impact(), [])
  const [copied, setCopied] = useState(false)

  if (loading) return <><TopBar title={t('im.title')} /><Loading /></>
  if (error) return <><TopBar title={t('im.title')} /><div className="body"><ErrorNote error={error} /></div></>

  const r = data!
  const top = Math.max(1, ...r.byVillage.map((v) => v.earned))

  async function copy() {
    try {
      await navigator.clipboard.writeText(asReportText(r, t))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked - the numbers are on screen to read anyway */
    }
  }

  return (
    <>
      <TopBar title={t('im.title')} sub={t('im.sub')} />
      <div className="body stack">

        <div className="tiles">
          <Tile n={r.totals.women} label={t('im.women')} />
          <Tile n={r.totals.activeWomen} label={t('im.activeWomen')} />
          <Tile n={r.totals.womenWithEarnings} label={t('im.womenEarning')} />
          <Tile n={rupees(r.totals.earned)} label={t('im.earned')} />
          <Tile n={r.totals.orders} label={t('im.orders')} />
          <Tile n={r.totals.villages} label={t('im.villages')} />
        </div>

        <section>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <SectionTitle>{t('im.byVillage')}</SectionTitle>
            <Button variant="quiet" small onClick={() => void copy()}>
              {copied ? t('im.copied') : t('im.copy')}
            </Button>
          </div>

          <Card flush>
            <div className="tablewrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>{t('se.village')}</th>
                    <th className="right">{t('im.women')}</th>
                    <th className="right">{t('im.earned')}</th>
                    <th style={{ width: '38%' }} />
                  </tr>
                </thead>
                <tbody>
                  {r.byVillage.map((v) => (
                    <tr key={v.code}>
                      {/* Village names as stored - Marathi stays Marathi. */}
                      <td>{v.village}</td>
                      <td className="right num">{v.women}</td>
                      <td className="right num">{rupees(v.earned)}</td>
                      <td>
                        <div className="bar__track">
                          <div className="bar__fill" style={{ width: `${Math.round((v.earned / top) * 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        <div className="small dim-2">{t('im.generatedAt')}: {when(r.generatedAt)}</div>
      </div>
    </>
  )
}

function Tile({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="tile">
      <div className="tile__n">{n}</div>
      <div className="tile__l">{label}</div>
    </div>
  )
}

/** Plain text, in whichever language is on screen, ready to paste. */
function asReportText(r: ImpactReport, t: (k: string) => string): string {
  const lines = [
    `${t('im.women')}: ${r.totals.women}`,
    `${t('im.activeWomen')}: ${r.totals.activeWomen}`,
    `${t('im.womenEarning')}: ${r.totals.womenWithEarnings}`,
    `${t('im.earned')}: ${rupees(r.totals.earned)}`,
    `${t('im.orders')}: ${r.totals.orders}`,
    `${t('im.villages')}: ${r.totals.villages}`,
    '',
    t('im.byVillage'),
    ...r.byVillage.map((v) => `  ${v.village}: ${v.women} · ${rupees(v.earned)}`),
    '',
    `${t('im.generatedAt')}: ${when(r.generatedAt)}`,
  ]
  return lines.join('\n')
}
