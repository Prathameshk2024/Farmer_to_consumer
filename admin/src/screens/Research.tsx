import { toCsv } from '@shared/csv.js'
import type { ResearchTable } from '@shared/research.js'
import { AGE_GROUPS, EDUCATION_LEVELS } from '@shared/profile.js'
import { useI18n } from '../i18n/I18nProvider.js'
import { api } from '../lib/api.js'
import { TopBar } from '../components/Shell.js'
import { Button, Card, ErrorNote, Loading, SectionTitle, useAsync } from '../components/ui.js'

/** The table headers arrive in English, for the CSV; the screen reads them in the admin's language. */
const HEADER_KEYS: Record<string, string> = {
  'Value': 'res.h.value', 'Count': 'res.h.count', '%': 'res.h.pct', 'Education': 'res.h.education',
  'Respondents': 'res.h.respondents', 'Use any digital tool': 'res.h.digitalUse', 'Band / score': 'res.h.bandScore',
  'FDRI band': 'res.h.band', 'Willing': 'res.h.willing', 'Not willing': 'res.h.notWilling',
  'Total': 'res.h.total', 'Willing %': 'res.h.willingPct',
}

/** Row labels: the fixed words, then the questionnaire's own codes. */
const LABEL_KEYS: Record<string, string> = {
  'not answered': 'res.notAnswered', yes: 'c.yes', no: 'c.no',
  low: 'fdri.band.low', moderate: 'fdri.band.moderate', high: 'fdri.band.high',
}
const CODES: readonly { value: string; mr: string; en: string }[] = [...AGE_GROUPS, ...EDUCATION_LEVELS]

/**
 * The paper's Tables 1-9, straight from the database. The CSV carries the
 * stable codes and English headers the analysis is written against; only the
 * screen translates them.
 */
export function Research() {
  const { t, lang } = useI18n()
  const [data, loading, error] = useAsync(() => api.research(), [])

  const label = (v: string | number) => {
    if (typeof v === 'number') return v
    if (LABEL_KEYS[v]) return t(LABEL_KEYS[v])
    const score = /^score (\d+)$/.exec(v)
    if (score) return t('res.score', { n: score[1] })
    return CODES.find((c) => c.value === v)?.[lang] ?? v
  }

  function download(table: ResearchTable) {
    const url = URL.createObjectURL(new Blob([toCsv(table.headers, table.rows)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `table-${table.id}.csv`
    a.click()
    // Revoking at once can cancel the download before the browser has read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  if (loading) return <><TopBar title={t('res.title')} /><div className="body"><Loading /></div></>
  if (error || !data) return <><TopBar title={t('res.title')} /><div className="body"><ErrorNote error={error} /></div></>

  const { farmers, surveys } = data.n
  return (
    <>
      <TopBar title={t('res.title')} />
      <div className="body stack">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div className="strong">{t('res.respondents', { farmers, surveys, total: farmers + surveys })}</div>
          <Button small onClick={() => data.tables.forEach((table, i) => setTimeout(() => download(table), i * 300))}>{t('res.downloadAll')}</Button>
        </div>

        {data.tables.map((table) => (
          <section key={table.id}>
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <SectionTitle>
                {t('res.tableNo', { n: table.id })}: {table.titleMr} <span className="dim small">· {table.titleEn}</span>
              </SectionTitle>
              <Button variant="quiet" small onClick={() => download(table)}>{t('res.download')}</Button>
            </div>
            <Card flush>
              <div className="tablewrap">
                <table className="t">
                  <thead>
                    <tr>{table.headers.map((h, i) => <th key={h} className={i ? 'right' : ''}>{HEADER_KEYS[h] ? t(HEADER_KEYS[h]) : h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {table.rows.map((r) => (
                      <tr key={String(r[0])}>
                        {r.map((c, i) => <td key={i} className={i ? 'right num' : ''}>{i ? c : label(c)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            {table.id === 9 && <p className="small dim">{t('res.t9Note')}</p>}
          </section>
        ))}
      </div>
    </>
  )
}
