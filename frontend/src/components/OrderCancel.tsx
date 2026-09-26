import { useState } from 'react'
import type { Order } from '@shared/types.js'
import {
  CANCEL_NOTE_MIN, cancelProblem, cancelReasonKey, cancelReasons, endingEvent, refundOwed,
  type CancelBy,
} from '@shared/orderCancel.js'
import { useT } from '../i18n/I18nProvider.js'
import { api, ApiError } from '../lib/api.js'
import { IconCall } from './icons.js'
import { Button, Choice, Field, Notice, VoiceInput } from './ui.js'

/**
 * CALLING AN ORDER OFF, FROM EITHER SIDE.
 *
 * Both sides walk the same three steps, each worded for who is reading:
 *
 *   1. "Cancel it for certain?" - what it costs the person on the other end.
 *   2. Why.
 *   3. "Cancel this order?" - that it cannot be undone. This button sends it.
 *
 * A single stray tap on a phone held in a kitchen must never be enough, and
 * each question states a consequence rather than asking "are you sure?" twice:
 * the second has to tell her something the first did not.
 *
 * The seller then gets a fourth screen that is not a question: what she owes
 * back. This app cannot refund anybody, so if the buyer paid, the money is in
 * her account and only she can return it. It is shown AFTER the cancel went
 * through, as its own screen, because a line of small print on a confirmation
 * is read by nobody, and it closes only on "I understand" - not on a tap
 * outside the sheet. The buyer has no fourth screen: a buyer may cancel only
 * before acceptance, and UPI is paid after it.
 */
