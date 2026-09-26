import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { RatingSummary, Review } from '@shared/types.js'
import { RATING_MAX, ratingWordKey } from '@shared/review.js'
import { useT } from '../i18n/I18nProvider.js'
import { api, type ReviewRow } from '../lib/api.js'
import { when } from '../lib/format.js'
import { TopBar } from '../components/Shell.js'
import { IconReviews } from '../components/icons.js'
import {
  Button, Card, EmptyState, ErrorNote, Field, Loading, Notice, Pill, useAsync, useErrorText,
} from '../components/ui.js'
import { useToast } from '../store/ToastContext.js'

type Filter = 'all' | 'low' | 'hidden' | 'reported'

/**
 * WHAT BUYERS SAID ABOUT EVERY PRODUCT.
 *
 * Products are rated, one review per product per delivered order. Two jobs.
 * Reading: low ratings are the early signal - a seller whose products collect
 * ones and twos needs a call from a coordinator, not a block. Moderating: a
 * review with a phone number in it, or abuse, comes down here.
 *
 * Hide is the only action. An admin who could edit a buyer's words would make
 * every review on the platform something the platform might have written.
 */
export function Reviews() {
  const t = useT()
  const [filter, setFilter] = useState<Filter>('all')
  const [data, loading, error, reload] = useAsync(
    () => api.reviews(
      filter === 'low' ? { maxRating: 2 }
        : filter === 'hidden' ? { hidden: true }
        : filter === 'reported' ? { reported: true }
        : {},
    ),
    [filter],
  )
  const rows = data?.reviews ?? []

  return (
    <>
      <TopBar title={t('rv.title')} sub={data ? `${rows.length}` : undefined} />
      <div className="body stack">
        <Notice>{t('rv.intro')}</Notice>

        <div className="row wrap">
          <select className="select" style={{ maxWidth: 260 }} value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="all">{t('rv.filterAll')}</option>
            <option value="low">{t('rv.filterLow')}</option>
            <option value="hidden">{t('rv.filterHidden')}</option>
            {/* Buyers' flags on buyers' words. A report hides nothing by
                itself - it puts the review in front of somebody who decides. */}
            <option value="reported">
              {t('rv.filterReported')}{data?.reportedCount ? ` (${data.reportedCount})` : ''}
            </option>
          </select>
          {data && filter === 'all' && <SummaryText summary={data.summary} />}
        </div>

        <ErrorNote error={error} />

        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Card><EmptyState icon={IconReviews} title={t('rv.empty')} body={t('rv.emptySub')} /></Card>
        ) : (
          <ReviewTable reviews={rows} showSeller onChanged={reload} />
        )}
      </div>
    </>
  )
}

/** "4.3 ★ · 12 reviews" - the visible average, in a line. */
export function SummaryText({ summary }: { summary: RatingSummary }) {
  const t = useT()
  if (summary.count === 0) return <span className="small dim">{t('rv.none')}</span>
  return (
    <span className="small">
      <span className="strong num">{summary.average.toFixed(1)}</span>{' '}
      <span className="stars-text" aria-hidden="true">★</span>{' '}
      · {t('rv.count', { n: summary.count })}
    </span>
  )
}

/** Stars as text, with the number and the word beside them. */
export function StarsText({ rating }: { rating: number }) {
  const t = useT()
  return (
    <span className="nowrap">
      <span className="stars-text" aria-hidden="true">
        {'★'.repeat(rating)}{'☆'.repeat(RATING_MAX - rating)}
      </span>{' '}
      <span className="num">{rating}</span> · {t(ratingWordKey(rating))}
    </span>
  )
}

/**
 * The table, shared with a seller's own page. The buyer is shown by the first
 * name the public already sees, and the order id - which the orders screen
 * opens in full when support needs to call them.
 */
