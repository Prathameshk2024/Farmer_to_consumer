import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Order, OrderStatus } from '@shared/types.js'
import {
  HAPPY_PATH, SELLER_ACTIONS, STATUS_STYLE, awaitingPaymentConfirmation,
  statusLabelKey, stepIndex, type SellerAction,
} from '@shared/orderFlow.js'
import { MAX_DELIVERY_ESTIMATE } from '@shared/orderFlow.js'
import { sellerCanCancel } from '@shared/orderCancel.js'
import { useT } from '../../i18n/I18nProvider.js'
import { CancelOrderSheet, OrderEndedNotice, RefundNotice } from '../../components/OrderCancel.js'
import { api, ApiError } from '../../lib/api.js'
import { useToast } from '../../store/ToastContext.js'
import {
  AppBar, Button, Card, Choice, ConfirmSheet, EmptyState,
  Loading, Notice, Pill, Rupees, SectionTitle, VoiceInput, useAsync,
} from '../../components/ui.js'
import { ReviewList } from '../../components/Reviews.js'
import {
  IconCall, IconCheck, IconMap, IconOrders, IconProduct, StatusIcon,
} from '../../components/icons.js'

const TABS: { id: string; labelKey: string; statuses?: OrderStatus[] }[] = [
  { id: 'action', labelKey: 'biz.needsAction' },
  // ACCEPTED, PACKED and OUT_FOR_DELIVERY are one tab: from her side they are
  // the same order, in hand and not yet delivered. Splitting them gave three
  // tabs that were each empty most of the time.
  { id: 'accepted', labelKey: 'ord.accepted', statuses: ['ACCEPTED', 'PACKED', 'OUT_FOR_DELIVERY'] },
  { id: 'done', labelKey: 'ord.delivered', statuses: ['DELIVERED'] },
  { id: 'cancelled', labelKey: 'ord.cancelled', statuses: ['REJECTED', 'CANCELLED'] },
]

