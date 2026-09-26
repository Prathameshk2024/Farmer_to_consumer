import { useEffect, useRef, useState } from 'react'
import type { Survey } from '@shared/types.js'
import { FDRI_INDICATORS, FDRI_QUESTIONS, fdriBand, fdriScore, type FdriIndicator } from '@shared/fdri.js'
import {
  AGE_GROUPS, EDUCATION_LEVELS, FARMER_TYPES, LANDHOLDINGS, SELLING_CHANNELS, SELLING_PROBLEMS,
} from '@shared/profile.js'
import { CROPS } from '@shared/crops.js'
import { useI18n } from '../i18n/I18nProvider.js'
import { api } from '../lib/api.js'
import { when } from '../lib/format.js'
import { TopBar } from '../components/Shell.js'
import { Confirm, useConfirm } from '../components/Confirm.js'
import { IconMap } from '../components/icons.js'
import {
  Button, Card, EmptyState, ErrorNote, FdriBandPill, Field, Loading, Notice, useAsync, useErrorText,
} from '../components/ui.js'

type Opt = { value: string; mr: string; en: string }
const CROP_OPTS: Opt[] = CROPS.map((c) => ({ value: c.id, mr: c.mr, en: c.en }))

/**
 * SURVEY ENTRY
 * ============
 * Paper questionnaires, typed in by a coordinator for farmers who have no
 * account. They feed the research tables beside the registered farmers. A
 * questionnaire whose phone matches a registered farmer is linked on save
 * and counted once, from the farmer's own record.
 */
