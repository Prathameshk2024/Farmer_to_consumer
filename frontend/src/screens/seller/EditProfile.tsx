import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Seller } from '@shared/types.js'
import { EDUCATION_LEVELS } from '@shared/seller.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { api, ApiError } from '../../lib/api.js'
import { useToast } from '../../store/ToastContext.js'
import PhotoPicker from '../../components/PhotoPicker.js'
import {
  AppBar, Button, Card, Field, Loading, Notice, SectionTitle,
  TextInput, VoiceInput, useAsync,
} from '../../components/ui.js'
import { IconBack } from '../../components/icons.js'

/**
 * EDITING HER OWN DETAILS, AFTER REGISTRATION
 * ===========================================
 * Registration was a one-way door. Everything she typed on those six screens -
 * her name, her shop's name, the description a customer reads, her payment QR -
 * was fixed the moment she pressed submit, and a woman who mistyped her shop
 * name had no way to correct it from inside the app.
 *
 * WHAT IS NOT HERE, AND WHY
 * The server's allow-list on PATCH /sellers/me is what actually decides this;
 * the form only offers what that list already accepts. Missing on purpose:
 *
 *  - her PHONE, because it is her account. Changing it is changing who you
 *    are signed in as, and that needs an OTP on the new number, not a text box;
 *  - her VILLAGE and her SMB ID, because the ID is printed on her packaging
 *    and her poster. Re-issuing it silently would leave the number on a jar in
 *    somebody's kitchen pointing at nothing;
 *  - her STATUS and her SLOTS, which are the admin's to grant. A form that
 *    could set those would be a form that grants itself a subscription.
 *
 * Her UPI id is editable, and the server clears `upiVerified` when it changes.
 */
