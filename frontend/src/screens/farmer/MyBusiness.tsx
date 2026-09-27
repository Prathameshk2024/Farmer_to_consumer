import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Order } from '@shared/types.js'
import { daysUntilScrub } from '@shared/accountClose.js'
import { needsFarmerAction, STATUS_STYLE, statusLabelKey } from '@shared/orderFlow.js'
import { useT } from '../../i18n/I18nProvider.js'
import { useToast } from '../../store/ToastContext.js'
import { api } from '../../lib/api.js'
import {
  AppBar, Button, Card, EmptyState, Loading, Notice,
  Pill, Rupees, SectionTitle, useAsync,
} from '../../components/ui.js'
import {
  IconAllClear, IconBuyers, IconChevron, IconGrowth, IconOrders, IconPause, IconPlay, IconProduct, StatusIcon, type IconType,
} from '../../components/icons.js'
import { RatingLine } from '../../components/Reviews.js'
import { PageTour } from '../../components/Walkthrough.js'

/**
 * My Business - the daily driver. The order of things on this screen is the
 * design: what needs doing, then what they have earned, then everything else.
 */
export default function MyBusiness() {
  const t = useT()
  const nav = useNavigate()

  const [me, loadingMe, setMe] = useAsync(() => api.me(), [])
  const [orderData, loadingOrders] = useAsync(() => api.myOrders(), [], 'farmer:orders')
  // Not waited on: reviews are not what they opened this screen to act on.
  const [reviewData] = useAsync(() => api.myReviews(), [])
  const { toast } = useToast()
  const [restoring, setRestoring] = useState(false)

  if (loadingMe || loadingOrders) {
    return (
      <>
        <AppBar brand title={t('biz.title')} />
        <div className="screen"><Loading /></div>
      </>
    )
  }
  if (!me) {
    return (
      <>
        <AppBar brand title={t('biz.title')} />
        <div className="screen"><EmptyState title="—" /></div>
      </>
    )
  }

  const farmer = me.farmer
  const orders = orderData?.orders ?? []
  const actionable = orders.filter(needsFarmerAction)

  // Earned today = orders actually DELIVERED today, read off the event trail
  // rather than the placed date. An order placed Monday and delivered
  // Wednesday is Wednesday's earnings.
  const isToday = (iso?: string) =>
    !!iso && new Date(iso).toDateString() === new Date().toDateString()

  const todayEarnings = orders
    .filter((o) => isToday(o.events.find((e) => e.to === 'DELIVERED')?.at))
    .reduce((n, o) => n + o.total, 0)

  const todayOrders = orders.filter((o) => isToday(o.placedAt)).length

  async function toggleShop() {
    const res = await api.updateMe({ isOpen: !farmer.isOpen })
    setMe({ ...me!, farmer: res.farmer })
  }

  return (
    <>
      <AppBar
        brand
        title={farmer.shopName}
        sub={`${farmer.farmerCode} · ${farmer.village}`}
      />

      <div className="screen stack">
        {/* First thing on the screen when it applies. Being blocked is not the
            same as waiting for approval and must not read like it: they are told
            plainly, given the admin's reason if there was one, and pointed at
            support rather than left to wonder why their shop went quiet. */}
        {farmer.status === 'BLOCKED' && (
          <Notice tone="danger" title={t('biz.blockedTitle')}>
            <div>{t('biz.blockedBody')}</div>
            {farmer.blockReason && (
              <div style={{ marginTop: 6 }}>
                <strong>{t('biz.blockedReason')}:</strong> {farmer.blockReason}
              </div>
            )}
          </Notice>
        )}

        {/* THEY ASKED FOR THE ACCOUNT TO BE DELETED, AND CAME BACK.
            The week between asking and erasing exists for exactly this
            moment, so the way out of it is the first thing on their home
            screen - not buried in the profile they would have to go looking
            through, having already decided once to leave. */}
        {farmer.status === 'CLOSED' && farmer.closingAt && (
          <Notice tone="danger" title={t('close.closingTitle')}>
            <div>{t('close.closingBody', { days: daysUntilScrub(farmer.closingAt) })}</div>
            <div style={{ marginTop: 'var(--s3)' }}>
              <Button
                size="sm"
                disabled={restoring}
                onClick={() => {
                  setRestoring(true)
                  void api.restoreFarmerAccount()
                    .then(async () => { toast(t('close.restored')); setMe(await api.me()) })
                    .catch(() => toast(t('close.restoreFailed')))
                    .finally(() => setRestoring(false))
                }}
              >
                {t('close.restore')}
              </Button>
            </div>
          </Notice>
        )}

        {/* Registered and waiting for the one check. Nothing they list is
            public until then, so they are told why rather than left guessing. */}
        {farmer.status === 'PENDING_VERIFICATION' && (
          <Notice tone="warn">{t('biz.pendingVerification')}</Notice>
        )}

        {/* Shop open toggle: one tap, right at the top. */}
        <Card className={farmer.isOpen ? '' : 'notice--warn'} data-wt="biz-shop">
          <div className="row-between">
            <div className="stack-sm" style={{ gap: 2 }}>
              <strong>{farmer.isOpen ? t('biz.shopOpen') : t('biz.shopClosed')}</strong>
              <span className="small dim">{t('biz.shopOpenHint')}</span>
            </div>
            <Button variant={farmer.isOpen ? 'quiet' : 'primary'} size="sm" onClick={toggleShop} style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}>
              {farmer.isOpen ? <IconPause aria-hidden="true" /> : <IconPlay aria-hidden="true" />}
              <span>{farmer.isOpen ? t('biz.closeShop') : t('biz.openShop')}</span>
            </Button>
          </div>
        </Card>

        <div className="stat-row">
          <Card>
            <div className="small dim">{t('biz.earnToday')}</div>
            <div className="hero-num" style={{ fontSize: 'var(--t-xl)' }}>
              <Rupees value={todayEarnings} />
            </div>
          </Card>
          <Card>
            <div className="small dim">{t('biz.ordersToday')}</div>
            <div className="hero-num num" style={{ fontSize: 'var(--t-xl)' }}>{todayOrders}</div>
          </Card>
        </div>

        {/* THE ACTION QUEUE - the most important widget in the app. */}
        <div data-wt="biz-action">
          <SectionTitle
            action={
              <button className="btn btn--quiet btn--sm" onClick={() => nav('/farmer/orders')}>
                {t('common.viewAll')}
              </button>
            }
          >
            {t('biz.needsAction')}
          </SectionTitle>

          {actionable.length === 0 ? (
            <Card>
              <EmptyState icon={IconAllClear} title={t('biz.noAction')} body={t('biz.noActionSub')} />
            </Card>
          ) : (
            <div className="stack-sm">
              {actionable.map((o) => (
                <ActionRow key={o.id} order={o} onOpen={() => nav(`/farmer/orders/${o.id}`)} />
              ))}
            </div>
          )}
        </div>

        {/* Their rating - their products' ratings together, exactly as buyers see
            it on their card - and one tap to what they said. */}
        <button className="card card--tap" onClick={() => nav('/farmer/reviews')}>
          <div className="row-between">
            <div className="stack-sm" style={{ gap: 2 }}>
              <strong>{t('rev.title')}</strong>
              {/* The same number buyers see on their card. */}
              <RatingLine average={reviewData?.summary.average} count={reviewData?.summary.count} />
            </div>
            <IconChevron aria-hidden="true" />
          </div>
        </button>

        <div className="pgrid pgrid--2" data-wt="biz-links">
          <QuickLink icon={IconProduct} label={t('biz.myProducts')} to="/farmer/products" />
          <QuickLink icon={IconOrders} label={t('biz.myOrders')} to="/farmer/orders" />
          <QuickLink icon={IconGrowth} label={t('biz.myGrowth')} to="/farmer/growth" />
          <QuickLink icon={IconBuyers} label={t('buy.tile')} to="/farmer/buyers" />
        </div>
      </div>

      <PageTour id="farmer.business" />
    </>
  )
}

