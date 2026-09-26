import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { passwordProblemMr } from '@shared/password.js'
import { useT } from '../../i18n/I18nProvider.js'
import { homeFor, useAuth } from '../../store/AuthContext.js'
import { api, ApiError } from '../../lib/api.js'
import { useToast } from '../../store/ToastContext.js'
import { AppBar, Button, Field, Notice, TextInput } from '../../components/ui.js'

/**
 * CHOOSE A NEW PASSWORD
 * =====================
 * Anyone signed in can come here; after an admin reset they are sent here and
 * nowhere else until they are done, and "current" is the temporary password the
 * admin read out. Every other phone signed in as them is signed out.
 */
export default function ChangePassword() {
  const t = useT()
  const nav = useNavigate()
  const { session, patchSession } = useAuth()
  const { toast } = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const forced = !!session?.mustChangePassword
  const home = session ? homeFor(session.role) : '/'

  const submit = async () => {
    const problem = passwordProblemMr(next)
    if (problem) { setError(problem); return }
    if (next !== again) { setError(t('auth.mismatch')); return }
    setBusy(true)
    setError(null)
    try {
      await api.changePassword(current, next)
      patchSession({ mustChangePassword: false })
      toast(t('auth.changed'))
      nav(home, { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? (e.messageMr ?? t('auth.failed')) : t('auth.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell">
      {/* No way back while forced: every screen behind it would answer 403. */}
      <AppBar title={t('auth.changeTitle')} backTo={forced ? undefined : home} bell={false} />
      <div className="screen screen--nonav stack">
        {forced && <Notice tone="warn">{t('auth.mustChange')}</Notice>}
        <Field label={t('auth.currentOrTemp')} htmlFor="current">
          <TextInput id="current" type="password" autoComplete="current-password"
            value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label={t('auth.newPassword')} hint={t('auth.passwordPh')} htmlFor="next">
          <TextInput id="next" type="password" autoComplete="new-password"
            value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label={t('auth.passwordAgain')} htmlFor="again">
          <TextInput id="again" type="password" autoComplete="new-password"
            value={again} onChange={(e) => setAgain(e.target.value)} />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button onClick={submit} disabled={busy || !current || !next}>
          {busy ? t('common.loading') : t('auth.changeTitle')}
        </Button>
      </div>
    </div>
  )
}
