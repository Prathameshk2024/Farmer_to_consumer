import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import type { Farmer } from '@shared/types.js'
import { isValidPhone, isValidPincode, isValidUpi, normalizePhone } from '@shared/farmer.js'
import { passwordProblemMr } from '@shared/password.js'
import { PHONE_INPUT_MAX } from '../../lib/phone.js'
import { upiProblem } from '@shared/payment.js'
import { VILLAGES, makeFarmerCode, villageCode } from '@shared/farmerCode.js'
import { FDRI_INDICATORS, FDRI_QUESTIONS, cleanFdri, fdriBand, fdriScore } from '@shared/fdri.js'
import { CROPS } from '@shared/crops.js'
import {
  AGE_GROUPS, EDUCATION_LEVELS, FARMER_TYPES, LANDHOLDINGS, SELLING_CHANNELS, SELLING_PROBLEMS,
} from '@shared/profile.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { useAuth } from '../../store/AuthContext.js'
import { api, ApiError } from '../../lib/api.js'
import { useToast } from '../../store/ToastContext.js'
import {
  clearDraft, EMPTY, readDraft, sessionStore, writeDraft, type Draft,
} from './farmerDraft.js'
import {
  AppBar, Button, Card, Choice, Dots, FdriPill, Field, LocationButton, Notice,
  TextInput, VoiceInput, YesNo,
} from '../../components/ui.js'
import {
  IconAllClear, IconBack, IconCheck, IconNext, IconWarn,
} from '../../components/icons.js'

/**
 * FARMER REGISTRATION WIZARD
 * ==========================
 * Ten steps, one topic per screen, with progress dots so the end is in sight.
 * What is asked comes from the research paper's questionnaire: who the farmer
 * is, where the farm is, what grows there, where the money arrives, and the
 * ten FDRI indicators.
 *
 * Nothing optional blocks a step. The hard gates are the account, the name,
 * the village and pincode, at least one crop, the UPI ID, and an answer to
 * each FDRI question (an unanswered one would be scored as a no that was
 * never given). The location is never required.
 *
 * GOING BACK IS FREE. Every answer lives in one `Draft` that is never cleared
 * between steps, and the review step links to the screen each answer came
 * from, so a mistake spotted at the end is one tap from being fixed rather
 * than a reason to start over.
 */

const STEP_KEYS = [
  'reg.s0', 'reg.s1', 'reg.s2', 'reg.s3', 'reg.s4',
  'reg.s5', 'reg.s6', 'reg.s7', 'reg.s8', 'reg.s9',
]
const S = {
  account: 0, name: 1, place: 2, location: 3, crops: 4,
  upi: 5, about: 6, fdri: 7, market: 8, review: 9,
} as const

/** Add or remove one value from a multi-select list. */
function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

