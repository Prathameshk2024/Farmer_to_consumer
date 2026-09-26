import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { allChecksDone, type PaymentCheck } from '@shared/payment.js'
import { SortSelect, useSort } from '../components/SortSelect.js'
import { PAYMENT_SORTS, sortRows } from '../lib/sort.js'
import { useT } from '../i18n/I18nProvider.js'
import { useToast } from '../store/ToastContext.js'
import { IconPayments } from '../components/icons.js'
import { api, type PaymentRow } from '../lib/api.js'
import { rupees, waited, when } from '../lib/format.js'
import { TopBar } from '../components/Shell.js'
import { PaymentKindPill } from '../components/Subscription.js'
import {
  Button, Card, CopyValue, EmptyState, ErrorNote, Field, Loading, Notice, Pill,
  useAsync, useErrorText,
} from '../components/ui.js'

type Tab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'

/** How often the waiting times are redrawn on a console left open. */
const TICK_MS = 30 * 60 * 1000

const WAIT_UNIT_KEY = {
  m: 'c.minutesShort',
  h: 'c.hoursShort',
  d: 'c.daysShort',
} as const

/**
 * A clock the waiting times are measured against, re-read every half hour.
 *
 * `waited()` is computed during a render, so on a console that sits open on a
 * desk all day - which is exactly how this one is used - every queue age was
 * frozen at whenever the page was last loaded. A row saying "Waiting 2 h" at
 * six in the evening, when she had in fact been waiting since morning, is
 * worse than no number: it is a number that argues against acting.
 *
 * Half-hourly rather than by the second, because nothing here turns on a
 * minute and a timer that wakes 1,800 times as often is a laptop fan.
 */
function useNow(everyMs = TICK_MS): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

/**
 * Approving a ₹50 payment is the single most consequential click in this
 * console: it grants her five slots and flips her to ACTIVE, which is the
 * moment she can actually sell anything.
 *
 * So the waiting time is shown, prominently, and rejection cannot happen
 * without a reason - she reads that reason in her own app, and "UTR did not
 * match" with no explanation produces a support call this programme has no
 * staff to answer.
 */
