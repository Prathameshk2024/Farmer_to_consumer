import { useMemo, useState } from 'react'
import { useT } from '../i18n/I18nProvider.js'
import { SortSelect, useSort } from '../components/SortSelect.js'
import { PRODUCT_SORTS, sortRows } from '../lib/sort.js'
import { IconProducts } from '../components/icons.js'
import { api, type ProductRow } from '../lib/api.js'
import { rupees, when } from '../lib/format.js'
import { TopBar } from '../components/Shell.js'
import {
  Button, Card, EmptyState, ErrorNote, Field, Loading, Notice, Pill,
  useAsync, useErrorText,
} from '../components/ui.js'

/**
 * REPORTED is a queue, not a status.
 *
 * It replaced the REJECTED tab, which can no longer hold anything: rejecting
 * now deletes the listing, so a tab of rejected products would be a tab that
 * is always empty. What an admin needs instead is the listings BUYERS have
 * flagged - the only moderation signal that arrives after a listing is live.
 */
type Tab = 'LIVE' | 'REPORTED'

/**
 * Moderation is mostly looking, so the photo leads.
 *
 * There is no review queue here, and that is deliberate. A verified farmer's
 * listing goes on sale the moment he sends it - produce changes daily, and a
 * queue per listing would sell yesterday's tomatoes. What this screen does is
 * the other direction: take a live listing down, with a reason he reads.
 */
export function Products() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('LIVE')
  const [data, loading, error, reload] = useAsync(() => api.products(tab), [tab])
  const [sort, setSort] = useSort('products', PRODUCT_SORTS)

  const rows = useMemo(() => sortRows(data?.products ?? [], PRODUCT_SORTS, sort), [data, sort])

  return (
    <>
      <TopBar title={t('pr.title')} />
      <div className="body stack">
        <div className="row wrap">
          <Button small variant={tab === 'LIVE' ? 'primary' : 'quiet'} onClick={() => setTab('LIVE')}>
            {t('pr.liveTab')}
          </Button>
          <Button small variant={tab === 'REPORTED' ? 'primary' : 'quiet'} onClick={() => setTab('REPORTED')}>
            {t('pr.reportedTab')}
            {!!data?.reportedCount && <> ({data.reportedCount})</>}
          </Button>
          <SortSelect options={PRODUCT_SORTS} value={sort} onChange={setSort} />
        </div>

        <ErrorNote error={error} />

        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Card><EmptyState icon={IconProducts} title={t('pr.empty')} body={t('pr.emptySub')} /></Card>
        ) : (
          <div className="stack-sm">
            {rows.map((p) => <ProductCard key={p.id} product={p} onDone={reload} />)}
          </div>
        )}
      </div>
    </>
  )
}

/**
 * One listing, with whatever action its status allows.
 *
 * Exported because her own page shows the same listings, and the take-down
 * flow - a reason he reads - must be the same one in both places. A second copy is a second thing to keep in
 * step, and the half that falls behind is the half that stops explaining
 * itself.
 */
export function ProductCard({ product, onDone }: { product: ProductRow; onDone: () => void }) {
  const t = useT()
  const errorText = useErrorText()

  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonErr, setReasonErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  /**
   * Taking a listing down deletes it; the reason reaches him as a notice.
   */
  const live = product.status === 'LIVE'

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setErr('')
    try {
      await action()
      onDone()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  function reject() {
    if (!reason.trim()) {
      setReasonErr(t('c.required'))
      return
    }
    void run(() => api.takeDownProduct(product.id, reason.trim()))
  }

  return (
    <Card>
      <div className="row wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
        <ProductThumb product={product} />

        <div className="grow">
          <div className="row wrap" style={{ gap: 8 }}>
            {/* Her words, rendered exactly as she wrote them. */}
            <span className="strong">{product.name}</span>
            {product.isFood && <Pill tone="info">{t('pr.food')}</Pill>}
            {live && <Pill tone="ok">{t('pr.liveTab')}</Pill>}
          </div>

          <div className="small dim">
            {rupees(product.price)}
            {product.seller && <> · {t('pr.by')}: {product.seller.name}</>}
          </div>

          {/* What the buyers actually said, each with its reason, because
              "three reports" is a number and "two say the photo is not hers"
              is a decision. Nobody's name: a report is anonymous to everyone
              but the database. */}
          {!!product.reports?.length && (
            <div className="stack-sm" style={{ marginTop: 8 }}>
              <div className="strong" style={{ color: 'var(--danger)' }}>
                {t('pr.reportedCount', { n: product.reports.length })}
              </div>
              <ul className="reportlist">
                {product.reports.map((r) => (
                  <li key={r.id}>
                    {t(`report.reason.${r.reason}`)}
                    {r.note && <> — {r.note}</>}
                    <span className="dim-2 small"> · {when(r.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {!rejecting && (
          <div className="row">
            {/* Looked at, and it stays up. One annoyed buyer must not be able
                to empty a woman's shop, so closing the reports is a decision
                an admin makes as deliberately as taking the listing down. */}
            {!!product.reports?.length && (
              <Button
                variant="quiet"
                small
                disabled={busy}
                onClick={() => void run(() => api.clearReports(product.id))}
              >
                {t('pr.clearReports')}
              </Button>
            )}
            <Button variant="danger" small disabled={busy} onClick={() => setRejecting(true)}>
              {t('pr.takeDown')}
            </Button>
          </div>
        )}

      </div>


      {rejecting && (
        <div className="stack-sm" style={{ marginTop: 12 }}>
          <Field label={t('pr.rejectReason')} error={reasonErr}>
            <textarea
              className="textarea"
              value={reason}
              onChange={(e) => { setReason(e.target.value); setReasonErr('') }}
              placeholder={t('pr.rejectReasonHint')}
            />
          </Field>
          <div className="small dim-2">{t('pr.rejectReasonHint')}</div>
          {/* The consequence, spelled out at the moment of the decision. */}
          <div className="small dim-2">{t('pr.rejectDeletes')}</div>
          <div className="row">
            <Button variant="danger" small disabled={busy} onClick={reject}>{t('pr.takeDown')}</Button>
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

/**
 * Cloudinary photo when there is one, her chosen emoji when there is not -
 * the seller app falls back the same way when image uploads are switched off.
 */
function ProductThumb({ product }: { product: ProductRow }) {
  const box: React.CSSProperties = {
    width: 64, height: 64, flex: 'none',
    borderRadius: 'var(--r)', border: '1px solid var(--line)',
    background: 'var(--surface-2)', objectFit: 'cover',
    display: 'grid', placeItems: 'center', fontSize: 28,
  }

  if (product.imageUrl) {
    return <img src={product.imageUrl} alt="" style={box} loading="lazy" />
  }
  return <div style={box} aria-hidden="true"><IconProducts /></div>
}
