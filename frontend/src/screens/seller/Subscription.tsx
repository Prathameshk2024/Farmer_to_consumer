import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { isValidUtr, normalizeUtr, paidAtProblem, utrProblem } from '@shared/payment.js'
import { buildUpiLink } from '@shared/seller.js'
import { useT } from '../../i18n/I18nProvider.js'
import { api, ApiError } from '../../lib/api.js'
import { useToast } from '../../store/ToastContext.js'
import QrCode from '../../components/QrCode.js'
import PhotoPicker from '../../components/PhotoPicker.js'
import { PaySteps } from '../../components/PayFromPhone.js'
import { useReturnFromApp } from '../../lib/useReturnFromApp.js'
import { shortDate } from '../../lib/notifications.js'
import { SubscriptionLine, SubscriptionNotice } from '../../components/SubscriptionNotice.js'
import {
  AppBar, Button, Card, CopyValue, EmptyState, Field, Loading, Notice,
  Rupees, TextInput, useAsync,
} from '../../components/ui.js'
import {
  IconAllClear, IconCheck, IconTraining, IconWaiting, IconWarn, IconWhatsapp,
} from '../../components/icons.js'

/* ================================================================== */
/* Pay the 50 rupees. She pays the admin account from her own UPI app,  */
/* then types the reference number back in. No gateway.                 */
/* ================================================================== */

/** What the ₹50 is for, in the UPI note her bank statement keeps. */
const PLAN_NOTE = 'subscription'

