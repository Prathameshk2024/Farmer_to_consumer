import { useState } from 'react'
import {
  COMPLAINT_SUBJECTS, MAX_COMPLAINT, type ComplaintSubject, complaintProblems,
} from '@shared/complaint.js'
import { useT } from '../i18n/I18nProvider.js'
import { api, ApiError } from '../lib/api.js'
import { useToast } from '../store/ToastContext.js'
import { Button, Choice, Notice, VoiceInput } from './ui.js'
import { IconWhatsapp } from './icons.js'

/**
 * "SOMETHING HAS GONE WRONG AND I NEED A PERSON."
 *
 * Two ways out of the same sheet, on purpose. The form RECORDS the complaint
 * against her account, so an admin can open it, see the ₹50 she is asking
 * about and answer - a WhatsApp message lives on one phone and cannot be
 * counted, assigned or found again next month. WhatsApp is still offered
 * underneath, because when the order is at her door and the buyer is on the
 * phone, a queue is not what she needs.
 *
 * The subject is picked from a list: "payment" and "an order" are different
 * desks, and a queue where every row says "problem" cannot be worked through.
 */
export function ComplaintSheet({
  open, onClose, whatsappHref,
}: {
  open: boolean
  onClose: () => void
  /** Prefilled chat with the desk, for anything that cannot wait. */
  whatsappHref: string
}) {
  const t = useT()
  const { toast } = useToast()
  const [subject, setSubject] = useState<ComplaintSubject | ''>('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({})

  if (!open) return null

  function close() {
    setSubject('')
    setMessage('')
    setErr('')
    setFieldErr({})
    onClose()
  }

  async function send() {
    const problems = complaintProblems({ subject, message })
    setFieldErr(problems)
    if (Object.keys(problems).length) return

    setBusy(true)
    setErr('')
    try {
      await api.raiseComplaint({ subject: subject as ComplaintSubject, message: message.trim() })
      toast(t('help.complaintSent'))
      close()
    } catch (e) {
      setErr(e instanceof ApiError ? (e.messageMr ?? e.message) : t('help.complaintFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="stack">
          <div className="stack-sm">
            <h2 className="h2">{t('help.complaint')}</h2>
            <p className="small dim">{t('help.complaintSub')}</p>
          </div>

          <div className="stack-sm">
            {COMPLAINT_SUBJECTS.map((s) => (
              <Choice
                key={s}
                selected={subject === s}
                onSelect={() => { setSubject(s); setFieldErr({}) }}
                title={t(`help.subject.${s}`)}
              />
            ))}
          </div>
          {fieldErr.subject && <div className="field__err">{fieldErr.subject}</div>}

          <VoiceInput
            value={message}
            onChange={setMessage}
            error={!!fieldErr.message}
            multiline
            maxLength={MAX_COMPLAINT}
            placeholder={t('help.complaintPlaceholder')}
            speakHint
          />
          {fieldErr.message && <div className="field__err">{fieldErr.message}</div>}
          {err && <Notice tone="danger">{err}</Notice>}

          <div className="stack-sm">
            <Button disabled={busy} onClick={() => void send()}>{t('help.complaintSend')}</Button>
            {/* For the thing that cannot wait for a queue. */}
            <a className="btn btn--ghost" href={whatsappHref} target="_blank" rel="noreferrer">
              <IconWhatsapp aria-hidden="true" /> {t('help.complaintUrgent')}
            </a>
            <Button variant="quiet" disabled={busy} onClick={close}>{t('common.cancel')}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