export function CancelOrderSheet({
  order, by, open, onClose, onCancelled,
}: {
  order: Order
  by: CancelBy
  open: boolean
  onClose: () => void
  onCancelled: (order: Order) => void
}) {
  const t = useT()
  const [step, setStep] = useState(1)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  /** The order as the server returned it, for the refund screen. */
  const [cancelled, setCancelled] = useState<Order | null>(null)

  if (!open) return null

  // The two sides share every step; only the words differ. Written out as
  // literal keys, not built from a prefix, so the i18n test can see them.
  const seller = by === 'seller'
  const owed = refundOwed(order)

  function close() {
    setStep(1)
    setCancelled(null)
    setReason('')
    setNote('')
    setErr('')
    onClose()
  }

  async function submit() {
    setBusy(true)
    setErr('')
    try {
      const res = await api.cancelOrder(order.id, reason, reason === 'other' ? note.trim() : undefined)
      onCancelled(res.order)
      if (seller) {
        setCancelled(res.order)
        setStep(4)
      } else {
        close()
      }
    } catch (e) {
      setErr(e instanceof ApiError ? (e.messageMr ?? e.message) : t('cancel.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={step === 4 || busy ? undefined : close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {step === 1 && (
          <div className="stack">
            <div className="stack-sm">
              <h2 className="h2">{t('cancel.q1')}</h2>
              <p className="body muted">{seller ? t('cancel.sel.q1Sub') : t('cancel.cus.q1Sub')}</p>
            </div>
            <div className="btn-row">
              <Button variant="quiet" onClick={close}>{t('cancel.keep')}</Button>
              <Button variant="danger" onClick={() => setStep(2)}>
                {seller ? t('cancel.sel.yes1') : t('cancel.cus.yes1')}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="stack">
            <div className="stack-sm">
              <h2 className="h2">{t('cancel.why')}</h2>
              <p className="body muted">{seller ? t('cancel.sel.whySub') : t('cancel.cus.whySub')}</p>
            </div>

            <div className="stack-sm" role="radiogroup" aria-label={t('cancel.why')}>
              {cancelReasons(by).map((code) => (
                <Choice
                  key={code}
                  selected={reason === code}
                  onSelect={() => { setReason(code); setErr('') }}
                  title={t(cancelReasonKey(by, code))}
                />
              ))}
            </div>

            {reason === 'other' && (
              <Field label={t('cancel.otherLabel')} hint={t('cancel.otherHint', { n: CANCEL_NOTE_MIN })}>
                <VoiceInput value={note} onChange={setNote} placeholder={t('cancel.otherPlaceholder')} />
              </Field>
            )}

            {/* Disabled until the answer is complete - the same check the
                server runs - so she is never told off after pressing it. */}
            <div className="btn-row">
              <Button variant="quiet" onClick={close}>{t('cancel.keep')}</Button>
              <Button
                variant="danger"
                disabled={cancelProblem(by, reason, note) !== null}
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
              <h2 className="h2">{t('cancel.q3')}</h2>
              <p className="body muted">{seller ? t('cancel.sel.q3Sub') : t('cancel.cus.q3Sub')}</p>
            </div>

            {/* Before the last tap, not only after it: whether she owes money
                back is part of deciding whether to cancel at all. */}
            {seller && owed !== 'none' && (
              <Notice tone="warn">{t('cancel.sel.q3Paid', { total: order.total })}</Notice>
            )}

            {err && <Notice tone="danger">{err}</Notice>}

            <div className="btn-row">
              <Button variant="quiet" onClick={close} disabled={busy}>{t('cancel.keep')}</Button>
              <Button variant="danger" disabled={busy} onClick={() => void submit()}>
                {busy ? t('common.loading') : seller ? t('cancel.sel.yes3') : t('cancel.cus.yes3')}
              </Button>
            </div>
          </div>
        )}

        {step === 4 && cancelled && (
          <div className="stack">
            <RefundNotice order={cancelled} viewer="seller" always />
            <div className="btn-row">
              {owed !== 'none' && order.customerPhone && (
                <a className="btn btn--ghost" href={`tel:${order.customerPhone}`}>
                  <IconCall aria-hidden="true" /> {t('ord.callCustomer')}
                </a>
              )}
              <Button onClick={close}>{t('refund.ack')}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * THE MONEY THAT HAS TO GO BACK.
 *
 * The seller's side is the one that matters: the app cannot refund anybody,
 * so this is the only thing standing between a cancelled paid order and a
 * buyer who is simply out of pocket. It is the last screen of her cancel sheet
 * (`always`, so she is told to return any cash or advance even when nothing
 * was reported), and it stays on the cancelled order's screen afterwards for
 * as long as money was reported - one screen closed too quickly must not be
 * the only time she was told.
 *
 * The buyer's side only says where their money is and who to call.
 */
export function RefundNotice({
  order, viewer, always = false,
}: {
  order: Order
  viewer: CancelBy
  always?: boolean
}) {
  const t = useT()
  if (order.status !== 'CANCELLED') return null
  const owed = refundOwed(order)

  if (viewer === 'customer') {
    if (owed === 'none') return null
    return <Notice tone="warn">{t('refund.cusBody', { total: order.total })}</Notice>
  }

  if (owed === 'none') {
    if (!always) return null
    return (
      <Notice tone="warn" title={t('refund.unpaidTitle')}>
        <div className="stack-sm">
          <span>{t('refund.unpaidBody')}</span>
          <strong>{t('refund.appNote')}</strong>
        </div>
      </Notice>
    )
  }

  return (
    <Notice
      tone="danger"
      title={owed === 'confirmed'
        ? t('refund.paidTitle', { total: order.total })
        : t('refund.claimedTitle')}
    >
      <div className="stack-sm">
        <span>
          {owed === 'confirmed'
            ? t('refund.paidBody', { total: order.total })
            : t('refund.claimedBody', { total: order.total })}
        </span>
        <span>1. {t('refund.step1')}</span>
        <span>2. {t('refund.step2')}</span>
        {order.paymentUtr && (
          <span>{t('refund.utr')} <span className="num">{order.paymentUtr}</span></span>
        )}
        <strong>{t('refund.appNote')}</strong>
      </div>
    </Notice>
  )
}

/**
 * WHO CALLED IT OFF, AND WHY.
 *
 * A cancelled order used to show a timeline with every step grey and nothing
 * else, which answers none of the questions the person reading it has. Both
 * order screens draw this instead, each from its own side: "you cancelled",
 * "the seller cancelled", with the reason in the reader's own language.
 */
export function OrderEndedNotice({ order, viewer }: { order: Order; viewer: CancelBy }) {
  const t = useT()
  const ev = endingEvent(order)
  if (!ev) return null

  const byMe = ev.by === viewer
  const title =
    order.status === 'REJECTED'
      ? t(viewer === 'seller' ? 'ended.youRejected' : 'ended.sellerRejected')
      : byMe
        ? t('ended.youCancelled')
        : t(ev.by === 'seller' ? 'ended.sellerCancelled' : 'ended.customerCancelled')

  // A reason code reads in the viewer's language. Older rejects stored the
  // sentence itself in `note`, and are shown as they were written.
  const reasonText =
    ev.reason && (ev.by === 'seller' || ev.by === 'customer')
      ? ev.reason === 'other'
        ? ev.note
        : t(cancelReasonKey(ev.by, ev.reason))
      : ev.note

  return (
    <Notice tone="danger" title={title}>
      {reasonText ? t('ended.reason', { reason: reasonText }) : null}
    </Notice>
  )
}
