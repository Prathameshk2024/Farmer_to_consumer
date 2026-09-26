import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import type { Seller } from '@shared/types.js'
import { EDUCATION_LEVELS, FSSAI_DIGITS, fssaiProblem, isValidPincode, isValidUpi } from '@shared/seller.js'
import { upiProblem } from '@shared/payment.js'
import { VILLAGES, makeWomenBizId, villageCode } from '@shared/womenbiz.js'
import {
  BAND_LABEL, computeReadiness, readinessBand, SELF_REPORTED_FACTORS,
} from '@shared/readiness.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { useAuth } from '../../store/AuthContext.js'
import { api, ApiError } from '../../lib/api.js'
import { useToast } from '../../store/ToastContext.js'
import { clearRegisterTicket, takeRegisterTicket } from './Auth.js'
import { liveTicket } from '../../lib/registerTicket.js'
import {
  clearDraft, EMPTY, readDraft, sessionStore, writeDraft, type Draft,
} from './sellerDraft.js'
import PhotoPicker from '../../components/PhotoPicker.js'
import {
  AppBar, Button, Card, Choice, Dots, Field, Notice,
  TextInput, VoiceInput, YesNo,
} from '../../components/ui.js'
import {
  IconAllClear, IconBack, IconCheck, IconGroup, IconIndividual, IconNext, IconWarn,
} from '../../components/icons.js'

/**
 * SELLER REGISTRATION WIZARD
 * ==========================
 * Six steps, one topic per screen, with progress dots so she can see the end
 * coming. Everything she is asked here comes from the Shantai Mahila Bazar survey design:
 * personal details, village (which becomes her ID), business, digital usage,
 * and where her money arrives.
 *
 * Nothing optional blocks a step. The only hard gates are the fields that are
 * unrecoverable if wrong: the UPI id and the pincode.
 *
 * GOING BACK IS FREE. Every answer lives in one `Draft` that is never cleared
 * between steps, so stepping back, changing one word and coming forward again
 * costs nothing - and the review step links to the screen each answer came
 * from, so a mistake spotted at the end is one tap from being fixed rather
 * than a reason to start over. For a woman filling in six screens on a phone,
 * "I have to do it all again" is where the form gets abandoned.
 */

const STEP_KEYS = ['reg.s1', 'reg.s2', 'reg.s3', 'reg.s4', 'reg.s5', 'reg.s6']


