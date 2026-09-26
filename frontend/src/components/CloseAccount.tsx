import { useState } from 'react'
import {
  CLOSE_NOTE_MIN, CLOSE_REASONS, UNDO_DAYS, closeReasonKey, closeReasonProblem, confirmProblem,
} from '@shared/accountClose.js'
import { useT } from '../i18n/I18nProvider.js'
import { api, ApiError } from '../lib/api.js'
import { useAuth } from '../store/AuthContext.js'
import { Button, Choice, Field, Notice, TextInput, VoiceInput } from './ui.js'

/**
 * DELETING AN ACCOUNT.
 *
 * Google Play requires the option. What it does not decide is how hard it
 * should be to do by accident, and on this app that question has a face: a
 * woman whose shop is her income, on a phone she shares, reaching for Log out.
 *
 * So the entry point is nowhere near Log out - its own card at the very bottom
 * of the profile, a quiet line rather than a red button - and the sheet walks
 * the same shape as cancelling an order, where each step states something the
 * last one did not:
 *
 *   1. What it costs: her listings, her shop, the ₹50 that is not refunded.
 *   2. Why she is leaving - a reason from a list, as everywhere else.
 *   3. The last four digits of her own number, typed. Not a word to copy
 *      (that is a literacy test) and not a second OTP (an SMS against a
 *      three-a-day ceiling, proving possession of a phone she is already
 *      signed in on). Four digits she knows by heart, which a thumb does not
 *      produce by accident.
 *   4. What happens next, which for a seller is the week she has to change
 *      her mind.
 *
 * An order still in flight is not an error but a thing to do first: the server
 * answers 409 and the sheet says so, because a buyer waiting on a delivery
 * cannot be left holding an order whose seller has vanished.
 */
export function CloseAccountSheet({
  role, phone, productCount, open, onClose,
}: {
  role: 'seller' | 'customer'
  /** Her own number. The last four digits of it are the final confirmation. */
  phone: string
  /** Seller only: how many listings go with the shop, so step 1 is a fact. */
  productCount?: number
  open: boolean
  onClose: () => void
}) {
  const t = useT()
  const { signOut } = useAuth()
  const [step, setStep] = useState(1)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [digits, setDigits] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [blocked, setBlocked] = useState<string[]>([])

  if (!open) return null

  const seller = role === 'seller'

  function close() {
    setStep(1)
    setReason('')
    setNote('')
    setDigits('')
    setErr('')
    setBlocked([])
    onClose()
  }

  async function submit() {
    setBusy(true)
    setErr('')
    setBlocked([])
    try {
      if (seller) {
        await api.closeSellerAccount({
          reason,
          note: reason === 'other' ? note.trim() : undefined,
          confirm: digits,
        })
      } else {
        await api.closeCustomerAccount(digits)
      }
      setStep(4)
    } catch (e) {
      if (e instanceof ApiError) {
        // The orders standing in the way, named. Nothing has been closed.
        const open = (e.body as { openOrders?: { id: string }[] }).openOrders
        if (open?.length) setBlocked(open.map((o) => o.id))
        setErr(e.messageMr ?? e.message)
      } else {
        setErr(t('close.failed'))
      }
    } finally {
      setBusy(false)
    }
  }

  /** The last screen is the only way out, and it ends the session. */
  function done() {
    close()
    signOut()
  }

  return (
    <div className="sheet-backdrop" onClick={step === 4 || busy ? undefined : close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {step === 1 && (
          <div className="stack">
            <div className="stack-sm">
              <h2 className="h2">{t('close.q1')}</h2>
              <p className="body muted">{seller ? t('close.sel.q1Sub') : t('close.cus.q1Sub')}</p>
            </div>

            {/* Her own numbers, not a warning in the abstract. A woman with
                five listings is being told about those five. */}
            {seller && (
              <Notice tone="warn" title={t('close.sel.whatGoesTitle')}>
                {t('close.sel.whatGoes', { n: productCount ?? 0 })}
              </Notice>
            )}

            <div className="btn-row">
              <Button variant="quiet" onClick={close}>{t('close.keep')}</Button>
              <Button variant="danger" onClick={() => setStep(2)}>{t('close.yes1')}</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <div className="stack-sm">
              <h2 className="h2">{t('close.why')}</h2>
              <p className="body muted">{t('close.whySub')}</p>
            </div>

            <div className="stack-sm" role="radiogroup" aria-label={t('close.why')}>
              {CLOSE_REASONS.map((code) => (
                <Choice
                  key={code}
                  selected={reason === code}
                  onSelect={() => { setReason(code); setErr('') }}
                  title={t(closeReasonKey(code))}
                />
              ))}
            </div>

            {reason === 'other' && (
              <Field label={t('close.otherLabel')} hint={t('close.otherHint', { n: CLOSE_NOTE_MIN })}>
                <VoiceInput value={note} onChange={setNote} placeholder={t('close.otherPlaceholder')} />
              </Field>
            )}

            <div className="btn-row">
              <Button variant="quiet" onClick={close}>{t('close.keep')}</Button>
              <Button
                variant="danger"
                disabled={closeReasonProblem(reason, note) !== null}
                onClick={() => setStep(3)}
              >
                {t('common.next')}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="stack">
            <div className="stack-sm">
              <h2 className="h2">{t('close.q3')}</h2>
              <p className="body muted">{seller ? t('close.sel.q3Sub') : t('close.cus.q3Sub')}</p>
            </div>

            <Field label={t('close.digitsLabel')} hint={t('close.digitsHint')}>
              <TextInput
                type="tel"
                inputMode="numeric"
                maxLength={4}
                value={digits}
                onChange={(e) => { setDigits(e.target.value.replace(/\D/g, '').slice(0, 4)); setErr('') }}
                placeholder={t('close.digitsPlaceholder')}
                aria-label={t('close.digitsLabel')}
              />
            </Field>

            {/* An order in flight stops this, and saying which one turns a
                refusal into a thing she can go and finish. */}
            {blocked.length > 0 && (
              <Notice tone="warn" title={t('close.openOrders')}>
                {blocked.join(', ')}
              </Notice>
            )}
            {err && blocked.length === 0 && <Notice tone="danger">{err}</Notice>}

            <div className="btn-row">
              <Button variant="quiet" onClick={close} disabled={busy}>{t('close.keep')}</Button>
              <Button
                variant="danger"
                disabled={busy || confirmProblem(phone, digits) !== null}
                onClick={() => void submit()}
              >
                {busy ? t('common.loading') : t('close.yes3')}
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="stack">
            <div className="stack-sm">
              <h2 className="h2">{t('close.doneTitle')}</h2>
              <p className="body">
                {seller ? t('close.sel.doneBody', { days: UNDO_DAYS }) : t('close.cus.doneBody')}
              </p>
            </div>
            <Button onClick={done}>{t('close.doneAck')}</Button>
          </div>
        )}
      </div>
    </div>
  )
}