export function Payments() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('PENDING')
  const [data, loading, error, reload] = useAsync(() => api.payments(tab), [tab])
  const now = useNow()
  const [sort, setSort] = useSort('payments', PAYMENT_SORTS)

  const rows = useMemo(() => sortRows(data?.payments ?? [], PAYMENT_SORTS, sort), [data, sort])

  return (
    <>
      <TopBar title={t('pay.title')} />
      <div className="body stack">
        <div className="row wrap">
          {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as Tab[]).map((s) => (
            <Button
              key={s}
              small
              variant={tab === s ? 'primary' : 'quiet'}
              onClick={() => setTab(s)}
            >
              {t(`pay.${s.toLowerCase()}`)}
            </Button>
          ))}
          <SortSelect options={PAYMENT_SORTS} value={sort} onChange={setSort} />
        </div>

        <ErrorNote error={error} />

        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Card><EmptyState icon={IconPayments} title={t('pay.empty')} body={t('pay.emptySub')} /></Card>
        ) : (
          <div className="stack-sm">
            {rows.map((p) => (
              <PaymentCard key={p.id} payment={p} now={now} onDone={reload} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function PaymentCard(
  { payment, now, onDone }: { payment: PaymentRow; now: number; onDone: () => void },
) {
  const t = useT()
  const { toast } = useToast()
  const errorText = useErrorText()

  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonErr, setReasonErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [checks, setChecks] = useState<PaymentCheck[]>([])
  const [viewing, setViewing] = useState(false)

  const w = waited(payment.submittedAt, now)
  const pending = payment.status === 'PENDING'
  const verified = allChecksDone(checks)
  const toggle = (c: PaymentCheck) =>
    setChecks((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))

  /**
   * A payment she says she made long before she sent it is not impossible -
   * she paid, then could not find the form - but it is the shape of a
   * screenshot reused from some other payment, so it is pointed out.
   */
  const paidLongBefore =
    !!payment.paidAt &&
    new Date(payment.submittedAt).getTime() - new Date(payment.paidAt).getTime() > 24 * 3_600_000

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true)
    setErr('')
    try {
      await action()
      // Said before the list reloads: the row is about to disappear, and a row
      // vanishing is not the same as being told what it did.
      toast(done)
      onDone()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  function reject() {
    // Required, not encouraged. An empty reason reaches her as silence.
    if (!reason.trim()) {
      setReasonErr(t('c.required'))
      return
    }
    void run(() => api.rejectPayment(payment.id, reason.trim()), t('ok.paymentRejected'))
  }

  return (
    <Card>
      <div className="row wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
        {/* The screenshot leads, at a size that can be read at a glance, and
            opens large beside the typed numbers. It used to be a link to a new
            tab, which is how a proof goes unopened. */}
        {payment.screenshotUrl ? (
          <button
            type="button"
            className="shotthumb"
            onClick={() => setViewing(true)}
            aria-label={t('pay.viewScreenshot')}
            title={t('pay.viewScreenshot')}
          >
            <img src={payment.screenshotUrl} alt="" loading="lazy" />
            <span className="shotthumb__cap">{t('pay.viewScreenshot')}</span>
          </button>
        ) : (
          <div className="shotthumb shotthumb--none">{t('pay.noScreenshot')}</div>
        )}

        <div className="grow">
          <div className="row wrap" style={{ gap: 8 }}>
            {/* Her name as she gave it - never transliterated. */}
            <span className="strong">{payment.sellerName}</span>
            <span className="small dim mono">{payment.womenBizId}</span>
            <StatusPill status={payment.status} />
            {/* Five slots or six months: the same ₹50, a different decision. */}
            <PaymentKindPill kind={payment.kind} />
            {pending && (
              <Pill tone={w.unit === 'd' ? 'danger' : 'warn'}>
                {t('pay.waiting')} {w.value}{t(WAIT_UNIT_KEY[w.unit])}
              </Pill>
            )}
            {/* The ordinary case: submit tapped twice on a slow connection.
                Flagging it stops a duplicate being approved as a second pack. */}
            {payment.duplicateUtr && <Pill tone="danger">{t('pay.duplicate')}</Pill>}
          </div>
          <div className="small dim">
            {rupees(payment.amount)} · <span className="mono">{payment.phone}</span>
          </div>
          {/* The three things the screenshot is checked against, large
              enough to read side by side with it. */}
          <div className="payfacts">
            <div>
              <div className="small dim-2">{t('pay.utr')}</div>
              <div className="mono strong">{payment.utr}</div>
            </div>
            <div>
              <div className="small dim-2">{t('pay.paidAt')}</div>
              <div className="strong">{payment.paidAt ? when(payment.paidAt) : '-'}</div>
            </div>
            <div>
              <div className="small dim-2">{t('pay.amount')}</div>
              <div className="strong num">{rupees(payment.amount)}</div>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {!payment.screenshotUrl && <Pill tone="danger">{t('pay.noScreenshot')}</Pill>}
            {!payment.paidAt && <Pill tone="warn">{t('pay.noPaidAt')}</Pill>}
            {paidLongBefore && <Pill tone="warn">{t('pay.paidLongBefore')}</Pill>}
          </div>
          {/* She paid from this UPI ID, and reconciling it against the bank
              statement means having it exactly right. */}
          {payment.payerUpi && (
            <div className="small dim">
              {t('pay.payerUpi')}{' '}
              <CopyValue value={payment.payerUpi} label={t('c.copy')} copiedText={t('c.upiCopied')} />
            </div>
          )}
          <div className="small dim-2">
            {t('pay.submitted')} {when(payment.submittedAt)}
            {payment.verifiedBy && ` · ${t('pay.verifiedBy')} ${t('c.by')} ${payment.verifiedBy}`}
          </div>
          {payment.rejectReason && (
            <div className="small" style={{ color: 'var(--danger)' }}>
              {t('c.reason')}: {payment.rejectReason}
            </div>
          )}
        </div>

      </div>

      {/* APPROVE IS EARNED, NOT CLICKED. Twelve digits can be invented, so
          the admin ticks off each thing actually compared - and the server
          refuses an approval that does not carry all three. Reject needs no
          checklist: saying no to an unproven payment is always safe. */}
      {pending && !rejecting && (
        <div className="verify">
          <div className="small strong">{t('pay.verifyTitle')}</div>
          <Check on={checks.includes('utr')} onToggle={() => toggle('utr')}>
            {t('pay.checkUtr', { utr: payment.utr })}
          </Check>
          <Check on={checks.includes('dateTime')} onToggle={() => toggle('dateTime')}>
            {t('pay.checkTime', { at: payment.paidAt ? when(payment.paidAt) : '-' })}
          </Check>
          <Check on={checks.includes('received')} onToggle={() => toggle('received')}>
            {t('pay.checkReceived', { amount: rupees(payment.amount) })}
          </Check>

          <div className="row wrap" style={{ marginTop: 6 }}>
            <Button
              variant="ok"
              small
              disabled={busy || !verified}
              title={verified ? undefined : t('pay.verifyFirst')}
              onClick={() => void run(() => api.approvePayment(payment.id, checks), t('ok.paymentApproved'))}
            >
              {t('pay.approve')}
            </Button>
            <Button variant="danger" small disabled={busy} onClick={() => setRejecting(true)}>
              {t('pay.reject')}
            </Button>
            {!verified && <span className="small dim-2">{t('pay.verifyFirst')}</span>}
          </div>
          <div className="small dim-2">
            {payment.kind === 'RENEWAL' ? t('pay.approveNoteRenewal') : t('pay.approveNote')}
          </div>
        </div>
      )}

      {viewing && payment.screenshotUrl && (
        <ScreenshotViewer payment={payment} onClose={() => setViewing(false)} />
      )}

      {rejecting && (
        <div className="stack-sm" style={{ marginTop: 12 }}>
          <Field label={t('pay.rejectReason')} error={reasonErr}>
            <textarea
              className="textarea"
              value={reason}
              onChange={(e) => { setReason(e.target.value); setReasonErr('') }}
              placeholder={t('pay.rejectReasonHint')}
            />
          </Field>
          <div className="small dim-2">{t('pay.rejectReasonHint')}</div>
          <div className="row">
            <Button variant="danger" small disabled={busy} onClick={reject}>
              {t('pay.rejectConfirm')}
            </Button>
            <Button variant="quiet" small disabled={busy} onClick={() => setRejecting(false)}>
              {t('c.cancel')}
            </Button>
          </div>
        </div>
      )}

      {err && <div style={{ marginTop: 10 }}><Notice tone="danger">{err}</Notice></div>}
    </Card>
  )
}

function Check({ on, onToggle, children }: { on: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <label className="verify__item">
      <input type="checkbox" checked={on} onChange={onToggle} />
      <span>{children}</span>
    </label>
  )
}

/**
 * The screenshot, large, with the typed numbers beside it.
 *
 * Side by side because the check IS a comparison: the UTR, the date and time
 * and the amount on her UPI app's screen against what she typed. Opening the
 * image in a tab of its own meant holding twelve digits in memory across two
 * windows. A `<dialog>` for the same reasons as the order detail - see the
 * note on `OrderDetail` in Orders.tsx about never closing it in a cleanup.
 */
function ScreenshotViewer({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const t = useT()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="dlg dlg--wide"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
    >
      <Card>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="strong">{payment.sellerName}</span>
          <Button variant="quiet" small onClick={onClose}>{t('c.close')}</Button>
        </div>
        <div className="shotview">
          <a href={payment.screenshotUrl} target="_blank" rel="noreferrer" className="shotview__img">
            <img src={payment.screenshotUrl} alt={t('pay.screenshot')} />
          </a>
          <div className="stack-sm">
            <div>
              <div className="small dim-2">{t('pay.utr')}</div>
              <div className="mono strong shotview__big">{payment.utr}</div>
            </div>
            <div>
              <div className="small dim-2">{t('pay.paidAt')}</div>
              <div className="strong">{payment.paidAt ? when(payment.paidAt) : '-'}</div>
            </div>
            <div>
              <div className="small dim-2">{t('pay.amount')}</div>
              <div className="strong num">{rupees(payment.amount)}</div>
            </div>
            <div>
              <div className="small dim-2">{t('pay.submitted')}</div>
              <div>{when(payment.submittedAt)}</div>
            </div>
            {payment.payerUpi && (
              <div>
                <div className="small dim-2">{t('pay.payerUpi')}</div>
                <div className="mono">{payment.payerUpi}</div>
              </div>
            )}
            <div className="small dim-2">{t('pay.viewerHint')}</div>
          </div>
        </div>
      </Card>
    </dialog>
  )
}

function StatusPill({ status }: { status: string }) {
  const t = useT()
  if (status === 'APPROVED') return <Pill tone="ok">{t('pay.approved')}</Pill>
  if (status === 'REJECTED') return <Pill tone="danger">{t('pay.rejected')}</Pill>
  return <Pill tone="warn">{t('pay.pending')}</Pill>
}
