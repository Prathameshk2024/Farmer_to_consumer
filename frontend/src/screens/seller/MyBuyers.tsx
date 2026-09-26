import { useT } from '../../i18n/I18nProvider.js'
import { api } from '../../lib/api.js'
import { Avatar } from '../../components/Avatar.js'
import type { SellerBuyer } from '../../lib/api.js'
import {
  AppBar, Card, EmptyState, Loading, Pill, Rupees, SectionTitle, useAsync,
} from '../../components/ui.js'
import { IconBuyers, IconCall } from '../../components/icons.js'

/**
 * Who buys from her.
 *
 * A shopkeeper knows her regulars by face. Selling through an app takes that
 * away, so this gives it back: who came back, how often, and how long since.
 *
 * Everything shown here she has already seen on her own order screens - this
 * only gathers it. The server derives the list from her orders alone, so a
 * buyer's dealings with any other seller are not hers to see.
 */
export function MyBuyers() {
  const t = useT()
  const [data, loading] = useAsync(() => api.myBuyers(), [])

  if (loading) {
    return <><AppBar title={t('buy.title')} backTo="/seller" /><div className="screen"><Loading /></div></>
  }

  const buyers = data?.buyers ?? []

  return (
    <>
      <AppBar title={t('buy.title')} backTo="/seller" />
      <div className="screen stack">
        {buyers.length === 0 ? (
          <EmptyState icon={IconBuyers} title={t('buy.none')} body={t('buy.noneSub')} />
        ) : (
          <>
            <SectionTitle>
              {t('buy.count')}: <span className="num">{buyers.length}</span>
            </SectionTitle>
            {buyers.map((b) => <BuyerCard key={b.customerId} buyer={b} t={t} />)}
          </>
        )}
      </div>
    </>
  )
}

function BuyerCard({ buyer, t }: { buyer: SellerBuyer; t: (k: string) => string }) {
  return (
    <Card>
      <div className="row">
        <Avatar name={buyer.name} size={44} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>{buyer.name}</div>
          <div className="small dim num">+91 {buyer.phone}</div>
        </div>
        {buyer.orderCount > 1 && <Pill tone="ok">{t('buy.repeat')}</Pill>}
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <div className="small dim">{t('buy.orders')}</div>
          <div className="num" style={{ fontWeight: 700 }}>{buyer.orderCount}</div>
        </div>
        <div>
          <div className="small dim">{t('buy.spent')}</div>
          <div style={{ fontWeight: 700 }}><Rupees value={buyer.totalSpent} /></div>
        </div>
      </div>

      <div className="small dim" style={{ marginTop: 8 }}>
        {t('buy.lastOrder')}: {formatDate(buyer.lastOrderAt)}
      </div>
      <div className="small dim">{buyer.lastAddress} - {buyer.pincode}</div>

      <a className="btn btn--ghost btn--sm" href={`tel:${buyer.phone}`} style={{ marginTop: 8 }}>
        <IconCall aria-hidden="true" /> {t('buy.call')}
      </a>
    </Card>
  )
}

/** Day and month only. A year is noise when the whole list is recent. */
function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