export default function EditProfile() {
  const t = useT()
  const { lang } = useI18n()
  const nav = useNavigate()
  const { toast } = useToast()
  const [me, loading] = useAsync(() => api.me(), [])

  const [form, setForm] = useState<null | {
    name: string
    shopName: string
    about: string
    whatsapp: string
    age: string
    education: string
    shgName: string
    yearsInBusiness: string
    monthlyCapacity: string
    upiId: string
    upiQrUrl: string
  }>(null)

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  if (loading || !me) {
    return <><AppBar title={t('prof.edit')} backTo="/seller/profile" /><div className="screen"><Loading /></div></>
  }

  const seller: Seller = me.seller

  // Seeded from the record on first render, not from a useEffect: the fetch has
  // already resolved by the time this runs, and an effect would flash an empty
  // form first.
  const f = form ?? {
    name: seller.name,
    shopName: seller.shopName,
    about: seller.about ?? '',
    whatsapp: seller.whatsapp ?? '',
    age: seller.age ? String(seller.age) : '',
    education: seller.education ?? '',
    shgName: seller.shgName ?? '',
    yearsInBusiness: seller.yearsInBusiness != null ? String(seller.yearsInBusiness) : '',
    monthlyCapacity: seller.monthlyCapacity != null ? String(seller.monthlyCapacity) : '',
    upiId: seller.upiId,
    upiQrUrl: seller.upiQrUrl ?? '',
  }

  const set = (k: keyof typeof f, v: string) => {
    setForm({ ...f, [k]: v })
    setErrors((e) => ({ ...e, [k]: '' }))
    setSaved(false)
  }

  async function save() {
    const e: Record<string, string> = {}
    if (!f.name.trim()) e.name = t('common.required')
    if (!f.shopName.trim()) e.shopName = t('common.required')
    if (f.age && (Number(f.age) < 18 || Number(f.age) > 90)) e.age = '18 - 90'
    setErrors(e)
    if (Object.keys(e).length) return

    setBusy(true)
    setErr('')
    try {
      await api.updateMe({
        name: f.name.trim(),
        shopName: f.shopName.trim(),
        about: f.about.trim() || undefined,
        whatsapp: f.whatsapp || undefined,
        age: f.age ? Number(f.age) : undefined,
        education: f.education || undefined,
        shgName: f.shgName.trim() || undefined,
        yearsInBusiness: f.yearsInBusiness ? Number(f.yearsInBusiness) : undefined,
        monthlyCapacity: f.monthlyCapacity ? Number(f.monthlyCapacity) : undefined,
        upiId: f.upiId.trim(),
        upiQrUrl: f.upiQrUrl || undefined,
        upiQrReady: !!f.upiQrUrl,
      })
      setSaved(true)
      toast(t('ok.profileSaved'))
    } catch (error) {
      if (error instanceof ApiError) {
        setErr(error.messageMr ?? error.message)
        if (error.fields) setErrors(error.fields)
      } else {
        setErr('Network error')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AppBar title={t('prof.edit')} backTo="/seller/profile" />
      <div className="screen stack">
        {saved && <Notice tone="ok">{t('prof.saved')}</Notice>}
        {err && <Notice tone="danger">{err}</Notice>}

        <Card>
          <SectionTitle>{t('reg.s1')}</SectionTitle>
          <div className="stack-sm">
            <Field label={t('reg.name')} error={errors.name} required>
              <VoiceInput value={f.name} onChange={(v) => set('name', v)} error={!!errors.name} />
            </Field>
            <Field label={t('reg.age')} error={errors.age} htmlFor="age">
              <TextInput
                id="age" inputMode="numeric" maxLength={2} value={f.age}
                error={!!errors.age}
                onChange={(e) => set('age', e.target.value.replace(/[^0-9]/g, ''))}
              />
            </Field>
            <Field label={t('reg.education')}>
              <div className="wrap-row">
                {EDUCATION_LEVELS.map((lv) => (
                  <button
                    key={lv.value}
                    className={`chip ${f.education === lv.value ? 'chip--on' : ''}`}
                    onClick={() => set('education', lv.value)}
                  >
                    {lang === 'mr' ? lv.mr : lv.en}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={`${t('reg.whatsapp')} (${t('common.optional')})`} htmlFor="wa">
              <TextInput
                id="wa" inputMode="numeric" maxLength={10} value={f.whatsapp}
                onChange={(e) => set('whatsapp', e.target.value.replace(/[^0-9]/g, ''))}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <SectionTitle>{t('prof.business')}</SectionTitle>
          <div className="stack-sm">
            <Field label={t('reg.shopName')} error={errors.shopName} required>
              <VoiceInput value={f.shopName} onChange={(v) => set('shopName', v)} error={!!errors.shopName} />
            </Field>
            <Field label={t('reg.about')} hint={t('reg.aboutHint')}>
              <VoiceInput value={f.about} onChange={(v) => set('about', v)} multiline />
            </Field>
            <Field label={t('reg.shgName')}>
              <VoiceInput value={f.shgName} onChange={(v) => set('shgName', v)} />
            </Field>
            <div className="row" style={{ gap: 'var(--s3)', alignItems: 'flex-start' }}>
              <Field label={t('reg.years')} htmlFor="yrs">
                <TextInput
                  id="yrs" inputMode="numeric" maxLength={2} value={f.yearsInBusiness}
                  onChange={(e) => set('yearsInBusiness', e.target.value.replace(/[^0-9]/g, ''))}
                />
              </Field>
              <Field label={t('reg.capacity')} htmlFor="cap">
                <TextInput
                  id="cap" inputMode="numeric" value={f.monthlyCapacity}
                  onChange={(e) => set('monthlyCapacity', e.target.value.replace(/[^0-9]/g, ''))}
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle>{t('prof.payment')}</SectionTitle>
          <div className="stack-sm">
            {/* Changing this clears her verified mark on the server, which is
                the point: an unverified handle must not look checked. */}
            <Field label={t('reg.upiLabel')} hint={t('reg.upiWhere')} error={errors.upiId} htmlFor="upi">
              <TextInput
                id="upi" value={f.upiId} error={!!errors.upiId}
                autoCapitalize="none" autoCorrect="off" spellCheck={false}
                onChange={(e) => set('upiId', e.target.value.trim())}
              />
            </Field>
            <Field label={t('reg.upiQr')} hint={t('reg.upiQrHint')}>
              <PhotoPicker
                imageUrl={f.upiQrUrl || undefined}
                onUploaded={(img) => set('upiQrUrl', img.url)}
                onCleared={() => set('upiQrUrl', '')}
              />
            </Field>
          </div>
        </Card>

        {/* What she cannot change here, said plainly rather than left as a
            missing field she hunts for. */}
        <Notice tone="info">{t('prof.editLocked')}</Notice>
      </div>

      <div className="actionbar">
        <div className="btn-row">
          <Button variant="quiet" onClick={() => nav('/seller/profile')}>
            <IconBack aria-hidden="true" /> {t('common.back')}
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      </div>
    </>
  )
}