export function SellerOrders() {
  const t = useT()
  const nav = useNavigate()
  const [tab, setTab] = useState('action')
  const [data, loading] = useAsync(() => api.myOrders(), [], 'seller:orders')

  const orders = data?.orders ?? []
  const list = orders.filter((o) => {
    if (tab === 'action') {
      return (
        SELLER_ACTIONS[o.status].length > 0 ||
        (o.paymentMode === 'UPI' && o.paymentStatus === 'UPI_SUBMITTED')
      )
    }
    return TABS.find((x) => x.id === tab)?.statuses?.includes(o.status) ?? false
  })

  return (
    <>
      <AppBar title={t('biz.myOrders')} backTo="/seller" />
      <div className="hscroll" style={{ padding: 'var(--s3) var(--s4)', margin: 0 }}>
        {TABS.map((tb) => (
          <button
            key={tb.id}
            className={`chip ${tab === tb.id ? 'chip--on' : ''}`}
            onClick={() => setTab(tb.id)}
          >
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      <div className="screen stack-sm" style={{ paddingTop: 0 }}>
        {loading ? (
          <Loading />
        ) : list.length === 0 ? (
          <Card><EmptyState icon={IconOrders} title={t('ord.noOrders')} body={t('ord.noOrdersSub')} /></Card>
        ) : (
          list.map((o) => (
            <button key={o.id} className="tile" onClick={() => nav(`/seller/orders/${o.id}`)}>
              <div className="tile__img" aria-hidden="true"><StatusIcon name={STATUS_STYLE[o.status].icon} /></div>
              <div className="tile__body">
                <div className="tile__title">{o.customerName}</div>
                <div className="tile__meta">{o.id} · {o.items.length} {t('ord.items')}</div>
                <div className="wrap-row" style={{ marginTop: 2 }}>
                  <Pill tone={STATUS_STYLE[o.status].tone} icon={<StatusIcon name={STATUS_STYLE[o.status].icon} />}>
                    {t(statusLabelKey(o.status))}
                  </Pill>
                </div>
              </div>
              <div className="tile__price"><Rupees value={o.total} /></div>
            </button>
          ))
        )}
      </div>
    </>
  )
}

/* ================================================================== */
/* Order detail - where the state machine actually runs                */
/* ================================================================== */

export function SellerOrderDetail() {
  const { orderId } = useParams()
  const t = useT()
  const { toast } = useToast()
  const [data, loading, setData] = useAsync(() => api.order(orderId!), [orderId])

  const [confirm, setConfirm] = useState<SellerAction | null>(null)
  const [actionErr, setActionErr] = useState('')
  const [rejectOpen, setRejectOpen] = useState(false)
  /** The Accept she has tapped, while she is being asked how long it will take. */
  const [estimateFor, setEstimateFor] = useState<SellerAction | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (loading) {
    return <><AppBar title={t('ord.order')} backTo="/seller/orders" /><div className="screen"><Loading /></div></>
  }
  if (!data) {
    return <><AppBar title={t('ord.order')} backTo="/seller/orders" /><div className="screen"><EmptyState title="—" /></div></>
  }

  const order = data.order
  /**
   * The seller may ACCEPT an order they have not been paid for - that is the
   * point of paying after acceptance - but they do not PACK one. The server
   * refuses it too; hiding the button is what stops their finding that out by
   * being told no.
   */
  const unpaid = awaitingPaymentConfirmation(order)
  const actions = SELLER_ACTIONS[order.status].filter((a) => !(a.to === 'PACKED' && unpaid))
  const awaitingUpi = order.paymentMode === 'UPI' && order.paymentStatus === 'UPI_SUBMITTED'
  const waitingForBuyer = order.paymentMode === 'UPI' && order.paymentStatus === 'UPI_PENDING'
  const style = STATUS_STYLE[order.status]

  async function run(action: SellerAction, extra?: { reason?: string; deliveryEstimate?: string }) {
    setBusy(true)
    setActionErr('')
    try {
      const res = await api.advanceOrder(order.id, action.to, extra)
      setData({ ...data!, order: res.order })
      setRejectOpen(false)
      // Names the state she just moved it to, not a generic "saved" - the
      // whole doubt on this screen is which step the order is on now.
      toast(`${t('ok.orderUpdated')}: ${t(statusLabelKey(res.order.status))}`)
    } catch (e) {
      if (e instanceof ApiError) setActionErr(e.messageMr ?? e.message)
    } finally {
      setBusy(false)
    }
  }

  const buyer = order.customerName?.trim()

  async function confirmPayment() {
    setBusy(true)
    const res = await api.confirmPayment(order.id)
    setData({ ...data!, order: res.order })
    toast(t('ok.paymentConfirmed'))
    setBusy(false)
  }

  return (
    <>
      <AppBar
        title={`${t('ord.order')} ${order.id}`}
        backTo="/seller/orders"
      />

      <div className="screen stack">
        <div className="row-between">
          <Pill tone={style.tone} icon={<StatusIcon name={style.icon} />}>{t(statusLabelKey(order.status))}</Pill>
          <strong style={{ fontSize: 'var(--t-lg)' }}><Rupees value={order.total} /></strong>
        </div>

        {/* What she promised this buyer when she accepted, so she can see it
            on the screen where she decides what to do next. */}
        {order.deliveryEstimate && (
          <Notice tone="info" title={t('ord.etaLabel')}>{order.deliveryEstimate}</Notice>
        )}

        <OrderEndedNotice order={order} viewer="seller" />
        <RefundNotice order={order} viewer="seller" />

        {/* What this buyer said about each product on the order, where she
            can match it to what she sent. Read-only: see seller/Reviews.tsx. */}
        {data.reviews?.length > 0 && (
          <div>
            <SectionTitle>{t('rev.fromBuyer')}</SectionTitle>
            <ReviewList reviews={data.reviews} showProduct />
          </div>
        )}

        {/* The seller is being asked to deliver somewhere they have not listed, so the
            question is put in front of them before Accept. */}
        {order.outsideArea && (
          <Notice tone="warn" title={t('ord.outsideArea')}>
            {t('ord.outsideAreaSub', { pincode: order.pincode })}
          </Notice>
        )}

        {/* Accepted, and the buyer has not paid yet. Nothing for the seller to do
            but wait - and know that is what they are waiting for. The buyer is
            named rather than called "she": sellers here are women, buyers are
            anyone, and a pronoun guessed from nothing is wrong for half of them.
            Without a name on record it falls back to "the customer". */}
        {waitingForBuyer && order.status === 'ACCEPTED' && (
          buyer
            ? <Notice tone="warn" title={t('ord.awaitingBuyerNamed', { name: buyer })}>{t('ord.awaitingBuyerNamedSub', { name: buyer })}</Notice>
            : <Notice tone="warn" title={t('ord.awaitingBuyer')}>{t('ord.awaitingBuyerSub')}</Notice>
        )}

        {waitingForBuyer && order.status === 'PLACED' && (
          <Notice tone="info">{buyer ? t('ord.payAfterAcceptNamed', { name: buyer }) : t('ord.payAfterAccept')}</Notice>
        )}

        {awaitingUpi && (
          <Card className="notice--warn">
            <div className="stack-sm">
              <strong>{t('ord.paymentPending')}</strong>
              <div className="small muted">UTR: <span className="num">{order.paymentUtr}</span></div>
              <Button onClick={confirmPayment} disabled={busy}><IconCheck aria-hidden="true" /> {t('ord.paymentGot')}</Button>
            </div>
          </Card>
        )}
        {order.paymentStatus === 'UPI_CONFIRMED' && (
          <Notice tone="ok"><IconCheck aria-hidden="true" /> {t('ord.paymentDone')} · UPI</Notice>
        )}
        {order.paymentMode === 'COD' && (
          <Notice tone="info">{t('ord.paymentCod')} · <Rupees value={order.total} /></Notice>
        )}

        <Card>
          <div className="stack-sm">
            {order.items.map((i) => (
              <div key={i.productId} className="row-between">
                <div className="row">
                  <span className="lineicon" aria-hidden="true"><IconProduct /></span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{i.name}</div>
                    <div className="small dim num">{i.qty} × <Rupees value={i.price} /></div>
                  </div>
                </div>
                <Rupees value={i.qty * i.price} />
              </div>
            ))}
            <hr className="divider" style={{ margin: 'var(--s2) 0' }} />
            <div className="row-between small">
              <span className="dim">{t('cus.deliveryFee')}</span>
              <Rupees value={order.deliveryFee} />
            </div>
            <div className="row-between">
              <strong>{t('ord.total')}</strong>
              <strong><Rupees value={order.total} /></strong>
            </div>
          </div>
        </Card>

        <Card>
          <div className="stack-sm">
            <div className="section-title">{t('ord.customer')}</div>
            <strong>{order.customerName}</strong>
            <div className="small muted">{order.address}</div>
            {order.landmark && <div className="small dim">{order.landmark}</div>}
            <div className="small dim num">{order.pincode}</div>
            <div className="btn-row" style={{ marginTop: 'var(--s2)' }}>
              <a className="btn btn--ghost btn--sm" href={`tel:${order.customerPhone}`}>
                <IconCall aria-hidden="true" /> {t('ord.callCustomer')}
              </a>
              <a
                className="btn btn--ghost btn--sm"
                href={`https://maps.google.com/?q=${encodeURIComponent(order.address)}`}
                target="_blank"
                rel="noreferrer"
              >
                <IconMap aria-hidden="true" /> {t('ord.openMap')}
              </a>
            </div>
          </div>
        </Card>

        <Card>
          <div className="section-title">{t('cus.trackOrder')}</div>
          <Timeline order={order} />
        </Card>

        {actionErr && <Notice tone="danger">{actionErr}</Notice>}

        {/* Below everything and outside the action bar, on purpose: the bar
            is where her thumb goes forty times a day to move orders along,
            and "cancel" must never be the button that happens to be there. */}
        {sellerCanCancel(order.status) && (
          <Button variant="ghost" disabled={busy} onClick={() => setCancelOpen(true)}>
            {t('cancel.button')}
          </Button>
        )}

        {actions.length > 0 && (
          <div className="actionbar">
            {actions.map((a) => (
              <Button
                key={a.to}
                variant={a.tone === 'ghost' ? 'ghost' : 'primary'}
                disabled={busy}
                onClick={() => {
                  if (a.needsReason) setRejectOpen(true)
                  else if (a.needsEstimate) setEstimateFor(a)
                  else if (a.confirmKey) setConfirm(a)
                  else void run(a)
                }}
              >
                {t(a.labelKey)}
              </Button>
            ))}
          </div>
        )}
      </div>

      <CancelOrderSheet
        order={order}
        by="seller"
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onCancelled={(o) => {
          setData({ ...data!, order: o })
          toast(`${t('ok.orderUpdated')}: ${t(statusLabelKey(o.status))}`)
        }}
      />

      <ConfirmSheet
        open={!!confirm}
        title={confirm ? t(confirm.confirmKey!) : ''}
        body={confirm?.confirmSubKey ? t(confirm.confirmSubKey) : ''}
        confirmLabel={confirm ? t(confirm.labelKey) : ''}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const a = confirm!
          setConfirm(null)
          void run(a)
        }}
      />

      {/* "Yes" and "when?" are one moment for the buyer, so they are one
          moment here: she cannot accept without being asked how long it will
          take. She may still decline to answer - a promise nobody asked her
          to keep is worse than no promise - and the chips are there because
          typing Marathi is the barrier, not knowing the answer. */}
      {estimateFor && (
        <DeliveryEstimateSheet
          busy={busy}
          onSkip={() => {
            const a = estimateFor
            setEstimateFor(null)
            void run(a)
          }}
          onAccept={(deliveryEstimate) => {
            const a = estimateFor
            setEstimateFor(null)
            void run(a, { deliveryEstimate })
          }}
          onClose={() => setEstimateFor(null)}
        />
      )}

      {rejectOpen && (
        <div className="sheet-backdrop" onClick={() => setRejectOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="stack">
              <h2 className="h2">{t('ord.rejectReason')}</h2>
              <div className="stack-sm">
                {['ord.reasonStock', 'ord.reasonArea', 'ord.reasonClosed'].map((k) => (
                  <Choice
                    key={k}
                    selected={false}
                    onSelect={() =>
                      void run(
                        { to: 'REJECTED', labelKey: 'ord.reject', tone: 'ghost', needsReason: true },
                        { reason: t(k) },
                      )
                    }
                    title={t(k)}
                  />
                ))}
              </div>
              <Button variant="quiet" onClick={() => setRejectOpen(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** Draws the locked six-state happy path with the order's real timestamps. */
export function Timeline({ order }: { order: Order }) {
  const t = useT()
  const current = stepIndex(order.status)

  return (
    <div className="timeline">
      {HAPPY_PATH.map((s, i) => {
        const at = order.events.find((e) => e.to === s)?.at
        const cls = i < current ? 'tl--done' : i === current ? 'tl--now' : 'tl--todo'
        return (
          <div key={s} className={`tl ${cls}`}>
            <div className="tl__dot" aria-hidden="true">
              {i < current ? <IconCheck aria-hidden="true" /> : i === current ? <StatusIcon name={STATUS_STYLE[s].icon} /> : ''}
            </div>
            <div>
              <div className="tl__label">{t(statusLabelKey(s))}</div>
              {at && (
                <div className="tl__time">
                  {new Date(at).toLocaleString('en-IN', {
                    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * HOW LONG WILL IT TAKE?
 *
 * The buyer's next question after "yes" is always "when?", and until now the
 * app had no answer: she accepted, and the order screen said ACCEPTED and
 * nothing about time. So Accept asks her, at the one moment she knows - she
 * has just read the address, the quantity and what is on her shelf.
 *
 * Her words, not a date picker. The honest answer in a village with one bus a
 * day is "two days" or "Thursday, after the market", and a calendar would
 * make her invent a precision she does not have. The chips are the common
 * answers, because typing Marathi is the barrier here, not knowing the reply.
 *
 * Answering is not compulsory: "I will say later" accepts the order without a
 * promise. A time she was pushed into inventing is worse for the buyer than
 * no time at all.
 */
function DeliveryEstimateSheet({
  busy, onAccept, onSkip, onClose,
}: {
  busy: boolean
  onAccept: (estimate: string) => void
  onSkip: () => void
  onClose: () => void
}) {
  const t = useT()
  const [text, setText] = useState('')
  const quick = ['ord.etaToday', 'ord.etaTomorrow', 'ord.eta2Days', 'ord.eta3Days']

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="stack">
          <div className="stack-sm">
            <h2 className="h2">{t('ord.etaTitle')}</h2>
            <p className="body muted">{t('ord.etaHint')}</p>
          </div>

          <div className="wrap-row">
            {quick.map((k) => (
              <button
                key={k}
                type="button"
                className={`chip ${text === t(k) ? 'chip--on' : ''}`}
                onClick={() => setText(t(k))}
              >
                {t(k)}
              </button>
            ))}
          </div>

          <VoiceInput
            value={text}
            onChange={setText}
            maxLength={MAX_DELIVERY_ESTIMATE}
            placeholder={t('ord.etaPlaceholder')}
            speakHint
          />

          <div className="stack-sm">
            <Button disabled={busy || !text.trim()} onClick={() => onAccept(text.trim())}>
              {t('ord.accept')}
            </Button>
            <Button variant="quiet" disabled={busy} onClick={onSkip}>{t('ord.etaSkip')}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
