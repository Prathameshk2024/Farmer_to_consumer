import { useState, type FormEvent } from 'react'
import { useT } from '../i18n/I18nProvider.js'
import { useAuth } from '../store/AuthContext.js'
import { LangToggle } from '../components/Shell.js'
import { Button, Card, Field, Notice, useErrorText } from '../components/ui.js'
import logo from '../assets/logo.png'

export function SignIn() {
  const t = useT()
  const { signIn } = useAuth()
  const errorText = useErrorText()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await signIn(email.trim(), password)
    } catch (error) {
      // 401 here means the credentials are wrong, not that a session expired -
      // the generic "sign in again" would be nonsense on the sign-in screen.
      setErr(
        error && typeof error === 'object' && 'status' in error && error.status === 401
          ? t('in.failed')
          : errorText(error),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="signin">
      <div className="signin__card stack">
        <div className="signin__brand">
          <img className="signin__logo" src={logo} alt="" aria-hidden="true" />
          <div className="signin__name">{t('app.name')}</div>
          <div className="signin__sub">{t('in.sub')}</div>
        </div>

        <Card>
          <form className="stack-sm" onSubmit={submit}>
            <h1>{t('in.title')}</h1>

            <Field label={t('in.email')}>
              <input
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>

            <Field label={t('in.password')}>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>

            {err && <Notice tone="danger">{err}</Notice>}

            <Button type="submit" disabled={busy}>
              {busy ? t('in.working') : t('in.submit')}
            </Button>
          </form>
        </Card>

        <LangToggle />
      </div>
    </div>
  )
}
