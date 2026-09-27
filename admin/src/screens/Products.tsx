import { useMemo, useState } from 'react'
import { cropById } from '@shared/crops.js'
import { useI18n, useT } from '../i18n/I18nProvider.js'
import { SortSelect, useSort } from '../components/SortSelect.js'
import { PRODUCT_SORTS, sortRows } from '../lib/sort.js'
import { IconProducts } from '../components/icons.js'
import { api, type ProductRow } from '../lib/api.js'
import { rupees, when } from '../lib/format.js'
import { TopBar } from '../components/Shell.js'
import { useToast } from '../store/ToastContext.js'
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
type Tab = 'PENDING' | 'LIVE' | 'REPORTED'

/**
 * Moderation is mostly looking, so the photo leads.
 *
 * It opens on the listings waiting to be checked, because nothing reaches a
 * buyer until an admin publishes it: a listing carries a photograph, a price
 * and a claim about how the crop was grown, and it goes out under the
 * programme's name, so a person looks before a buyer does. Rejecting a
 * waiting listing and taking down a live one are the same act - the row goes,
 * the slot comes back, and the reason reaches the farmer.
 */
export function Products() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('PENDING')
  const [data, loading, error, reload] = useAsync(() => api.products(tab), [tab])
  const [sort, setSort] = useSort('products', PRODUCT_SORTS)

  const rows = useMemo(() => sortRows(data?.products ?? [], PRODUCT_SORTS, sort), [data, sort])

  return (
    <>
      <TopBar title={t('pr.title')} />
      <div className="body stack">
        <div className="row wrap">
          <Button small variant={tab === 'PENDING' ? 'primary' : 'quiet'} onClick={() => setTab('PENDING')}>
            {t('pr.pendingTab')}
          </Button>
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
 * Exported because the farmer page shows the same listings, and the take-down
 * flow - a reason the farmer reads - must be the same one in both places. A second copy is a second thing to keep in
 * step, and the half that falls behind is the half that stops explaining
 * itself.
 */
export function ProductCard({ product, onDone }: { product: ProductRow; onDone: () => void }) {
  const t = useT()
  const { lang } = useI18n()
  const errorText = useErrorText()
  const { toast } = useToast()

  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonErr, setReasonErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  /**
   * Taking a listing down deletes it; the reason reaches the farmer as a notice.
   */
  const live = product.status === 'LIVE'
  const pending = product.status === 'PENDING'

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
            {/* The farmer's words, rendered exactly as written. */}
            <span className="strong">{product.name}</span>
            {live && <Pill tone="ok">{t('pr.liveTab')}</Pill>}
            {pending && <Pill tone="warn">{t('pr.pendingTab')}</Pill>}
          </div>

          <div className="small dim">
            {rupees(product.price)} / {t(`unit.${product.unit}`)}
            {product.farmer && <> · {t('pr.by')}: {product.farmer.name}</>}
          </div>

          {/* What an admin checks a produce listing against: is it the crop
              it says, grown the way it says, harvested when it says. */}
          <div className="small dim">
            {t('pr.crop')}: {cropById(product.cropId)?.[lang] ?? product.cropId}
            {' · '}{t('pr.cultivation')}: {product.cultivation ? t(`cult.${product.cultivation}`) : '—'}
            {' · '}{t('pr.harvest')}: {product.harvestDate || '—'}
            {' · '}{t('pr.stock')}: {product.stock} {t(`unit.${product.unit}`)}
          </div>

          {/* Farmers may send a listing before the field visit; publishing it
              verifies them (admin.routes.ts), so the admin is told first. */}
          {pending && product.farmer?.status === 'PENDING_VERIFICATION' && (
            <div className="small" style={{ marginTop: 8, color: 'var(--warn)' }}>
              {t('pr.unverifiedNote')}
            </div>
          )}

          {/* What the buyers actually said, each with its reason, because
              "three reports" is a number and "two say the photo is not theirs"
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
                to empty a farmer's shop, so closing the reports is a decision
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
            {pending && (
              <Button
                variant="ok"
                small
                disabled={busy}
                onClick={() => void run(async () => {
                  await api.approveProduct(product.id)
                  toast(t('ok.productApproved'))
                })}
              >
                {t('pr.publish')}
              </Button>
            )}
            <Button variant="danger" small disabled={busy} onClick={() => setRejecting(true)}>
              {pending ? t('pr.reject') : t('pr.takeDown')}
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
            <Button variant="danger" small disabled={busy} onClick={reject}>
              {pending ? t('pr.reject') : t('pr.takeDown')}
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

/**
 * Cloudinary photo when there is one, the farmer's chosen emoji when there is not -
 * the farmer app falls back the same way when image uploads are switched off.
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
