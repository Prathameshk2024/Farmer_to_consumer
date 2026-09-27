import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FdriBand } from '@shared/fdri.js'
import { useT } from '../i18n/I18nProvider.js'
import { IconGo, IconFarmers } from '../components/icons.js'
import { api, type FarmerRow } from '../lib/api.js'
import { TopBar } from '../components/Shell.js'
import { SortSelect, useSort } from '../components/SortSelect.js'
import { FARMER_SORTS, sortRows } from '../lib/sort.js'
import { FarmerActions, StatusPill } from '../components/FarmerActions.js'
import { SubscriptionPill } from '../components/Subscription.js'
import {
  Button, Card, CopyValue, EmptyState, ErrorNote, FdriBandPill, Loading, useAsync,
} from '../components/ui.js'

/**
 * The register of farmers on the programme.
 *
 * A line each, and no more: it is read by scanning, so the row answers "who is
 * this and is anything wrong" and leaves everything else to the farmer's own page.
 *
 * Nothing here deletes anybody, and nothing here happens on a single click.
 * Every action changes what a real farmer can do tomorrow - whether their shop
 * is visible at all - so each one states its
 * consequence and waits for a second confirmation.
 */
export function Farmers() {
  const t = useT()
  const [q, setQ] = useState('')
  /**
   * Everyone; those waiting for their one verification; or a subscription
   * state (ending within the week, expired, never paid).
   */
  const [status, setStatus] = useState<'' | 'waiting' | 'expiring' | 'expired' | 'none'>('')
  /** One FDRI band, or every band - to find who training should reach first. */
  const [band, setBand] = useState<FdriBand | ''>('')
  const [data, loading, error, reload] = useAsync(() => api.farmers(), [])
  const [sort, setSort] = useSort('farmers', FARMER_SORTS)

  const rows = useMemo(() => {
    const all = (data?.farmers ?? []).filter(
      (s) =>
        (!status
          || (status === 'waiting'
            ? s.status === 'PENDING_VERIFICATION'
            : s.subscription?.state === status && s.status !== 'CLOSED'))
        && (!band || s.fdriBand === band),
    )
    const needle = q.trim().toLowerCase()
    const found = !needle
      ? all
      : all.filter((s) =>
          [s.name, s.shopName, s.village, s.phone, s.farmerCode]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(needle)),
        )
    return sortRows(found, FARMER_SORTS, sort)
  }, [data, q, sort, status, band])

  return (
    <>
      <TopBar title={t('se.title')} sub={data ? `${data.farmers.length}` : undefined} />
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
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            aria-label={t('se.status')}
          >
            <option value="">{t('c.all')}</option>
            <option value="waiting">{t('se.waitingVerification')}</option>
            <option value="expiring">{t('se.subExpiring')}</option>
            <option value="expired">{t('se.subExpired')}</option>
            <option value="none">{t('se.subNone')}</option>
          </select>
          <select
            className="select"
            style={{ maxWidth: 240 }}
            value={band}
            onChange={(e) => setBand(e.target.value as FdriBand | '')}
            aria-label={t('se.fdri')}
          >
            <option value="">{t('se.fdriAll')}</option>
            {(['low', 'moderate', 'high'] as const).map((b) => (
              <option key={b} value={b}>{t('se.fdri')}: {t(`fdri.band.${b}`)}</option>
            ))}
          </select>
          <SortSelect options={FARMER_SORTS} value={sort} onChange={setSort} />
        </div>

        <ErrorNote error={error} />

        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Card><EmptyState icon={IconFarmers} title={t('se.empty')} body={t('se.emptySub')} /></Card>
        ) : (
          <div className="stack-sm">
            {rows.map((s) => <FarmerCard key={s.id} farmer={s} onDone={reload} />)}
          </div>
        )}
      </div>
    </>
  )
}

function FarmerCard({ farmer, onDone }: { farmer: FarmerRow; onDone: () => void }) {
  const t = useT()

  return (
    <Card>
      <div className="row wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="grow min0">
          <div className="row wrap" style={{ gap: 8 }}>
            {/* Name and shop name exactly as the farmer entered them. */}
            <span className="strong">{farmer.name}</span>
            <span className="dim">{farmer.shopName}</span>
            <StatusPill status={farmer.status} />
            {/* Only once verified: before that the term cannot run. */}
            {farmer.verifiedAt && <SubscriptionPill view={farmer.subscription} />}
          </div>
          <div className="small dim">
            <span className="mono">{farmer.farmerCode}</span>
            {' · '}{t('se.village')}: {farmer.village}
            {' · '}<span className="mono">{farmer.phone}</span>
          </div>
          <div className="small dim-2">
            {t('se.products')}: <span className="num">{farmer.productCount}</span>
            {' · '}{t('se.slots')}: <span className="num">{farmer.slots?.used ?? 0}/{farmer.slots?.total ?? 0}</span>
            {' · '}{t('se.fdri')}: <span className="num">{farmer.fdriScore ?? 0}/10</span>{' '}
            <FdriBandPill band={farmer.fdriBand} />
          </div>

          {/* Where the farmer's money goes. Read off this screen when a payout is made
              by hand, so it is copied rather than retyped. */}
          {farmer.upiId && (
            <div className="small dim">
              {t('se.upi')}{' '}
              <CopyValue value={farmer.upiId} label={t('c.copy')} copiedText={t('c.upiCopied')} />
            </div>
          )}
          {farmer.blockReason && (
            <div className="small" style={{ color: 'var(--danger)' }}>
              {t('c.reason')}: {farmer.blockReason}
            </div>
          )}
        </div>

        {/* Everything the row has no space for - the business, the shop
            settings, the listings, the orders - is one click away. */}
        <Link to={`/farmers/${farmer.id}`}>
          <Button variant="quiet" small>
            {t('sd.open')} <IconGo aria-hidden="true" />
          </Button>
        </Link>
      </div>

      {/* Below the row, not beside it: a confirmation has a sentence to say
          about what it is about to do, and it needs the width to say it. */}
      <div style={{ marginTop: 10 }}>
        <FarmerActions farmer={farmer} onDone={onDone} />
      </div>
    </Card>
  )
}
