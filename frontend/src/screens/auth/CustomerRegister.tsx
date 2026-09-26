import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../i18n/I18nProvider.js'
import { useAuth } from '../../store/AuthContext.js'
import { api, ApiError } from '../../lib/api.js'
import { useToast } from '../../store/ToastContext.js'
import {
  AppBar, Button, Field, Notice, VoiceInput,
} from '../../components/ui.js'
import { sessionStore } from './sellerDraft.js'
import { clearName, readName, writeName } from './customerDraft.js'

/**
 * CUSTOMER REGISTRATION - phone, OTP, name
 * ========================================
 * Her phone and OTP were already done by the shared login flow; this is the
 * third thing and the only one that is hers to type. One question on one
 * screen, the same rule the seller wizard follows.
 *
 * The name is not decoration. It is what the seller reads on the order and
 * what she is called when a woman in a village phones her about a delivery -
 * "ग्राहक" on every order tells that seller nothing. So it is persisted to her
 * customer record through the existing PATCH /customers/me, which resolves her
 * from the id inside her own signed token and cannot touch anybody else's row.
 *
 * She is already signed in when she gets here, which is why this screen sits
 * behind the customer guard: without a token there would be nothing to write
 * with. Registration here means "finish the record", not "get a session".
 */
export default function CustomerRegister() {
  const t = useT()
  const nav = useNavigate()
  const { session, patchSession } = useAuth()
  const { toast } = useToast()

  // What she typed before leaving, keyed by her own number. Back out of this
  // screen and in again and the name is still in the box; the woman who picks
  // up the same handset next gets an empty one.
  const store = useState(sessionStore)[0]
  const phone = session?.phone ?? ''

  const [name, setName] = useState(() => session?.name ?? readName(store, phone))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    writeName(store, phone, name)
  }, [store, phone, name])

  // Snapshot on mount: someone who already has a name and came back to change
  // it should not be told she is unregistered.
  const [isNew] = useState(() => !session?.name?.trim())

  async function submit() {
    if (!name.trim()) {
      setErr(t('creg.nameRequired'))
      return
    }
    setErr('')
    setBusy(true)
    try {
      const res = await api.updateCustomerMe(name.trim())
      // Kept on the session too, so her name shows on the very next screen
      // without waiting for a fetch.
      patchSession({ name: res.customer.name })
      clearName(store, phone)
      toast(t('ok.registered'))
      nav('/shop', { replace: true })
    } catch (e) {
      setErr(e instanceof ApiError ? (e.messageMr ?? e.message) : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <AppBar
        title={t('creg.title')}
        sub={session?.phone ? `+91 ${session.phone}` : undefined}
        backTo="/"
        bell={false}
      />

      <div className="screen screen--nonav stack">
        {/* Say plainly that this is the step she cannot skip, before asking.
            Her OTP was right - nothing went wrong - there is simply one more
            thing the account needs. */}
        {isNew && (
          <Notice tone="warn" title={t('onb.needRegisterTitle')}>
            {t('onb.needRegisterBuy')}
          </Notice>
        )}
        <Notice tone="info">{t('creg.lede')}</Notice>

        <Field
          label={t('cus.yourName')}
          hint={t('creg.nameHint')}
          error={err}
          required
        >
          <VoiceInput
            value={name}
            onChange={(v) => { setName(v); setErr('') }}
            error={!!err}
            placeholder={t('ph.fullName')}
          />
        </Field>

        <Button onClick={submit} disabled={busy}>
          {busy ? t('common.loading') : t('creg.submit')}
        </Button>
      </div>
    </div>
  )
}