export function ReviewTable({
  reviews, showSeller, onChanged,
}: {
  reviews: (Review | ReviewRow)[]
  showSeller?: boolean
  onChanged: () => void
}) {
  const t = useT()
  const [acting, setActing] = useState<Review | null>(null)

  return (
    <>
      <Card flush>
        <div className="tablewrap">
          <table className="t">
            <thead>
              <tr>
                <th>{t('rv.date')}</th>
                {showSeller && <th>{t('or.seller')}</th>}
                <th>{t('rv.product')}</th>
                <th>{t('rv.stars')}</th>
                <th>{t('rv.comment')}</th>
                <th>{t('rv.buyer')}</th>
                <th>{t('rv.reports')}</th>
                <th>{t('se.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id}>
                  <td className="small dim">{when(r.updatedAt ?? r.createdAt)}</td>
                  {showSeller && (
                    <td>
                      <Link to={`/sellers/${r.sellerId}`}>{(r as ReviewRow).seller ?? '-'}</Link>
                      <div className="mono small dim">{(r as ReviewRow).womenBizId}</div>
                    </td>
                  )}
                  <td className="small">{r.productName || '-'}</td>
                  <td><StarsText rating={r.rating} /></td>
                  <td className="small" style={{ maxWidth: 360, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {r.comment ?? <span className="dim">-</span>}
                  </td>
                  <td className="small">
                    {r.customerName || t('rv.anon')}
                    <div className="mono dim">{r.orderId}</div>
                  </td>
                  <td className="small">
                    {(r as ReviewRow).reports?.length
                      ? (r as ReviewRow).reports!.map((rep) => (
                          <div key={rep.id} style={{ color: 'var(--danger)' }}>
                            {t(`report.reason.${rep.reason}`)}
                            {rep.note && <> — {rep.note}</>}
                          </div>
                        ))
                      : <span className="dim">-</span>}
                  </td>
                  <td>
                    {r.hidden ? (
                      <>
                        <Pill tone="danger">{t('rv.hidden')}</Pill>
                        {r.hiddenReason && <div className="small dim" style={{ marginTop: 4 }}>{r.hiddenReason}</div>}
                      </>
                    ) : (
                      <Pill tone="ok">{t('rv.visible')}</Pill>
                    )}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <Button variant="quiet" small onClick={() => setActing(r)}>
                        {r.hidden ? t('rv.show') : t('rv.hide')}
                      </Button>
                      {!!(r as ReviewRow).reports?.length && (
                        <Button
                          variant="quiet"
                          small
                          onClick={() => void api.clearReviewReports(r.id).then(onChanged)}
                        >
                          {t('rv.clearReports')}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {acting && (
        <HideDialog
          review={acting}
          onClose={() => setActing(null)}
          onDone={() => { setActing(null); onChanged() }}
        />
      )}
    </>
  )
}

/**
 * A dialog, not a card appended below the table - see OrderDetail in
 * Orders.tsx for why. Hiding needs a reason, and says what it will do: the
 * review leaves the product's page and its average, and the buyer is told.
 */
function HideDialog({
  review, onClose, onDone,
}: {
  review: Review
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()
  const errorText = useErrorText()
  const { toast } = useToast()
  const ref = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const hiding = !review.hidden

  // Same StrictMode-safe open as OrderDetail: no close() in a cleanup.
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  async function go() {
    if (hiding && !reason.trim()) {
      setErr(t('rv.reasonRequired'))
      return
    }
    setBusy(true)
    setErr('')
    try {
      await api.hideReview(review.id, hiding, hiding ? reason.trim() : undefined)
      toast(hiding ? t('rv.hiddenOk') : t('rv.shownOk'))
      onDone()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={ref}
      className="dlg"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
    >
      <Card>
        <div className="stack-sm">
          <div className="strong">{hiding ? t('rv.hideTitle') : t('rv.showTitle')}</div>
          <div className="small">{hiding ? t('rv.hideBody') : t('rv.showBody')}</div>

          <Notice>
            <StarsText rating={review.rating} />
            {review.comment && <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{review.comment}</div>}
          </Notice>

          {hiding && (
            <Field label={t('c.reason')} error={err}>
              <textarea
                className="textarea"
                value={reason}
                onChange={(e) => { setReason(e.target.value); setErr('') }}
                placeholder={t('rv.reasonHint')}
              />
            </Field>
          )}
          {!hiding && err && <Notice tone="danger">{err}</Notice>}

          <div className="row">
            <Button variant={hiding ? 'danger' : 'primary'} small disabled={busy} onClick={() => void go()}>
              {busy ? t('c.loading') : hiding ? t('rv.hide') : t('rv.show')}
            </Button>
            <Button variant="quiet" small disabled={busy} onClick={onClose}>{t('c.cancel')}</Button>
          </div>
        </div>
      </Card>
    </dialog>
  )
}