export function Subscription() {
  const t = useT()
  const { toast } = useToast()
  const nav = useNavigate()
  const [data, loading] = useAsync(() => api.subscription(), [])

  const [utr, setUtr] = useState('')
  const [shot, setShot] = useState<{ url: string; publicId: string } | null>(null)
  /** Uploads switched off on the server: there is no way to attach one. */
  const [shotUnavailable, setShotUnavailable] = useState(false)
  /**
   * When she paid, pre-filled with now. She is nearly always sending this
   * straight after paying, so the default is right and she only touches it if
   * she paid earlier - but it is on the screen, because the admin checks it
   * against the time in her screenshot.
   */
  const [paidAt, setPaidAt] = useState(() => toLocalInput(new Date()))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  /**
   * Set when she comes back from her UPI app.
   *
   * Up here with the others, and not beside the handler that uses it, because
   * three of the returns below this line are early ones: a hook after them
   * runs on some renders and not others, and React counts hooks rather than
   * naming them - "Rendered more hooks than during the previous render", every
   * time the screen went from loading to loaded.
   */
  const [backFromUpi, setBackFromUpi] = useState(false)

  /**
   * She has been to her UPI app and come back. Scroll the reference box into
   * view and put the cursor in it: a woman who has just paid ₹50 should not
   * have to work out what this screen wants next.
   */
  function askForUtr() {
    setBackFromUpi(true)
    const box = document.getElementById('utr')
    box?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    box?.focus({ preventScroll: true })
  }
  // A hook, so above the early returns for the same reason as the state above.
  const waitForReturn = useReturnFromApp(askForUtr)

  if (loading) {
    return <><AppBar title={t('pay.title')} backTo="/seller" /><div className="screen"><Loading /></div></>
  }
  if (!data) {
    return <><AppBar title={t('pay.title')} backTo="/seller" /><div className="screen"><Loading /></div></>
  }

  const { account, plan, slots, payments, payable, subscription } = data
  /**
   * What this ₹50 is for. The server lists what she may pay for, most urgent
   * first - a renewal before a pack - and this screen pays for that one. Once
   * a renewal is approved, a full meter offers the pack on her next visit.
   */
  const kind = payable?.[0]
  const renewing = kind === 'RENEWAL'
  const title = renewing ? t('pay.renewTitle') : t('pay.title')

  /**
   * ALREADY PAID? THEN THERE IS NOTHING TO DO ON THIS SCREEN.
   *
   * A woman who has sent her UTR and comes back here sees a form asking for
   * money again, and the reasonable thing to do with a form is fill it in -
   * which puts a second ₹50 row in the admin queue for one payment. The
   * waiting screen answers the only question she actually has.
   */
  if (payments.some((p) => p.status === 'PENDING')) {
    return <Navigate to="/seller/waiting" replace />
  }

  /**
   * Slots left means nothing to buy. ₹50 buys 5 more; selling them to a woman
   * with three empty ones is taking money for something she already has. The
   * server refuses this too - the screen just says so first, and in Marathi.
   */
  if (!kind) {
    return (
      <>
        <AppBar title={t('pay.title')} backTo="/seller" />
        <div className="screen stack">
          <Card>
            <EmptyState
              icon={IconCheck}
              title={t('pay.notNeeded')}
              body={t('pay.notNeededSub', { n: slots.left })}
              action={<Button onClick={() => nav('/seller/upload')}>{t('prod.add')}</Button>}
            />
            <div className="center"><SubscriptionLine view={subscription} /></div>
          </Card>
          <Button variant="ghost" onClick={() => nav('/seller/products')}>{t('biz.myProducts')}</Button>
        </div>
      </>
    )
  }

  // The same three the server insists on. The button stays off until all of
  // them are there, so she is never told off after pressing it.
  const shotRequired = data.screenshotRequired && !shotUnavailable
  const paidAtIso = fromLocalInput(paidAt)
  const timeFault = paidAtProblem(paidAtIso)
  const ready = isValidUtr(utr) && (!shotRequired || !!shot) && !timeFault

  async function submit() {
    const problem = utrProblem(utr)
    if (problem) {
      setErr(problem)
      return
    }
    setBusy(true)
    try {
      await api.submitPayment(kind!, normalizeUtr(utr), paidAtIso, shot?.url)
      toast(t('ok.paymentSubmitted'))
      nav('/seller/waiting', { replace: true })
    } catch (e) {
      setErr(e instanceof ApiError ? (e.messageMr ?? e.message) : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  // The same builder the buyer's payment uses: hand-rolling the query string
  // here meant two places deciding how an amount is formatted.
  const upiLink = buildUpiLink({
    upiId: account.upiId,
    name: account.label,
    amount: plan.price,
    note: `Shantai Mahila Bazar ${renewing ? 'renewal' : PLAN_NOTE}`,
  })

  return (
    <>
      <AppBar title={title} backTo="/seller" />
      <div className="screen stack">
        {/* A renewal says what she is buying back: time, with everything she
            already has kept as it is - the one question a woman whose shop has
            just gone quiet will ask before paying again. */}
        {renewing && <SubscriptionNotice view={subscription} />}
        <Card style={{ textAlign: 'center' }}>
          <div className="hero-num"><Rupees value={plan.price} /></div>
          <p className="muted" style={{ marginTop: 'var(--s2)' }}>
            {renewing ? t('pay.renewWhat', { n: plan.months }) : t('pay.what')}
          </p>
        </Card>

        <Card>
          <div className="section-title">{t('pay.payTo')}</div>
          <div className="stack-sm">
            <QrCode value={upiLink} size={200} label={t('pay.scanQr')} />
            {/* One phone cannot scan its own screen, and a pay link to the
                college's personal UPI ID is declined by PhonePe and Google
                Pay. A screenshot of this code, scanned from the gallery
                inside her UPI app, is a payment they accept. */}
            <PaySteps screenshot={data.screenshotRequired} />
            {/* The name as PRINTED on the poster, so she can check it against
                the payee her own UPI app shows after scanning. Two names that
                do not match is the one signal she has that something is
                wrong, and it is worth more than any warning we could write. */}
            <div className="center">
              <div className="small dim">{t('pay.payeeName')}</div>
              <strong>{account.label}</strong>
            </div>
            {/* The other route those apps accept: paste the ID. Copyable, not
                just printed - a UPI ID wrong by one character pays a stranger. */}
            <div className="center">
              <div className="dim">{t('pay.orUpiId')}</div>
              <CopyValue value={account.upiId} onCopied={waitForReturn} />
            </div>
            <div className="small dim center">
              {[account.bankName, account.accountNo && `A/C ${account.accountNo}`, account.ifsc]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        </Card>

        <Card>
          <div className="section-title">{t('pay.afterPaying')}</div>
          <div className="stack">
            {/* Put in front of her the moment she comes back from her UPI
                app. The reference is the whole reason this form exists, and
                the tap after a payment is Back. */}
            {backFromUpi && <Notice tone="warn">{t('pay.backAskUtr')}</Notice>}

            <Field label={t('pay.utr')} hint={t('pay.utrHint')} error={err} required htmlFor="utr">
              <TextInput
                id="utr"
                inputMode="numeric"
                value={utr}
                error={!!err}
                onChange={(e) => { setUtr(e.target.value.replace(/\s/g, '')); setErr('') }}
                placeholder="512309887711"
              />
            </Field>
            {/* Required, not optional. Anybody can type twelve digits; the
                success screen from her UPI app, with the UTR, the date and
                the time on it, is what an admin actually approves on. It goes
                into the signed `payment` folder, and the server accepts no
                other link. */}
            <Field
              label={shotRequired ? t('pay.screenshot') : `${t('pay.screenshot')} (${t('common.optional')})`}
              hint={t('pay.screenshotHint')}
              required={shotRequired}
            >
              <PhotoPicker
                kind="payment"
                label={t('pay.screenshot')}
                imageUrl={shot?.url}
                onUploaded={setShot}
                onCleared={() => setShot(null)}
                onUnavailable={() => setShotUnavailable(true)}
              />
            </Field>

            <Field label={t('pay.paidAt')} hint={t('pay.paidAtHint')} error={timeFault ?? undefined} required htmlFor="paidAt">
              <input
                id="paidAt"
                className={`input ${timeFault ? 'input--err' : ''}`}
                type="datetime-local"
                value={paidAt}
                max={toLocalInput(new Date(Date.now() + 10 * 60 * 1000))}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </Field>
          </div>
        </Card>

        {/* Says what is still missing, rather than leaving a grey button to
            explain itself. */}
        {!ready && isValidUtr(utr) && shotRequired && !shot && (
          <Notice tone="warn">{t('pay.needScreenshot')}</Notice>
        )}

        <Button onClick={() => void submit()} disabled={busy || !ready}>
          {busy ? t('common.loading') : t('pay.submit')}
        </Button>
      </div>
    </>
  )
}

/**
 * `<input type="datetime-local">` speaks the phone's local time with no zone -
 * "2026-09-15T14:05" - and the server stores an instant. These two convert,
 * so a woman in IST picking 2:05 pm is recorded as 2:05 pm IST.
 */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

/* ================================================================== */
/* THE WAITING SCREEN                                                   */
/* A full screen, not a toast and not a banner she can miss. It answers  */
/* the only question she has: did my 50 rupees go through?              */
/* ================================================================== */

export function PaymentWaiting() {
  const t = useT()
  const nav = useNavigate()
  const [data, loading, setData] = useAsync(() => api.subscription(), [])

  /**
   * Poll while she is waiting.
   *
   * She is sitting on this screen precisely because she is waiting on someone
   * else, so the screen has to change by itself. Making her pull-to-refresh to
   * discover she was approved is the one interaction this audience will not
   * think to try. Ten seconds is frequent enough to feel immediate and light
   * enough for rural 4G, and it stops the moment she is approved or rejected.
   */
  /**
   * Settled when HER LATEST PAYMENT is decided - not when her account status
   * changes. A seller renewing, or buying a second pack, is ACTIVE before she
   * pays and after, so reading the status told her "approved" the moment she
   * sent her UTR.
   */
  const latestStatus = data?.payments[0]?.status
  const settled = !!data && latestStatus !== 'PENDING'

  // Not while the app is in the background: approval can take a day, and a
  // phone left on this screen asked every ten seconds for all of it, which
  // kept the API's Cloud Run instance up (and billed) the whole time.
  // Returning to the app asks at once, so she still sees the answer first.
  useEffect(() => {
    if (loading || settled) return
    const poll = () => {
      if (document.visibilityState !== 'visible') return
      api.subscription().then(setData).catch(() => {
        /* offline for a moment - the next tick will pick it up */
      })
    }
    const id = setInterval(poll, 10_000)
    document.addEventListener('visibilitychange', poll)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', poll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, settled])

  if (loading || !data) {
    return <div className="app-shell"><div className="screen"><Loading /></div></div>
  }

  const latest = data.payments[0]

  // A renewal comes back to a shop that is open again, not to "add your
  // first product" - she already has them.
  if (latest?.status === 'APPROVED' && latest.kind === 'RENEWAL') {
    return (
      <div className="app-shell">
        <div className="screen screen--nonav stack center" style={{ justifyContent: 'center', minHeight: '100vh' }}>
          <div className="bigstate" aria-hidden="true"><IconCheck /></div>
          <h1 className="h1">{t('wait.renewed')}</h1>
          <p className="muted">{t('wait.renewedSub', { date: shortDate(data.subscription?.endsAt) })}</p>
          <Button onClick={() => nav('/seller', { replace: true })}>{t('biz.title')}</Button>
        </div>
      </div>
    )
  }

  if (latest?.status === 'APPROVED' || (!latest && data.status === 'ACTIVE')) {
    return (
      <div className="app-shell">
        <div className="screen screen--nonav stack center" style={{ justifyContent: 'center', minHeight: '100vh' }}>
          <div className="bigstate bigstate--ok" aria-hidden="true"><IconAllClear /></div>
          <h1 className="h1">{t('wait.approved')}</h1>
          <p className="muted">{t('wait.approvedSub')}</p>
          <Button onClick={() => nav('/seller/upload', { replace: true })}>{t('wait.addFirst')}</Button>
          <Button variant="quiet" onClick={() => nav('/seller', { replace: true })}>{t('biz.title')}</Button>
        </div>
      </div>
    )
  }

  if (latest?.status === 'REJECTED') {
    return (
      <div className="app-shell">
        <AppBar title={t('pay.title')} />
        <div className="screen screen--nonav stack">
          <div className="center stack-sm">
            <div className="bigstate bigstate--warn" aria-hidden="true"><IconWarn /></div>
            <h1 className="h1">{t('wait.rejected')}</h1>
          </div>
          {latest?.rejectReason && <Notice tone="danger">{latest.rejectReason}</Notice>}
          <Button onClick={() => nav('/seller/subscription')}>{t('wait.resubmit')}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <AppBar title={t('pay.title')} />
      <div className="screen screen--nonav stack">
        <div className="center stack-sm" style={{ paddingTop: 'var(--s5)' }}>
          <div className="bigstate" aria-hidden="true"><IconWaiting /></div>
          <h1 className="h1">{t('wait.title')}</h1>
          <p className="h3" style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{t('wait.sub')}</p>
        </div>

        <Notice tone="info">{t('wait.eta')}</Notice>

        {latest && (
          <Card>
            <div className="section-title">{t('wait.youSent')}</div>
            <div className="stack-sm">
              <div className="row-between">
                <span className="dim">{t('pay.title')}</span>
                <strong><Rupees value={latest.amount} /></strong>
              </div>
              <div className="row-between">
                <span className="dim">{t('pay.utr')}</span>
                <strong className="num">{latest.utr}</strong>
              </div>
              <div className="row-between">
                <span className="dim">{t('common.today')}</span>
                <span className="num">
                  {new Date(latest.submittedAt).toLocaleString('en-IN', {
                    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </Card>
        )}

        <p className="muted small">{t('wait.canDoMeanwhile')}</p>

        <div className="btn-row">
          <Button variant="ghost" onClick={() => nav('/seller/help')}><IconTraining aria-hidden="true" /> {t('wait.watchTraining')}</Button>
          <Button variant="ghost" onClick={() => nav('/seller/help')}><IconWhatsapp aria-hidden="true" /> {t('wait.contactHelp')}</Button>
        </div>
        <Button variant="quiet" onClick={() => nav('/seller')}>{t('biz.title')}</Button>
      </div>
    </div>
  )
}