export default function SellerRegister() {
  const t = useT()
  const { lang } = useI18n()
  const nav = useNavigate()
  const { signIn, session } = useAuth()
  const { toast } = useToast()
  const [params] = useSearchParams()
  const phone = params.get('phone') ?? ''

  // Keyed by HER phone, so a field coordinator registering woman after woman
  // on one handset never shows the next one what the last one typed.
  const store = useState(sessionStore)[0]
  const restored = useState(() => readDraft(store, phone))[0]

  const [step, setStep] = useState(restored?.step ?? 0)
  const [d, setD] = useState<Draft>(restored?.d ?? EMPTY)

  useEffect(() => {
    writeDraft(store, phone, step, d)
  }, [store, phone, step, d])

  /* One route, seven screens. A step change is not a navigation, so nothing
     moves the scroll on its own and the next question opened at whatever
     height the last answer left - usually its own foot. */
  useEffect(() => { window.scrollTo(0, 0) }, [step])

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState('')
  const [created, setCreated] = useState<Seller | null>(null)

  /**
   * A woman who is already registered cannot register again.
   *
   * The server refuses it - her number is taken - but she should never see six
   * screens of form before being told. Read once, at mount: the last thing
   * this wizard does is sign her in, and re-reading it after that would pull
   * the screen showing her new SMB ID out from under her.
   */
  const alreadyRegistered = useState(
    () => session?.role === 'seller' && !liveTicket(),
  )[0]

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((cur) => ({ ...cur, [k]: v }))
    setErrors((e) => ({ ...e, [k]: '' }))
  }

  const village = d.villagePreset === '__other__' ? d.villageOther : d.villagePreset

  // Preview her ID live, so the thing that goes on her packaging is not a
  // surprise at the end.
  const previewId = useMemo(
    () => (village ? makeWomenBizId(village, []) : ''),
    [village],
  )

  // Baseline score: self-reported answers only. The four measured factors stay
  // at zero until she actually does them on the platform.
  const answered = SELF_REPORTED_FACTORS.filter((f) => d.digital[f.key] !== undefined).length
  const score = computeReadiness({
    smartphone: !!d.digital.smartphone,
    internet: !!d.digital.internet,
    upi: !!d.digital.upi,
    whatsappBusiness: !!d.digital.whatsappBusiness,
    socialMedia: !!d.digital.socialMedia,
    digitalMarketing: !!d.digital.digitalMarketing,
  })

  function validate(which: number): boolean {
    const e: Record<string, string> = {}
    if (which === 0) {
      if (!d.name.trim()) e.name = t('common.required')
      if (d.age && (Number(d.age) < 18 || Number(d.age) > 90)) e.age = '18 - 90'
    }
    if (which === 1) {
      if (!village.trim()) e.villagePreset = t('common.required')
      if (!isValidPincode(d.pincode)) e.pincode = t('reg.pincodeHint')
    }
    if (which === 2) {
      if (!d.shopName.trim()) e.shopName = t('common.required')
      if (d.sellsFood === null) e.sellsFood = t('common.required')
      // Blank is fine. Wrong is not - see fssaiProblem.
      const fssai = d.sellsFood ? fssaiProblem(d.fssai) : null
      if (fssai) e.fssai = fssai
    }
    if (which === 3 && answered < SELF_REPORTED_FACTORS.length) {
      e.digital = t('common.required')
    }
    // The reason, not the example again. "उदा. sunita@ybl" under a box she
    // has already filled in tells her nothing about what she got wrong.
    if (which === 4) {
      const upiFault = upiProblem(d.upiId)
      if (upiFault) e.upiId = upiFault
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function next() {
    if (!validate(step)) return
    setStep((s) => Math.min(STEP_KEYS.length - 1, s + 1))
  }

  /**
   * Going back never validates and never clears an answer. It does clear the
   * error markers, because a red box on a screen she is only revisiting reads
   * as a new problem she has just caused.
   */
  function goToStep(target: number) {
    setErrors({})
    setStep(Math.max(0, Math.min(STEP_KEYS.length - 1, target)))
  }

  function back() {
    // Step 0 goes HOME, not to the phone screen. She is holding a live ticket
    // that already proves this number; the phone screen's only button spends
    // another OTP, which is precisely the waste back was causing.
    if (step === 0) nav('/')
    else goToStep(step - 1)
  }

  async function submit() {
    setBusy(true)
    setServerError('')
    try {
      const res = await api.registerSeller({
        // The server reads her phone number out of this and ignores anything
        // the body claims, so registration cannot be aimed at a number whose
        // OTP was never passed.
        ticket: takeRegisterTicket(),
        name: d.name.trim(),
        age: d.age ? Number(d.age) : undefined,
        education: d.education || undefined,
        whatsapp: d.whatsapp || undefined,
        village: village.trim(),
        taluka: d.taluka.trim(),
        district: d.district.trim(),
        pincode: d.pincode.trim(),
        shopName: d.shopName.trim(),
        about: d.about.trim() || undefined,
        businessType: d.businessType,
        shgName: d.shgName.trim() || undefined,
        yearsInBusiness: d.yearsInBusiness ? Number(d.yearsInBusiness) : undefined,
        monthlyCapacity: d.monthlyCapacity ? Number(d.monthlyCapacity) : undefined,
        sellsFood: !!d.sellsFood,
        fssai: d.sellsFood ? d.fssai || undefined : undefined,
        upiId: d.upiId.trim(),
        upiQrUrl: d.upiQrUrl || undefined,
        upiQrPublicId: d.upiQrPublicId || undefined,
        digital: {
          smartphone: !!d.digital.smartphone,
          internet: !!d.digital.internet,
          upi: !!d.digital.upi,
          whatsappBusiness: !!d.digital.whatsappBusiness,
          socialMedia: !!d.digital.socialMedia,
          digitalMarketing: !!d.digital.digitalMarketing,
        },
      })
      // Spent, and single-use on the server anyway. Not worth leaving behind.
      clearRegisterTicket()
      clearDraft(store, phone)
      signIn(res.session)
      toast(t('ok.registered'))
      setCreated(res.seller)
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
  /* Done - show her the ID and the score, then send her to pay    */
  /* ------------------------------------------------------------ */
  // Registered already, and not mid-wizard: her shop is where she belongs.
  if (alreadyRegistered && !created) return <Navigate to="/seller" replace />

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
              {created.womenBizId}
            </div>
            <p className="small muted" style={{ margin: 0 }}>{t('reg.idNote')}</p>
          </Card>

          <Card>
            <div className="row-between">
              <div>
                <div className="small dim">{t('reg.readinessTitle')}</div>
                <strong style={{ fontSize: 'var(--t-lg)' }}>
                  {created.readinessScore} / 100
                </strong>
              </div>
              <span className="pill pill--info">
                {lang === 'mr'
                  ? BAND_LABEL[created.readinessBand].mr
                  : BAND_LABEL[created.readinessBand].en}
              </span>
            </div>
            <p className="small dim" style={{ marginBottom: 0 }}>{t('reg.readinessNote')}</p>
          </Card>

          <Notice tone="warn">{t('reg.doneNext')}</Notice>
          <Button onClick={() => nav('/seller/subscription', { replace: true })}>
            {t('reg.payNow')}
          </Button>
          <Button variant="quiet" onClick={() => nav('/seller', { replace: true })}>
            {t('biz.title')}
          </Button>
        </div>
      </div>
    )
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
        {/* ---------- 1. about her ------------------------------- */}
        {step === 0 && (
          <>
            <Field label={t('reg.name')} hint={t('reg.nameHint')} error={errors.name} required>
              {/* Voice input: she can say her name rather than type Devanagari. */}
              <VoiceInput
                value={d.name}
                onChange={(v) => set('name', v)}
                error={!!errors.name}
                placeholder={t('ph.fullName')}
              />
            </Field>

            <Field label={t('reg.age')} error={errors.age} htmlFor="age">
              <TextInput
                id="age"
                inputMode="numeric"
                maxLength={2}
                value={d.age}
                error={!!errors.age}
                onChange={(e) => set('age', e.target.value.replace(/\D/g, ''))}
                placeholder="35"
              />
            </Field>

            <Field label={t('reg.education')}>
              <div className="wrap-row">
                {EDUCATION_LEVELS.map((lv) => (
                  <button
                    key={lv.value}
                    className={`chip ${d.education === lv.value ? 'chip--on' : ''}`}
                    onClick={() => set('education', lv.value)}
                  >
                    {lang === 'mr' ? lv.mr : lv.en}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={`${t('reg.whatsapp')} (${t('common.optional')})`} hint={t('reg.whatsappHint')} htmlFor="wa">
              <TextInput
                id="wa"
                inputMode="numeric"
                maxLength={10}
                value={d.whatsapp}
                onChange={(e) => set('whatsapp', e.target.value.replace(/\D/g, ''))}
                placeholder={phone}
              />
            </Field>
          </>
        )}

        {/* ---------- 2. village -> her Shantai Mahila Bazar ID --------------- */}
        {step === 1 && (
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
                    // village, not to the one she is about to say, so they go.
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
                {/* A village that is not on the list is a name she may not know
                    how to spell in Devanagari on a phone keyboard - so she is
                    told, right here, that she can say it instead. */}
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

            {/* Only a listed village fills these in. For any other she has to
                give them herself, so they get the same microphone - one above
                the other, because two boxes with a mic each do not fit across
                a phone. */}
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
                placeholder="413601"
              />
            </Field>
          </>
        )}

        {/* ---------- 3. her business ----------------------------- */}
        {step === 2 && (
          <>
            <Field label={t('reg.shopName')} hint={t('reg.shopNameHint')} error={errors.shopName} required>
              <VoiceInput
                value={d.shopName}
                onChange={(v) => set('shopName', v)}
                error={!!errors.shopName}
                placeholder={t('ph.shopName')}
              />
            </Field>

            <Field label={t('reg.businessType')} required>
              <div className="stack-sm">
                <Choice selected={d.businessType === 'individual'} onSelect={() => set('businessType', 'individual')} icon={<IconIndividual />} title={t('reg.bizIndividual')} />
                <Choice selected={d.businessType === 'shg'} onSelect={() => set('businessType', 'shg')} icon={<IconGroup />} title={t('reg.bizShg')} />
              </div>
            </Field>

            {d.businessType === 'shg' && (
              <Field label={t('reg.shgName')}>
                <VoiceInput value={d.shgName} onChange={(v) => set('shgName', v)} placeholder={t('ph.shgName')} />
              </Field>
            )}

            <div className="row" style={{ gap: 'var(--s3)', alignItems: 'flex-start' }}>
              <Field label={t('reg.years')} htmlFor="yrs">
                <TextInput
                  id="yrs"
                  inputMode="numeric"
                  maxLength={2}
                  value={d.yearsInBusiness}
                  onChange={(e) => set('yearsInBusiness', e.target.value.replace(/\D/g, ''))}
                  placeholder="5"
                />
              </Field>
              <Field label={t('reg.capacity')} hint={t('reg.capacityHint')} htmlFor="cap">
                <TextInput
                  id="cap"
                  inputMode="numeric"
                  value={d.monthlyCapacity}
                  onChange={(e) => set('monthlyCapacity', e.target.value.replace(/\D/g, ''))}
                  placeholder="100"
                />
              </Field>
            </div>

            <Field label={t('reg.about')} hint={t('reg.aboutHint')}>
              <VoiceInput
                value={d.about}
                onChange={(v) => set('about', v)}
                multiline
                placeholder={t('ph.about')}
              />
            </Field>

            <Field label={t('reg.sellsFood')} hint={t('reg.sellsFoodHint')} error={errors.sellsFood} required>
              <YesNo value={d.sellsFood} onChange={(v) => set('sellsFood', v)} />
            </Field>

            {/* Optional, but not labelled so: a field marked "optional" is one
                nearly everybody skips, and a woman who holds a licence gains by
                giving it. No required star either - blank still goes through. */}
            {d.sellsFood && (
              <Field label={t('reg.fssai')} hint={t('reg.fssaiHint')} error={errors.fssai} htmlFor="fssai">
                <TextInput
                  id="fssai"
                  inputMode="numeric"
                  value={d.fssai}
                  error={!!errors.fssai}
                  maxLength={FSSAI_DIGITS}
                  onChange={(e) => set('fssai', e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="12345678901234"
                />
              </Field>
            )}

          </>
        )}

        {/* ---------- 4. digital readiness ------------------------ */}
        {step === 3 && (
          <>
            <div className="stack-sm">
              <h2 className="h2">{t('reg.digitalTitle')}</h2>
              <p className="small muted">{t('reg.digitalHint')}</p>
            </div>

            {SELF_REPORTED_FACTORS.map((f) => (
              <Field key={f.key} label={lang === 'mr' ? f.mr : f.en}>
                <YesNo
                  value={d.digital[f.key] ?? null}
                  onChange={(v) => set('digital', { ...d.digital, [f.key]: v })}
                />
              </Field>
            ))}

            {errors.digital && (
              <div className="field__err">
                <IconWarn aria-hidden="true" /> {errors.digital}
              </div>
            )}

            {answered === SELF_REPORTED_FACTORS.length && (
              <Card>
                <div className="row-between">
                  <div>
                    <div className="small dim">{t('reg.readinessTitle')}</div>
                    <strong style={{ fontSize: 'var(--t-lg)' }}>{score} / 100</strong>
                  </div>
                  <span className="pill pill--info">
                    {lang === 'mr'
                      ? BAND_LABEL[readinessBand(score)].mr
                      : BAND_LABEL[readinessBand(score)].en}
                  </span>
                </div>
                <p className="small dim" style={{ marginBottom: 0 }}>{t('reg.readinessNote')}</p>
              </Card>
            )}
          </>
        )}

        {/* ---------- 5. money in --------------------------------- */}
        {step === 4 && (
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

            {/* Her bank's own QR, photographed. Optional: a working QR can be
                drawn from the UPI id above, and making this a hard gate would
                stop a woman whose phone will not open her bank app right now.
                When she does upload one, the buyer scans HER code. */}
            <Field label={t('reg.upiQr')} hint={t('reg.upiQrHint')}>
              <PhotoPicker
                imageUrl={d.upiQrUrl || undefined}
                onUploaded={(img) => {
                  set('upiQrUrl', img.url)
                  set('upiQrPublicId', img.publicId)
                }}
                onCleared={() => { set('upiQrUrl', ''); set('upiQrPublicId', '') }}
              />
            </Field>
          </>
        )}

        {/* ---------- 6. review ----------------------------------- */}
        {step === 5 && (
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
                <Row label={t('reg.name')} value={d.name} onEdit={() => goToStep(0)} editLabel={t('common.edit')} />
                <Row label={t('reg.age')} value={d.age} onEdit={() => goToStep(0)} editLabel={t('common.edit')} />
                <Row label={t('reg.village')} value={village} onEdit={() => goToStep(1)} editLabel={t('common.edit')} />
                <Row label={t('reg.pincode')} value={d.pincode} onEdit={() => goToStep(1)} editLabel={t('common.edit')} />
                <Row label={t('reg.shopName')} value={d.shopName} onEdit={() => goToStep(2)} editLabel={t('common.edit')} />
                <Row label={t('reg.businessType')} value={t(d.businessType === 'shg' ? 'reg.bizShg' : 'reg.bizIndividual')} onEdit={() => goToStep(2)} editLabel={t('common.edit')} />
                {d.shgName && <Row label={t('reg.shgName')} value={d.shgName} onEdit={() => goToStep(2)} editLabel={t('common.edit')} />}
                {d.yearsInBusiness && <Row label={t('reg.years')} value={`${d.yearsInBusiness} ${t('reg.yearsUnit')}`} onEdit={() => goToStep(2)} editLabel={t('common.edit')} />}
                {d.monthlyCapacity && <Row label={t('reg.capacity')} value={d.monthlyCapacity} onEdit={() => goToStep(2)} editLabel={t('common.edit')} />}
                <Row label={t('reg.sellsFood')} value={d.sellsFood ? t('common.yes') : t('common.no')} onEdit={() => goToStep(2)} editLabel={t('common.edit')} />
                {d.sellsFood && d.fssai && <Row label={t('reg.fssai')} value={d.fssai} onEdit={() => goToStep(2)} editLabel={t('common.edit')} />}
                <Row label={t('reg.upiLabel')} value={d.upiId} onEdit={() => goToStep(4)} editLabel={t('common.edit')} />
              </div>
            </Card>

            <Card>
              <div className="stack-sm small">
                <Row
                  label={t('reg.readinessTitle')}
                  value={`${score} / 100 · ${lang === 'mr' ? BAND_LABEL[readinessBand(score)].mr : BAND_LABEL[readinessBand(score)].en}`}
                  onEdit={() => goToStep(3)}
                  editLabel={t('common.edit')}
                />
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

/**
 * One line of the review card. `onEdit` turns it into the way back to the
 * screen the answer came from, with everything she typed still in place.
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