function QuickLink({ icon: Icon, label, to }: { icon: IconType; label: string; to: string }) {
  const nav = useNavigate()
  return (
    <button className="card card--tap" onClick={() => nav(to)} style={{ textAlign: 'center' }}>
      <div className="quicklink__icon" aria-hidden="true"><Icon /></div>
      <div style={{ fontWeight: 700, marginTop: 4 }}>{label}</div>
    </button>
  )
}

/**
 * A row in the action queue. It says what they must DO, not what state the
 * order is in - "Payment received?" beats "UPI_SUBMITTED".
 */
function ActionRow({ order, onOpen }: { order: Order; onOpen: () => void }) {
  const t = useT()
  const style = STATUS_STYLE[order.status]

  const awaitingPayment =
    order.paymentMode === 'UPI' && order.paymentStatus === 'UPI_SUBMITTED'

  const todo = awaitingPayment
    ? t('ord.paymentPending')
    : order.status === 'PLACED'
      ? t('ord.accept')
      : order.status === 'ACCEPTED'
        ? t('ord.markPacked')
        : order.status === 'PACKED'
          ? t('ord.markOut')
          : t('ord.markDelivered')

  return (
    <button className="tile" onClick={onOpen}>
      <div className="tile__img" aria-hidden="true"><StatusIcon name={style.icon} /></div>
      <div className="tile__body">
        <div className="tile__title">{todo}</div>
        <div className="tile__meta">{order.id} · {order.customerName}</div>
        <div className="wrap-row" style={{ marginTop: 2 }}>
          <Pill tone={style.tone} icon={<StatusIcon name={style.icon} />}>{t(statusLabelKey(order.status, order.fulfilment))}</Pill>
          <Pill tone="neutral">
            {order.paymentMode === 'COD' ? t('ord.paymentCod') : t('ord.paymentUpi')}
          </Pill>
        </div>
      </div>
      <div className="tile__price"><Rupees value={order.total} /></div>
    </button>
  )
}
