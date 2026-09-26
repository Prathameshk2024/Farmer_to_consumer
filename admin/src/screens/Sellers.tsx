import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n/I18nProvider.js'
import { IconGo, IconSellers } from '../components/icons.js'
import { api, type SellerRow } from '../lib/api.js'
import { TopBar } from '../components/Shell.js'
import { SortSelect, useSort } from '../components/SortSelect.js'
import { SELLER_SORTS, sortRows } from '../lib/sort.js'
import { SellerActions, StatusPill } from '../components/SellerActions.js'
import {
  Button, Card, CopyValue, EmptyState, ErrorNote, Loading, useAsync,
} from '../components/ui.js'

/**
 * The register of women on the programme.
 *
 * A line each, and no more: it is read by scanning, so the row answers "who is
 * this and is anything wrong" and leaves everything else to her own page.
 *
 * Nothing here deletes anybody, and nothing here happens on a single click.
 * Every action changes what a real farmer can do tomorrow - whether his shop
 * is visible at all - so each one states its
 * consequence and waits for a second confirmation.
 */
export function Sellers() {
  const t = useT()
  const [q, setQ] = useState('')
  /** Everyone, or only those waiting for their one verification. */
  const [waiting, setWaiting] = useState(false)
  const [data, loading, error, reload] = useAsync(() => api.sellers(), [])
  const [sort, setSort] = useSort('sellers', SELLER_SORTS)

  const rows = useMemo(() => {
    const all = (data?.sellers ?? []).filter((s) => !waiting || s.status === 'PENDING_VERIFICATION')
    const needle = q.trim().toLowerCase()
    const found = !needle
      ? all
      : all.filter((s) =>
          [s.name, s.shopName, s.village, s.phone, s.womenBizId]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(needle)),
        )
    return sortRows(found, SELLER_SORTS, sort)
  }, [data, q, sort, waiting])

  return (
    <>
      <TopBar title={t('se.title')} sub={data ? `${data.sellers.length}` : undefined} />
      <div className="body stack">
        <div className="row wrap">
          <input
            className="input"
            style={{ maxWidth: 320 }}
            placeholder={t('se.searchHint')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="select"
            style={{ maxWidth: 240 }}
            value={waiting ? 'waiting' : ''}
            onChange={(e) => setWaiting(e.target.value === 'waiting')}
            aria-label={t('se.status')}
          >
            <option value="">{t('c.all')}</option>
            <option value="waiting">{t('se.waitingVerification')}</option>
          </select>
          <SortSelect options={SELLER_SORTS} value={sort} onChange={setSort} />
        </div>

        <ErrorNote error={error} />

        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Card><EmptyState icon={IconSellers} title={t('se.empty')} body={t('se.emptySub')} /></Card>
        ) : (
          <div className="stack-sm">
            {rows.map((s) => <SellerCard key={s.id} seller={s} onDone={reload} />)}
          </div>
        )}
      </div>
    </>
  )
}

function SellerCard({ seller, onDone }: { seller: SellerRow; onDone: () => void }) {
  const t = useT()

  return (
    <Card>
      <div className="row wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="grow min0">
          <div className="row wrap" style={{ gap: 8 }}>
            {/* Her name and shop name exactly as she entered them. */}
            <span className="strong">{seller.name}</span>
            <span className="dim">{seller.shopName}</span>
            <StatusPill status={seller.status} />
          </div>
          <div className="small dim">
            <span className="mono">{seller.womenBizId}</span>
            {' · '}{t('se.village')}: {seller.village}
            {' · '}<span className="mono">{seller.phone}</span>
          </div>
          <div className="small dim-2">
            {t('se.products')}: <span className="num">{seller.productCount}</span>
            {' · '}{t('se.readiness')}: <span className="num">{seller.readinessScore}</span>
          </div>

          {/* Where her money goes. Read off this screen when a payout is made
              by hand, so it is copied rather than retyped. */}
          {seller.upiId && (
            <div className="small dim">
              {t('se.upi')}{' '}
              <CopyValue value={seller.upiId} label={t('c.copy')} copiedText={t('c.upiCopied')} />
            </div>
          )}
          {seller.blockReason && (
            <div className="small" style={{ color: 'var(--danger)' }}>
              {t('c.reason')}: {seller.blockReason}
            </div>
          )}
        </div>

        {/* Everything the row has no space for - her business, her shop
            settings, her listings, her orders - is one click away. */}
        <Link to={`/sellers/${seller.id}`}>
          <Button variant="quiet" small>
            {t('sd.open')} <IconGo aria-hidden="true" />
          </Button>
        </Link>
      </div>

      {/* Below the row, not beside it: a confirmation has a sentence to say
          about what it is about to do, and it needs the width to say it. */}
      <div style={{ marginTop: 10 }}>
        <SellerActions seller={seller} onDone={onDone} />
      </div>
    </Card>
  )
}
