import { useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { isValidPhone } from '@shared/farmer.js'
import { MIN_PASSWORD } from '@shared/password.js'
import { useT } from '../../i18n/I18nProvider.js'
import { homeFor, useAuth } from '../../store/AuthContext.js'
import { api, ApiError } from '../../lib/api.js'
import { AppBar, Button, Field, Notice, TextInput } from '../../components/ui.js'
import { IconCall } from '../../components/icons.js'
import { SUPPORT_PHONE } from '../farmer/Misc.js'
import { PHONE_INPUT_MAX } from '../../lib/phone.js'

type RoleParam = 'farmer' | 'customer'

export function roleFrom(value: string | undefined): RoleParam {
  return value === 'farmer' ? 'farmer' : 'customer'
}


/**
 * SIGN IN: PHONE AND PASSWORD
 * ===========================
 * Both landing doors come through here with the role in the path. There is no
 * SMS: a forgotten password goes to /forgot-password/:role, which asks a
 * person to call back.
 *
 * Already signed in with this role? Then the login is already done, and the
 * only correct thing is to let them through - asking again is how a back
 * press starts to look like being logged out.
 */
export function LoginScreen() {
  const t = useT()
  const nav = useNavigate()
  const role = roleFrom(useParams().role)
  const { signIn, session } = useAuth()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Where a signed-out visitor was going - the trace page's "order" button.
  // Only a path inside this app: never a link to somewhere else.
  const next = (useLocation().state as { next?: unknown } | null)?.next
  const home = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : homeFor(role)

  if (session?.role === role && !session.mustChangePassword) return <Navigate to={home} replace />

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await api.login(phone, password, role)
      signIn(r.session)
      nav(r.mustChangePassword ? '/password' : home, { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? (e.messageMr ?? t('auth.failed')) : t('auth.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <AppBar
        brand
        title={t(role === 'farmer' ? 'auth.loginFarmer' : 'auth.loginBuyer')}
        backTo="/"
        bell={false}
      />
      <div className="screen screen--nonav stack">
        <Field label={t('auth.phone')} htmlFor="phone">
          <TextInput
            id="phone"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={PHONE_INPUT_MAX}
            value={phone}
            placeholder={t('auth.phonePh')}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label={t('auth.password')} htmlFor="password">
          <TextInput
            id="password"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            placeholder={t('auth.passwordPh')}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button variant="quiet" onClick={() => setShow(!show)}>{t(show ? 'auth.hide' : 'auth.show')}</Button>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button onClick={submit} disabled={busy || !isValidPhone(phone) || password.length < MIN_PASSWORD}>
          {busy ? t('common.loading') : t('auth.login')}
        </Button>
        <Button variant="ghost" onClick={() => nav(`/forgot-password/${role}`)}>{t('auth.forgot')}</Button>
        <a className="btn btn--ghost" href={`tel:+91${SUPPORT_PHONE}`}><IconCall aria-hidden="true" /> {t('help.call')}</a>
        <Button variant="quiet" onClick={() => nav(`/register/${role}`)}>{t('auth.newAccount')}</Button>
      </div>
    </div>
  )
}

/**
 * FORGOT PASSWORD IS A REQUEST TO A PERSON
 * ========================================
 * Public. They leave their number, name and (a farmer) village; an admin calls
 * that number and reads out a temporary password. What they see after sending
 * is the same whatever the server knows about the number.
 */
export function ForgotPasswordScreen() {
  const t = useT()
  const nav = useNavigate()
  const role = roleFrom(useParams().role)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [village, setVillage] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ready = isValidPhone(phone) && name.trim() !== '' && (role !== 'farmer' || village.trim() !== '')
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.requestPasswordReset({ role, phone, name, village: role === 'farmer' ? village : undefined })
      setSent(true)
    } catch (e) {
      // A 429 carries the server's Marathi "try again in ..." line.
      setError(e instanceof ApiError ? (e.messageMr ?? t('auth.failed')) : t('auth.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <AppBar brand title={t('forgot.title')} backTo={`/login/${role}`} bell={false} />
      <div className="screen screen--nonav stack">
        {sent ? (
          <>
            <Notice tone="ok">{t('forgot.sent')}</Notice>
            <Button onClick={() => nav(`/login/${role}`, { replace: true })}>{t('forgot.backToLogin')}</Button>
          </>
        ) : (
          <>
            <p className="body" style={{ margin: 0 }}>{t('forgot.intro')}</p>
            <Field label={t('auth.phone')} htmlFor="phone">
              <TextInput
                id="phone"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={PHONE_INPUT_MAX}
                value={phone}
                placeholder={t('auth.phonePh')}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <Field label={t('forgot.name')} htmlFor="name">
              <TextInput id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            {role === 'farmer' && (
              <Field label={t('forgot.village')} htmlFor="village">
                <TextInput id="village" value={village} onChange={(e) => setVillage(e.target.value)} />
              </Field>
            )}
            {error && <Notice tone="danger">{error}</Notice>}
            <Button onClick={submit} disabled={busy || !ready}>
              {busy ? t('common.loading') : t('forgot.send')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