export function Surveys() {
  const { t } = useI18n()
  const [data, loading, error, reload] = useAsync(() => api.surveys(), [])
  const [farmers] = useAsync(() => api.farmers(), [])
  const [adding, setAdding] = useState(false)

  const surveys = [...(data?.surveys ?? [])].sort((a, b) => b.at.localeCompare(a.at))
  const linked = surveys.filter((s) => s.linkedFarmerId).length
  const farmerName = (id: string) => farmers?.farmers.find((f) => f.id === id)?.name ?? id
  const linkable = (farmers?.farmers ?? []).filter((f) => f.status !== 'CLOSED')

  return (
    <>
      <TopBar title={t('sv.title')} sub={t('sv.count', { n: surveys.length, m: linked })} />
      <div className="body stack">
        <div><Button onClick={() => setAdding(true)}>{t('sv.new')}</Button></div>

        {loading ? <Loading /> : error ? <ErrorNote error={error} /> : !surveys.length ? (
          <EmptyState title={t('sv.empty')} />
        ) : (
          <Card flush>
            <div className="tablewrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>{t('sv.village')}</th>
                    <th>{t('sv.date')}</th>
                    <th>{t('sv.enteredBy')}</th>
                    <th>{t('sv.fdri')}</th>
                    <th>{t('sv.linked')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {surveys.map((s) => (
                    <SurveyRow key={s.id} survey={s} farmerName={farmerName} linkable={linkable} onDone={reload} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {adding && <SurveyForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload() }} />}
    </>
  )
}

function SurveyRow({ survey: s, farmerName, linkable, onDone }: {
  survey: Survey; farmerName: (id: string) => string; linkable: { id: string; name: string; village: string }[]; onDone: () => void
}) {
  const { t } = useI18n()
  const errorText = useErrorText()
  const remove = useConfirm()
  const score = fdriScore(s.fdri)
  const [linkError, setLinkError] = useState('')

  async function link(farmerId: string) {
    if (!farmerId) return
    setLinkError('')
    try {
      await api.linkSurvey(s.id, farmerId)
      onDone()
    } catch (e) {
      setLinkError(errorText(e))
    }
  }

  async function doDelete() {
    remove.setBusy(true)
    try {
      await api.deleteSurvey(s.id)
      remove.close()
      onDone()
    } catch (e) {
      remove.setError(errorText(e))
    } finally {
      remove.setBusy(false)
    }
  }

  return (
    <tr>
      <td>{s.village}{s.taluka ? `, ${s.taluka}` : ''}</td>
      <td className="small">{when(s.at)}</td>
      <td className="small">{s.enteredBy}</td>
      <td><span className="num">{score}/10</span> <FdriBandPill band={fdriBand(score)} /></td>
      <td className="small">
        {s.linkedFarmerId ? farmerName(s.linkedFarmerId) : (
          <>
            <select className="select" aria-label={t('sv.linkTo')} value="" onChange={(e) => void link(e.target.value)}>
              <option value="">{t('sv.linkTo')}</option>
              {linkable.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.village}</option>)}
            </select>
            {linkError && <Notice tone="danger">{linkError}</Notice>}
          </>
        )}
      </td>
      <td>
        {remove.open ? (
          <Confirm
            open
            title={t('sv.delete')}
            description={t('sv.deleteConsequence')}
            confirmLabel={t('sv.delete')}
            tone="danger"
            busy={remove.busy}
            error={remove.error}
            onCancel={remove.close}
            onConfirm={() => void doDelete()}
          />
        ) : (
          <Button variant="quiet" small onClick={remove.ask}>{t('sv.delete')}</Button>
        )}
      </td>
    </tr>
  )
}

type Answer = 'yes' | 'no' | 'skip'

/** The "New survey" form, in a dialog so it opens in view wherever the list is scrolled. */
function SurveyForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useI18n()
  const errorText = useErrorText()
  const ref = useRef<HTMLDialogElement>(null)
  const [f, setF] = useState({
    village: '', taluka: '', phone: '', ageGroup: '', education: '', landholding: '',
    farmerTypes: [] as string[], crops: [] as string[], sellingChannels: [] as string[], problems: [] as string[],
  })
  // Default "not asked": a question the coordinator skipped must not be saved as "no".
  const [fdri, setFdri] = useState<Record<FdriIndicator, Answer>>(
    () => Object.fromEntries(FDRI_INDICATORS.map((k) => [k, 'skip'])) as Record<FdriIndicator, Answer>,
  )
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})

  // No close() in a cleanup - see OrderDetail in Orders.tsx.
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  const toggle = (k: 'farmerTypes' | 'crops' | 'sellingChannels' | 'problems', v: string) =>
    setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }))

  function locate() {
    if (!navigator.geolocation) { setLocError(t('sv.locUnavailable')); return }
    setLocating(true)
    setLocError('')
    navigator.geolocation.getCurrentPosition(
      (p) => { setPoint({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocating(false) },
      () => { setLocError(t('sv.locFailed')); setLocating(false) },
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }

  async function submit() {
    if (!f.village.trim()) { setFields({ village: t('c.required') }); return }
    setBusy(true)
    setError('')
    setFields({})
    try {
      const answered = FDRI_INDICATORS.filter((k) => fdri[k] !== 'skip').map((k) => [k, fdri[k] === 'yes'])
      await api.createSurvey({
        ...f,
        ageGroup: (f.ageGroup || undefined) as Survey['ageGroup'],
        education: (f.education || undefined) as Survey['education'],
        landholding: (f.landholding || undefined) as Survey['landholding'],
        farmerTypes: f.farmerTypes as Survey['farmerTypes'],
        sellingChannels: f.sellingChannels as Survey['sellingChannels'],
        problems: f.problems as Survey['problems'],
        phone: f.phone.trim() || undefined,
        fdri: Object.fromEntries(answered),
        ...(point ?? {}),
      })
      onSaved()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const select = (k: 'ageGroup' | 'education' | 'landholding', label: string, list: readonly Opt[]) => (
    <Field label={label}>
      <select className="select" value={f[k]} onChange={(e) => set(k, e.target.value)}>
        <option value="">{t('sv.notAsked')}</option>
        {list.map((o) => <option key={o.value} value={o.value}>{o[lang]}</option>)}
      </select>
    </Field>
  )

  const checks = (k: 'farmerTypes' | 'crops' | 'sellingChannels' | 'problems', label: string, list: readonly Opt[]) => (
    <fieldset className="optgroup">
      <legend className="field__l">{label}</legend>
      <div className="optgrid">
        {list.map((o) => (
          <label key={o.value} className="row small">
            <input type="checkbox" checked={f[k].includes(o.value)} onChange={() => toggle(k, o.value)} />
            {o[lang]}
          </label>
        ))}
      </div>
    </fieldset>
  )

  return (
    <dialog ref={ref} className="dlg" onClose={onClose}>
      <Card>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="section__t">{t('sv.new')}</h2>
          <Button variant="quiet" small onClick={onClose}>{t('c.close')}</Button>
        </div>
        <div className="stack-sm" style={{ marginTop: 12 }}>
          <Field label={t('sv.village')} error={fields.village}>
            <input className="input" value={f.village} onChange={(e) => set('village', e.target.value)} />
          </Field>
          <Field label={t('sv.taluka')}>
            <input className="input" value={f.taluka} onChange={(e) => set('taluka', e.target.value)} />
          </Field>
          <Field label={t('sv.phone')}>
            <input className="input" inputMode="numeric" value={f.phone} placeholder={t('sv.phoneHint')}
              onChange={(e) => set('phone', e.target.value)} />
          </Field>
          {select('ageGroup', t('sv.ageGroup'), AGE_GROUPS)}
          {select('education', t('sv.education'), EDUCATION_LEVELS)}
          {select('landholding', t('sv.landholding'), LANDHOLDINGS)}
          {checks('farmerTypes', t('sv.farmerTypes'), FARMER_TYPES)}
          {checks('crops', t('sv.crops'), CROP_OPTS)}
          {checks('sellingChannels', t('sv.channels'), SELLING_CHANNELS)}
          {checks('problems', t('sv.problems'), SELLING_PROBLEMS)}

          <fieldset className="optgroup">
            <legend className="field__l">{t('sv.fdriQuestions')}</legend>
            <div className="stack-sm">
              {FDRI_INDICATORS.map((k) => (
                <div key={k}>
                  <div className="small">{FDRI_QUESTIONS[k][lang]}</div>
                  <div className="row small">
                    {(['yes', 'no', 'skip'] as const).map((a) => (
                      <label key={a} className="row" style={{ gap: 4 }}>
                        <input type="radio" name={`fdri-${k}`} checked={fdri[k] === a}
                          onChange={() => setFdri((x) => ({ ...x, [k]: a }))} />
                        {t(a === 'yes' ? 'c.yes' : a === 'no' ? 'c.no' : 'sv.notAsked')}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          <div className="row">
            <Button variant="quiet" small disabled={locating} onClick={locate}>
              <IconMap aria-hidden="true" /> {locating ? t('c.loading') : t('sv.useLocation')}
            </Button>
            {point && <span className="small num">{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</span>}
          </div>
          {locError && <Notice tone="warn">{locError}</Notice>}

          {error && <Notice tone="danger">{error}</Notice>}
          <div>
            <Button disabled={busy} onClick={() => void submit()}>{busy ? t('c.loading') : t('c.save')}</Button>
          </div>
        </div>
      </Card>
    </dialog>
  )
}
