import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { isValidPhone } from '@shared/farmer.js'
import { passwordProblemMr } from '@shared/password.js'
import { useT } from '../../i18n/I18nProvider.js'
import { useAuth } from '../../store/AuthContext.js'
import { api, ApiError } from '../../lib/api.js'
import { useToast } from '../../store/ToastContext.js'
import { AppBar, Button, Field, Notice, TextInput, VoiceInput } from '../../components/ui.js'

/**
 * CUSTOMER REGISTRATION - one screen
 * ==================================
 * Name, phone, password and the password again. The name is not decoration:
 * it is what the farmer reads on the order and what she is called when
 * someone phones her about a delivery - "ग्राहक" on every order tells that
 * farmer nothing.
 */
export default function CustomerRegister() {
  const t = useT()
  const nav = useNavigate()
  const { session, signIn } = useAuth()
  const { toast } = useToast()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState('')
  const [busy, setBusy] = useState(false)

  if (session?.role === 'customer') return <Navigate to="/shop" replace />

  async function submit() {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = t('creg.nameRequired')
    if (!isValidPhone(phone)) e.phone = t('onb.phoneInvalid')
    const pw = passwordProblemMr(password)
    if (pw) e.password = pw
    else if (again !== password) e.again = t('auth.mismatch')
    setErrors(e)
    if (Object.keys(e).length) return

    setServerError('')
    setBusy(true)
    try {
      const res = await api.registerCustomer({ phone, name: name.trim(), password })
      signIn(res.session)
      toast(t('ok.registered'))
      nav('/shop', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.messageMr ?? err.message)
        if (err.fields) setErrors(err.fields)
      } else {
        setServerError(t('auth.failed'))
      }
    } finally {
      setBusy(false)
    }
  }

  const clear = (k: string) => setErrors((x) => ({ ...x, [k]: '' }))

  return (
    <div className="app-shell">
      <AppBar brand title={t('creg.title')} backTo="/" bell={false} />
      <div className="screen screen--nonav stack">
        <Notice tone="info">{t('creg.lede')}</Notice>

        <Field label={t('cus.yourName')} hint={t('creg.nameHint')} error={errors.name} required>
          <VoiceInput
            value={name}
            onChange={(v) => { setName(v); clear('name') }}
            error={!!errors.name}
            placeholder={t('ph.fullName')}
          />
        </Field>
        <Field label={t('auth.phone')} error={errors.phone} required htmlFor="phone">
          <TextInput
            id="phone"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={10}
            value={phone}
            error={!!errors.phone}
            placeholder={t('auth.phonePh')}
            onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '')); clear('phone') }}
          />
        </Field>
        <Field label={t('auth.password')} hint={t('auth.passwordPh')} error={errors.password} required htmlFor="pw">
          <TextInput
            id="pw"
            type="password"
            autoComplete="new-password"
            value={password}
            error={!!errors.password}
            onChange={(e) => { setPassword(e.target.value); clear('password') }}
          />
        </Field>
        <Field label={t('auth.passwordAgain')} error={errors.again} required htmlFor="pw2">
          <TextInput
            id="pw2"
            type="password"
            autoComplete="new-password"
            value={again}
            error={!!errors.again}
            onChange={(e) => { setAgain(e.target.value); clear('again') }}
          />
        </Field>

        {serverError && <Notice tone="danger">{serverError}</Notice>}
        <Button onClick={submit} disabled={busy}>
          {busy ? t('common.loading') : t('creg.submit')}
        </Button>
        <Button variant="quiet" onClick={() => nav('/login/customer')}>{t('auth.haveAccount')}</Button>
      </div>
    </div>
  )
}
