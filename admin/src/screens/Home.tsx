import { useNavigate } from 'react-router-dom'
import { useT } from '../i18n/I18nProvider.js'
import { api } from '../lib/api.js'
import { rupees } from '../lib/format.js'
import { useAuth } from '../store/AuthContext.js'
import { TopBar } from '../components/Shell.js'
import { Card, ErrorNote, Loading, SectionTitle, useAsync } from '../components/ui.js'
import {
  IconAllClear, IconGo, IconImpact, IconOrders, IconPayments, IconProducts,
  IconSellers, IconToday,
} from '../components/icons.js'

/**
 * Where an admin lands after signing in.
 *
 * Two jobs, in this order: say whether anything needs doing, then get her to
 * the right section in one click. The queue comes first because a woman who
 * has paid ₹50 cannot sell anything until somebody clears it - that is a
 * person waiting, not a metric.
 *
 * The numbers underneath are context, not the point. The full dashboard lives
 * on Today; this is the front door.
 */
export function Home() {
  const t = useT()
  const nav = useNavigate()
  const { session } = useAuth()
  const [data, loading, error] = useAsync(() => api.stats(), [])

  const s = data?.stats
  const queue = s ? s.pendingPayments + s.pendingProducts + s.stuckOrders : 0

  const sections = [
    { to: '/payments', icon: IconPayments, label: t('nav.payments'), body: t('home.sectionPayments'), badge: s?.pendingPayments },
    { to: '/products', icon: IconProducts, label: t('nav.products'), body: t('home.sectionProducts'), badge: s?.pendingProducts },
    { to: '/sellers', icon: IconSellers, label: t('nav.sellers'), body: t('home.sectionSellers') },
    { to: '/orders', icon: IconOrders, label: t('nav.orders'), body: t('home.sectionOrders'), badge: s?.stuckOrders },
    { to: '/impact', icon: IconImpact, label: t('nav.impact'), body: t('home.sectionImpact') },
    { to: '/today', icon: IconToday, label: t('nav.today'), body: t('home.sectionToday') },
  ]

  return (
    <>
      <TopBar title={`${t('home.greeting')}, ${session?.name ?? ''}`.trim()} sub={t('home.sub')} />

      <div className="body stack">
        <ErrorNote error={error} />

        <section>
          <SectionTitle>{t('today.needsYou')}</SectionTitle>
          {loading ? (
            <Loading />
          ) : queue === 0 ? (
            <Card>
              <div className="row" style={{ gap: 10 }}>
                <span className="allclear__i" aria-hidden="true"><IconAllClear /></span>
                <div>
                  <div className="strong">{t('today.allClear')}</div>
                  <div className="small dim">{t('home.queueEmpty')}</div>
                </div>
              </div>
            </Card>
          ) : (
            <div className="tiles">
              <QueueTile n={s!.pendingPayments} label={t('today.pendingPayments')} onClick={() => nav('/payments')} />
              <QueueTile n={s!.pendingProducts} label={t('today.pendingProducts')} onClick={() => nav('/products')} />
              <QueueTile n={s!.stuckOrders} label={t('today.stuckOrders')} onClick={() => nav('/orders')} />
            </div>
          )}
        </section>

        {s && (
          <section>
            <SectionTitle>{t('today.health')}</SectionTitle>
            <div className="tiles">
              <MiniStat n={s.activeSellers} label={t('today.activeSellers')} />
              {/* Renewals are hers to pay, not ours to approve, so these are not
                  in the queue above - but a woman whose shop is about to pause,
                  or has, is the call a coordinator should be making. */}
              <MiniStat n={s.subscriptionsExpiring} label={t('today.subsExpiring')} />
              <MiniStat n={s.subscriptionsExpired} label={t('today.subsExpired')} />
              <MiniStat n={s.newRegistrations} label={t('today.newThisWeek')} />
              <MiniStat n={s.ordersWeek} label={t('today.ordersWeek')} />
              <MiniStat n={rupees(s.womenEarnedMonth)} label={t('today.earnedMonth')} />
              {/* Firestore is on the free Spark plan and every server start
                  reads every document, so these two are the early warning
                  for a start that is refused and takes the API down until
                  the reset (docs/CAPACITY.md §4). */}
              <MiniStat n={s.databaseDocuments} label={t('today.dbDocuments')} />
              <MiniStat n={s.startsWithinFreeReads} label={t('today.dbStarts')} />
            </div>
          </section>
        )}

        <section>
          <SectionTitle>{t('home.goto')}</SectionTitle>
          <div className="seccards">
            {sections.map(({ to, icon: Icon, label, body, badge }) => (
              <button key={to} type="button" className="seccard" onClick={() => nav(to)}>
                <span className="seccard__icon" aria-hidden="true"><Icon /></span>
                <span className="seccard__body">
                  <span className="seccard__t">
                    {label}
                    {!!badge && <span className="navlink__badge num">{badge}</span>}
                  </span>
                  <span className="seccard__d">{body}</span>
                </span>
                <span className="seccard__go" aria-hidden="true"><IconGo /></span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}

function QueueTile({ n, label, onClick }: { n: number; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`tile ${n > 0 ? 'tile--action' : 'tile--zero'}`}
      onClick={onClick}
      disabled={n === 0}
    >
      <div className="tile__n">{n}</div>
      <div className="tile__l">{label}</div>
    </button>
  )
}

function MiniStat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="tile">
      <div className="tile__n tile__n--mini">{n}</div>
      <div className="tile__l">{label}</div>
    </div>
  )
}