export default function FarmerRegister() {
  const t = useT()
  const { lang } = useI18n()
  const label = (o: { mr: string; en: string }) => o[lang]
  const nav = useNavigate()
  const { signIn, session } = useAuth()
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  // In the URL once step 1 is passed, so a reload finds the draft again.
  const [phone, setPhone] = useState(() => normalizePhone(params.get('phone') ?? ''))
  // Never in the draft: a password does not belong in browser storage. After a
  // reload it is typed again, and submit sends the farmer back here if not.
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')

  // Keyed by the phone being registered, so a field coordinator registering
  // farmer after farmer on one handset never shows the next what the last typed.
  const store = useState(sessionStore)[0]
  const restored = useState(() => readDraft(store, phone))[0]

  const [step, setStep] = useState(restored?.step ?? 0)
  const [d, setD] = useState<Draft>(restored?.d ?? EMPTY)

  useEffect(() => {
    if (isValidPhone(phone)) writeDraft(store, phone, step, d)
  }, [store, phone, step, d])

  /* One route, ten screens. A step change is not a navigation, so nothing
     moves the scroll on its own and the next question opened at whatever
     height the last answer left - usually its own foot. */
  useEffect(() => { window.scrollTo(0, 0) }, [step])

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState('')
  const [created, setCreated] = useState<Farmer | null>(null)

  /**
   * A farmer who is already registered cannot register again.
   *
   * The server refuses it - the number is taken - but ten screens of form
   * should not come first. Read once, at mount: the last thing this wizard
   * does is sign in, and re-reading it after that would pull the screen
   * showing the new farmer code out from under them.
   */
  const alreadyRegistered = useState(() => session?.role === 'farmer')[0]

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((cur) => ({ ...cur, [k]: v }))
    setErrors((e) => ({ ...e, [k]: '' }))
  }

  const village = d.villagePreset === '__other__' ? d.villageOther : d.villagePreset

  // Preview the ID live, so what goes on the packaging is not a surprise at the end.
  const previewId = useMemo(
    () => (village ? makeFarmerCode(village, []) : ''),
    [village],
  )

  const answered = FDRI_INDICATORS.filter((k) => d.fdri[k] !== undefined).length
  const score = fdriScore(d.fdri)

  function validate(which: number): boolean {
    const e: Record<string, string> = {}
    if (which === S.account) {
      if (!isValidPhone(phone)) e.phone = t('onb.phoneInvalid')
      const pw = passwordProblemMr(password)
      if (pw) e.password = pw
      else if (again !== password) e.again = t('auth.mismatch')
    }
    if (which === S.name && !d.name.trim()) e.name = t('common.required')
    if (which === S.place) {
      if (!village.trim()) e.villagePreset = t('common.required')
      if (!isValidPincode(d.pincode)) e.pincode = t('reg.pincodeHint')
    }
    if (which === S.crops && d.crops.length === 0) e.crops = t('reg.cropsRequired')
    // The reason, not the example again. "उदा. sunita@ybl" under a box that
    // is already filled in says nothing about what is wrong with it.
    if (which === S.upi) {
      const upiFault = upiProblem(d.upiId)
      if (upiFault) e.upiId = upiFault
    }
    if (which === S.fdri && answered < FDRI_INDICATORS.length) e.fdri = t('common.required')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function next() {
    if (!validate(step)) return
    if (step === S.account) {
      setPhone(normalizePhone(phone))
      setParams({ phone: normalizePhone(phone) }, { replace: true })
    }
    setStep((s) => Math.min(STEP_KEYS.length - 1, s + 1))
  }

  /**
   * Going back never validates and never clears an answer. It does clear the
   * error markers, because a red box on a screen that is only being revisited
   * reads as a new problem just caused.
   */
  function goToStep(target: number) {
    setErrors({})
    setStep(Math.max(0, Math.min(STEP_KEYS.length - 1, target)))
  }

  function back() {
    // Step 0 goes home: there is nothing before it.
    if (step === 0) nav('/')
    else goToStep(step - 1)
  }

  async function submit() {
    // After a reload the draft is back but the password is not.
    if (!validate(S.account)) { setStep(S.account); return }
    setBusy(true)
    setServerError('')
    const located = d.lat != null && d.lng != null
    try {
      const res = await api.registerFarmer({
        phone,
        password,
        name: d.name.trim(),
        village: village.trim(),
        taluka: d.taluka.trim(),
        district: d.district.trim(),
        pincode: d.pincode.trim(),
        upiId: d.upiId.trim(),
        // Only a point the "use my location" tap produced, and with it the yes.
        ...(located ? { lat: d.lat!, lng: d.lng!, locationConsent: true } : {}),
        crops: d.crops,
        ageGroup: d.ageGroup || undefined,
        education: d.education || undefined,
        landholding: d.landholding || undefined,
        farmerTypes: d.farmerTypes,
        sellingChannels: d.sellingChannels,
        problems: d.problems,
        fdri: cleanFdri(d.fdri),
      })
      clearDraft(store, phone)
      signIn(res.session)
      toast(t('ok.registered'))
      setCreated(res.farmer)
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.messageMr ?? err.message)
        if (err.fields) setErrors(err.fields)
      } else {
        setServerError('Network error')
      }
    } finally {
      setBusy(false)
    }
  }

  /* ------------------------------------------------------------ */
  /* Done - show the ID and the score, then on to the shop         */
  /* ------------------------------------------------------------ */
  // Registered already, and not mid-wizard: the shop is where they belong.
  if (alreadyRegistered && !created) return <Navigate to="/farmer" replace />

  if (created) {
    return (
      <div className="app-shell">
        <div className="screen screen--nonav stack">
          <div className="center stack-sm" style={{ paddingTop: 'var(--s5)' }}>
            <div className="bigstate bigstate--ok" aria-hidden="true"><IconAllClear /></div>
            <h1 className="h1">{t('reg.doneTitle')}</h1>
          </div>

          <Card style={{ textAlign: 'center', borderColor: 'var(--accent)', borderWidth: 2 }}>
            <div className="small dim">{t('reg.yourId')}</div>
            <div
              className="num"
              style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '0.04em', margin: '4px 0' }}
            >
              {created.farmerCode}
            </div>
            <p className="small muted" style={{ margin: 0 }}>{t('reg.idNote')}</p>
          </Card>

          <FdriCard score={created.fdriScore} />

          <Notice tone="warn">{t('biz.pendingVerification')}</Notice>
          <Button onClick={() => nav('/farmer', { replace: true })}>
            {t('biz.title')}
          </Button>
        </div>
      </div>
    )
  }

  const chips = (
    list: readonly { value: string; mr: string; en: string }[],
    chosen: string[],
    onChange: (next: string[]) => void,
  ) => (
    <div className="wrap-row">
      {list.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={chosen.includes(o.value)}
          className={`chip ${chosen.includes(o.value) ? 'chip--on' : ''}`}
          onClick={() => onChange(toggle(chosen, o.value))}
        >
          {label(o)}
        </button>
      ))}
    </div>
  )

  const choices = (
    list: readonly { value: string; mr: string; en: string }[],
    chosen: string,
    onChange: (v: string) => void,
  ) => (
    <div className="stack-sm">
      {list.map((o) => (
        <Choice key={o.value} selected={chosen === o.value} onSelect={() => onChange(o.value)} title={label(o)} />
      ))}
    </div>
  )

  const labelsOf = (list: readonly { value: string; mr: string; en: string }[], values: string[]) =>
    list.filter((o) => values.includes(o.value)).map(label).join(', ')
  const labelOf = (list: readonly { value: string; mr: string; en: string }[], value: string) => {
    const o = list.find((x) => x.value === value)
    return o ? label(o) : ''
  }

  return (
    <div className="app-shell">
      <AppBar
        title={t(STEP_KEYS[step]!)}
        sub={`${t('reg.step')} ${step + 1} ${t('reg.of')} ${STEP_KEYS.length}`}
        onBack={back}
        bell={false}
      />

      <div style={{ padding: '0 var(--s4)' }}>
        <Dots step={step} total={STEP_KEYS.length} />
      </div>

      <div className="screen stack">
        {/* ---------- 0. the account ---------------------------- */}
        {step === S.account && (
          <>
            <Field label={t('auth.phone')} error={errors.phone} required htmlFor="phone">
              <TextInput
                id="phone"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={PHONE_INPUT_MAX}
                value={phone}
                error={!!errors.phone}
                placeholder={t('auth.phonePh')}
                onChange={(e) => { setPhone(e.target.value); setErrors((x) => ({ ...x, phone: '' })) }}
              />
            </Field>
            <Field label={t('auth.password')} hint={t('auth.passwordPh')} error={errors.password} required htmlFor="pw">
              <TextInput
                id="pw"
                type="password"
                autoComplete="new-password"
                value={password}
                error={!!errors.password}
                onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, password: '' })) }}
              />
            </Field>
            <Field label={t('auth.passwordAgain')} error={errors.again} required htmlFor="pw2">
              <TextInput
                id="pw2"
                type="password"
                autoComplete="new-password"
                value={again}
                error={!!errors.again}
                onChange={(e) => { setAgain(e.target.value); setErrors((x) => ({ ...x, again: '' })) }}
              />
            </Field>
          </>
        )}

        {/* ---------- 1. the name -------------------------------- */}
        {step === S.name && (
          <Field label={t('reg.name')} hint={t('reg.nameHint')} error={errors.name} required>
            {/* Voice input: the name can be said rather than typed in Devanagari. */}
            <VoiceInput
              value={d.name}
              onChange={(v) => set('name', v)}
              error={!!errors.name}
              placeholder={t('ph.fullName')}
            />
          </Field>
        )}

        {/* ---------- 2. village -> the farmer code --------------- */}
        {step === S.place && (
          <>
            <Field label={t('reg.village')} error={errors.villagePreset} required>
              <div className="stack-sm">
                {VILLAGES.map((v) => (
                  <Choice
                    key={v.code}
                    selected={d.villagePreset === v.mr}
                    onSelect={() => {
                      set('villagePreset', v.mr)
                      set('taluka', v.taluka)
                      set('district', v.district)
                    }}
                    title={v.mr}
                    sub={v.code}
                  />
                ))}
                <Choice
                  selected={d.villagePreset === '__other__'}
                  onSelect={() => {
                    // A listed village filled these in. They belong to that
                    // village, not to the one about to be said, so they go.
                    if (d.villagePreset !== '__other__') {
                      set('taluka', '')
                      set('district', '')
                    }
                    set('villagePreset', '__other__')
                  }}
                  title={t('reg.villageOther')}
                />
              </div>
            </Field>

            {d.villagePreset === '__other__' && (
              <Field label={t('reg.village')} required>
                {/* A village that is not on the list is a name that may be
                    hard to spell in Devanagari on a phone keyboard - so the
                    farmer is told, right here, that it can be said instead. */}
                <VoiceInput
                  value={d.villageOther}
                  onChange={(v) => set('villageOther', v)}
                  placeholder={t('ph.village')}
                  speakHint
                />
              </Field>
            )}

            {previewId && (
              <Notice tone="ok" title={t('reg.yourId')}>
                <strong className="num" style={{ fontSize: 'var(--t-md)' }}>{previewId}</strong>
                <div className="tiny dim" style={{ marginTop: 2 }}>{t('reg.idNote')}</div>
              </Notice>
            )}

            {/* Only a listed village fills these in. For any other they have
                to be given, so they get the same microphone - one above the
                other, because two boxes with a mic each do not fit across a
                phone. */}
            {d.villagePreset === '__other__' ? (
              <>
                <Field label={t('reg.taluka')}>
                  <VoiceInput value={d.taluka} onChange={(v) => set('taluka', v)} placeholder={t('ph.taluka')} />
                </Field>
                <Field label={t('reg.district')}>
                  <VoiceInput value={d.district} onChange={(v) => set('district', v)} placeholder={t('ph.district')} />
                </Field>
              </>
            ) : (
              <div className="row" style={{ gap: 'var(--s3)', alignItems: 'flex-start' }}>
                <Field label={t('reg.taluka')}>
                  <TextInput value={d.taluka} onChange={(e) => set('taluka', e.target.value)} />
                </Field>
                <Field label={t('reg.district')}>
                  <TextInput value={d.district} onChange={(e) => set('district', e.target.value)} />
                </Field>
              </div>
            )}

            <Field
              label={t('reg.pincode')}
              hint={t('reg.pincodeHint')}
              error={errors.pincode}
              required
              htmlFor="pin"
            >
              <TextInput
                id="pin"
                inputMode="numeric"
                maxLength={6}
                value={d.pincode}
                error={!!errors.pincode}
                onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))}
                placeholder="413603"
              />
            </Field>
          </>
        )}

        {/* ---------- 3. the farm on a map, only with a yes -------- */}
        {step === S.location && (
          <>
            <p style={{ margin: 0 }}>{t('reg.locationWhy')}</p>
            {d.lat != null && d.lng != null ? (
              <>
                <Notice tone="ok"><IconCheck aria-hidden="true" /> {t('reg.locationSaved')}</Notice>
                <Button variant="ghost" onClick={() => { set('lat', null); set('lng', null) }}>
                  {t('reg.locationRemove')}
                </Button>
              </>
            ) : (
              <LocationButton onFound={(p) => { set('lat', p.lat); set('lng', p.lng) }} />
            )}
            {d.lat == null && (
              <Button variant="quiet" onClick={() => goToStep(step + 1)}>{t('common.skip')}</Button>
            )}
          </>
        )}

        {/* ---------- 4. crops ------------------------------------ */}
        {step === S.crops && (
          <Field label={t('reg.crops')} hint={t('reg.pickMany')} error={errors.crops} required>
            {chips(CROPS.map((c) => ({ value: c.id, mr: c.mr, en: c.en })), d.crops, (v) => set('crops', v))}
          </Field>
        )}

        {/* ---------- 5. money in --------------------------------- */}
        {step === S.upi && (
          <>
            <div className="stack-sm">
              <h2 className="h2">{t('reg.upiTitle')}</h2>
              <Notice tone="warn">{t('reg.upiHint')}</Notice>
            </div>

            <Field
              label={t('reg.upiLabel')}
              hint={t('reg.upiWhere')}
              error={errors.upiId}
              required
              htmlFor="upi"
            >
              <TextInput
                id="upi"
                value={d.upiId}
                error={!!errors.upiId}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => set('upiId', e.target.value.trim())}
                placeholder={t('reg.upiPlaceholder')}
              />
            </Field>

            {isValidUpi(d.upiId) && (
              <Notice tone="ok">
                <IconCheck aria-hidden="true" /> <strong className="num">{d.upiId}</strong>
              </Notice>
            )}
          </>
        )}

        {/* ---------- 6. about the farmer ------------------------- */}
        {step === S.about && (
          <>
            <Field label={t('reg.age')}>
              {choices(AGE_GROUPS, d.ageGroup, (v) => set('ageGroup', v))}
            </Field>
            <Field label={t('reg.education')}>
              {choices(EDUCATION_LEVELS, d.education, (v) => set('education', v))}
            </Field>
            <Field label={t('reg.landholding')}>
              {choices(LANDHOLDINGS, d.landholding, (v) => set('landholding', v))}
            </Field>
            <Field label={t('reg.farmerTypes')} hint={t('reg.pickMany')}>
              {chips(FARMER_TYPES, d.farmerTypes, (v) => set('farmerTypes', v))}
            </Field>
          </>
        )}

        {/* ---------- 7. the ten FDRI questions --------------------
            The paper's instrument is a list, so this is the one screen
            with ten questions on it; each row is a single tap. */}
        {step === S.fdri && (
          <>
            <div className="stack-sm">
              <h2 className="h2">{t('reg.fdriTitle')}</h2>
              <p className="small muted">{t('reg.fdriHint')}</p>
            </div>

            {FDRI_INDICATORS.map((k) => (
              <Field key={k} label={FDRI_QUESTIONS[k][lang]}>
                <YesNo
                  value={d.fdri[k] ?? null}
                  onChange={(v) => set('fdri', { ...d.fdri, [k]: v })}
                />
              </Field>
            ))}

            {errors.fdri && (
              <div className="field__err">
                <IconWarn aria-hidden="true" /> {errors.fdri}
              </div>
            )}

            {answered === FDRI_INDICATORS.length && <FdriCard score={score} />}
          </>
        )}

        {/* ---------- 8. how the produce is sold today ------------ */}
        {step === S.market && (
          <>
            <Field label={t('reg.channels')} hint={t('reg.pickMany')}>
              {chips(SELLING_CHANNELS, d.sellingChannels, (v) => set('sellingChannels', v))}
            </Field>
            <Field label={t('reg.problems')} hint={t('reg.pickMany')}>
              {chips(SELLING_PROBLEMS, d.problems, (v) => set('problems', v))}
            </Field>
          </>
        )}

        {/* ---------- 9. review ----------------------------------- */}
        {step === S.review && (
          <>
            <h2 className="h2">{t('reg.reviewTitle')}</h2>
            <p className="small muted" style={{ margin: 0 }}>{t('reg.reviewHint')}</p>

            {previewId && (
              <Card style={{ textAlign: 'center', borderColor: 'var(--accent)', borderWidth: 2 }}>
                <div className="small dim">{t('reg.yourId')}</div>
                <div className="num" style={{ fontSize: '1.4rem', fontWeight: 800 }}>{previewId}</div>
                <div className="tiny dim">{villageCode(village)}</div>
              </Card>
            )}

            <Card>
              <div className="stack-sm small">
                {/* The step each answer belongs to, so "बदला" lands on the
                    screen that asked the question rather than at the start. */}
                <Row label={t('reg.name')} value={d.name} onEdit={() => goToStep(S.name)} editLabel={t('common.edit')} />
                <Row label={t('reg.village')} value={village} onEdit={() => goToStep(S.place)} editLabel={t('common.edit')} />
                <Row label={t('reg.pincode')} value={d.pincode} onEdit={() => goToStep(S.place)} editLabel={t('common.edit')} />
                <Row
                  label={t('reg.location')}
                  value={d.lat != null ? t('reg.locationOn') : t('reg.locationOff')}
                  onEdit={() => goToStep(S.location)}
                  editLabel={t('common.edit')}
                />
                <Row
                  label={t('reg.crops')}
                  value={labelsOf(CROPS.map((c) => ({ value: c.id, mr: c.mr, en: c.en })), d.crops)}
                  onEdit={() => goToStep(S.crops)}
                  editLabel={t('common.edit')}
                />
                <Row label={t('reg.upiLabel')} value={d.upiId} onEdit={() => goToStep(S.upi)} editLabel={t('common.edit')} />
                <Row label={t('reg.age')} value={labelOf(AGE_GROUPS, d.ageGroup)} onEdit={() => goToStep(S.about)} editLabel={t('common.edit')} />
                <Row label={t('reg.education')} value={labelOf(EDUCATION_LEVELS, d.education)} onEdit={() => goToStep(S.about)} editLabel={t('common.edit')} />
                <Row label={t('reg.landholding')} value={labelOf(LANDHOLDINGS, d.landholding)} onEdit={() => goToStep(S.about)} editLabel={t('common.edit')} />
                <Row label={t('reg.farmerTypes')} value={labelsOf(FARMER_TYPES, d.farmerTypes)} onEdit={() => goToStep(S.about)} editLabel={t('common.edit')} />
                <Row
                  label={t('reg.fdriScore')}
                  value={<><span className="num">{score} / 10</span> · {t(`fdri.band.${fdriBand(score)}`)}</>}
                  onEdit={() => goToStep(S.fdri)}
                  editLabel={t('common.edit')}
                />
                <Row label={t('reg.channels')} value={labelsOf(SELLING_CHANNELS, d.sellingChannels)} onEdit={() => goToStep(S.market)} editLabel={t('common.edit')} />
                <Row label={t('reg.problems')} value={labelsOf(SELLING_PROBLEMS, d.problems)} onEdit={() => goToStep(S.market)} editLabel={t('common.edit')} />
              </div>
            </Card>

            {serverError && <Notice tone="danger">{serverError}</Notice>}
          </>
        )}
      </div>

      {/* Back sits beside Next, not only as an arrow in the bar. The arrow is
          easy to miss and easy to read as "leave", which is the difference
          between correcting one answer and abandoning the form. */}
      <div className="actionbar">
        <div className="btn-row">
          <Button variant="quiet" onClick={back}>
            <IconBack aria-hidden="true" /> {t('common.back')}
          </Button>
          {step < STEP_KEYS.length - 1 ? (
            <Button onClick={next}>
              {t('common.next')} <IconNext aria-hidden="true" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={busy}>
              {busy ? t('common.loading') : t('reg.submit')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/** The FDRI score out of ten, with its band as a pill (icon and word). */
function FdriCard({ score }: { score: number }) {
  const t = useT()
  return (
    <Card>
      <div className="row-between">
        <div>
          <div className="small dim">{t('reg.fdriScore')}</div>
          <strong className="num" style={{ fontSize: 'var(--t-lg)' }}>{score} / 10</strong>
        </div>
        <FdriPill band={fdriBand(score)} />
      </div>
      <p className="small dim" style={{ marginBottom: 0 }}>{t('reg.fdriNote')}</p>
    </Card>
  )
}

/**
 * One line of the review card. `onEdit` turns it into the way back to the
 * screen the answer came from, with everything typed still in place.
 */
function Row({
  label, value, onEdit, editLabel,
}: {
  label: string
  value: React.ReactNode
  onEdit?: () => void
  editLabel?: string
}) {
  return (
    <div className="row-between">
      <span className="dim">{label}</span>
      <span className="row" style={{ gap: 'var(--s2)', justifyContent: 'flex-end' }}>
        <span style={{ fontWeight: 600, textAlign: 'right' }}>{value || '—'}</span>
        {onEdit && (
          <button type="button" className="linkbtn" onClick={onEdit}>
            {editLabel}
          </button>
        )}
      </span>
    </div>
  )
}
