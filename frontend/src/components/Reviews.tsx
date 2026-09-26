import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import type {
  Order, ProductRatingInput, PublicReview, RatingSummary, Review,
} from '@shared/types.js'
import {
  RATING_MAX, REVIEW_COMMENT_MAX, canReview, orderProducts, ratingWordKey, ratingsProblem,
} from '@shared/review.js'
import { useT } from '../i18n/I18nProvider.js'
import { ReportLink, ReportSheet } from './ReportSheet.js'
import { api, ApiError } from '../lib/api.js'
import { useAuth } from '../store/AuthContext.js'
import { useToast } from '../store/ToastContext.js'
import { IconEdit, IconProduct, IconStar } from './icons.js'
import { Button, Card, Field, Notice, SectionTitle, VoiceInput } from './ui.js'

/**
 * RATINGS, ON EVERY SCREEN THAT SHOWS THEM.
 *
 * Products are rated, sellers are not. Stars are never alone: every row of
 * them carries the number and a word - "4 · चांगला" - so nobody has to count
 * gold shapes.
 */

/** Five stars, filled up to the rating. Decorative: the caller prints the words. */
export function Stars({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
  const filled = Math.round(rating)
  return (
    <span className={`stars stars--${size}`} aria-hidden="true">
      {Array.from({ length: RATING_MAX }, (_, i) => (
        <IconStar key={i} className={i < filled ? 'star star--on' : 'star'} />
      ))}
    </span>
  )
}

/**
 * "★★★★☆ 4.3 · 12 अभिप्राय". With no ratings it says so, or - on a product
 * card, where "no reviews yet" repeated down a grid is noise - says nothing.
 */
export function RatingLine({
  average, count, hideEmpty,
}: { average?: number; count?: number; hideEmpty?: boolean }) {
  const t = useT()
  if (!count) return hideEmpty ? null : <span className="small dim">{t('rev.none')}</span>
  return (
    <span className="rating-line">
      <Stars rating={average ?? 0} size="sm" />
      <strong className="num">{(average ?? 0).toFixed(1)}</strong>
      <span className="dim">· {count === 1 ? t('rev.countOne') : t('rev.count', { n: count })}</span>
    </span>
  )
}

/** The big number, and how the stars are spread - what a product's reviews open with. */
export function RatingSummaryCard({ summary }: { summary: RatingSummary }) {
  const t = useT()
  if (summary.count === 0) {
    return <Card><p className="body muted">{t('rev.productNone')}</p></Card>
  }
  return (
    <Card>
      <div className="rating-summary">
        <div className="rating-summary__big">
          <div className="hero-num">{summary.average.toFixed(1)}</div>
          <Stars rating={summary.average} />
          <div className="small dim">
            {summary.count === 1 ? t('rev.countOne') : t('rev.count', { n: summary.count })}
          </div>
        </div>
        <div className="rating-summary__bars">
          {[5, 4, 3, 2, 1].map((stars) => {
            const n = summary.byStars[stars - 1]
            return (
              <div key={stars} className="rating-bar">
                <span className="num small">{stars}</span>
                <IconStar aria-hidden="true" className="star star--on" />
                <span className="rating-bar__track">
                  <span
                    className="rating-bar__fill"
                    style={{ width: `${Math.round((n / summary.count) * 100)}%` }}
                  />
                </span>
                <span className="num small dim">{n}</span>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  // en-IN on purpose: Latin digits, the way money and dates are printed here.
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * One review. `showProduct` names the product it is about - on her list and
 * on an order - and is left off on the product's own page, where it is obvious.
 */
export function ReviewItem({
  review, showProduct, reportable,
}: {
  review: PublicReview
  showProduct?: boolean
  /**
   * ONE REPORT LINK PER SCREEN, AND THIS IS NOT IT ON THE BUYER'S SIDE.
   *
   * A buyer's words are content other buyers read, so somebody has to be able
   * to flag them - but a link under every review, above another one for the
   * listing itself, turned the product screen into a column of "Report" and
   * made the word meaningless. So the buyer reports the LISTING, at the foot
   * of the product page, and this is on for the seller only: an abusive
   * review is aimed at her, and My Reviews is the one screen where she reads
   * them all. Not her order screen, which shows the same words again.
   */
  reportable?: boolean
}) {
  const t = useT()
  const [reporting, setReporting] = useState(false)
  return (
    <div className="review">
      {showProduct && <strong>{review.productName}</strong>}
      <div className="row-between">
        <span className={showProduct ? 'small' : ''} style={showProduct ? undefined : { fontWeight: 700 }}>
          {review.customerName || t('rev.anon')}
        </span>
        <span className="tiny dim num">{shortDate(review.updatedAt ?? review.createdAt)}</span>
      </div>
      <div className="rating-line">
        <Stars rating={review.rating} size="sm" />
        <span className="small">
          <span className="num">{review.rating}</span> · {t(ratingWordKey(review.rating))}
        </span>
      </div>
      {review.comment && <p className="body review__text">{review.comment}</p>}
      {reportable && (
        <>
          <ReportLink onClick={() => setReporting(true)} />
          <ReportSheet
            targetType="review"
            targetId={review.id}
            title={review.comment || review.productName}
            open={reporting}
            onClose={() => setReporting(false)}
          />
        </>
      )}
    </div>
  )
}

export function ReviewList({
  reviews, showProduct, reportable,
}: {
  reviews: PublicReview[]
  showProduct?: boolean
  reportable?: boolean
}) {
  return (
    <Card>
      <div className="review-list">
        {reviews.map((r) => (
          <ReviewItem key={r.id} review={r} showProduct={showProduct} reportable={reportable} />
        ))}
      </div>
    </Card>
  )
}

/**
 * Five big stars to tap. Each is a 48px button with its number under it, and
 * the word for the chosen one prints beneath the row - so the choice is read,
 * not guessed from how many shapes are gold.
 */
export function StarPicker({
  value, onChange, label,
}: { value: number; onChange: (n: number) => void; label?: string }) {
  const t = useT()
  return (
    <div className="stack-sm">
      <div className="star-picker" role="radiogroup" aria-label={label ?? t('rev.pickStars')}>
        {Array.from({ length: RATING_MAX }, (_, i) => {
          const n = i + 1
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} · ${t(ratingWordKey(n))}`}
              className={`star-picker__btn ${n <= value ? 'star-picker__btn--on' : ''}`}
              onClick={() => onChange(n)}
            >
              <IconStar aria-hidden="true" className={n <= value ? 'star star--on' : 'star'} />
              <span className="num tiny">{n}</span>
            </button>
          )
        })}
      </div>
      <div className="center" style={{ fontWeight: 700 }} aria-live="polite">
        {value ? t(ratingWordKey(value)) : <span className="dim">{t('rev.tapStar')}</span>}
      </div>
    </div>
  )
}

/**
 * EVERY PRODUCT ON ONE ORDER, RATED ON ONE SCREEN.
 *
 * A star row per product, and a box for words under each that she may leave
 * empty. The send button stays off until every product has stars - the same
 * check the server runs - and nothing is sent until then.
 */
export function RateOrderForm({
  order, reviews, onSaved, onCancel,
}: {
  order: Order
  /** Ratings already given, when she is changing them. */
  reviews?: PublicReview[]
  onSaved: (reviews: Review[]) => void
  /** Only when changing. The first rating has no way out. */
  onCancel?: () => void
}) {
  const t = useT()
  const products = orderProducts(order)

  const [picked, setPicked] = useState<Record<string, { rating: number; comment: string }>>(() =>
    Object.fromEntries(
      products.map((p) => {
        const r = reviews?.find((x) => x.productId === p.productId)
        return [p.productId, { rating: r?.rating ?? 0, comment: r?.comment ?? '' }]
      }),
    ),
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const ratings: ProductRatingInput[] = products.map((p) => ({
    productId: p.productId,
    rating: picked[p.productId]?.rating ?? 0,
    comment: picked[p.productId]?.comment.trim() || undefined,
  }))
  const incomplete = ratingsProblem(order, ratings) !== null

  function update(id: string, change: Partial<{ rating: number; comment: string }>) {
    setPicked((cur) => ({ ...cur, [id]: { ...cur[id]!, ...change } }))
    setErr('')
  }

  async function submit() {
    setBusy(true)
    setErr('')
    try {
      const res = await api.reviewOrder(order.id, ratings)
      onSaved(res.reviews)
    } catch (e) {
      setErr(e instanceof ApiError ? (e.messageMr ?? e.message) : t('rev.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      {products.map((p) => (
        <Card key={p.productId}>
          <div className="stack">
            <div className="row">
              <span className="lineicon" aria-hidden="true"><IconProduct /></span>
              <strong>{p.name}</strong>
            </div>
            <StarPicker
              value={picked[p.productId]?.rating ?? 0}
              onChange={(n) => update(p.productId, { rating: n })}
              label={`${p.name} · ${t('rev.pickStars')}`}
            />
            <Field label={t('rate.commentLabel')} hint={t('rev.commentHint', { n: REVIEW_COMMENT_MAX })}>
              <VoiceInput
                multiline
                value={picked[p.productId]?.comment ?? ''}
                onChange={(v) => update(p.productId, { comment: v })}
                maxLength={REVIEW_COMMENT_MAX}
                placeholder={t('rev.commentPlaceholder')}
              />
            </Field>
          </div>
        </Card>
      ))}

      {err && <Notice tone="danger">{err}</Notice>}
      {incomplete && <p className="small dim center">{t('rate.allNeeded')}</p>}

      <div className="btn-row">
        {onCancel && (
          <Button variant="quiet" disabled={busy} onClick={onCancel}>{t('rev.keepOld')}</Button>
        )}
        <Button disabled={busy || incomplete} onClick={() => void submit()}>
          {busy ? t('common.loading') : t('rev.send')}
        </Button>
      </div>
    </div>
  )
}

/**
 * WHAT SHE SAID ABOUT THIS ORDER, on the order screen.
 *
 * Asking is the gate's job (below), so this only shows the ratings once they
 * exist - with "change" while the month is open, and a note on any an admin
 * took down.
 */
export function OrderRatings({
  order, reviews, onSaved,
}: {
  order: Order
  reviews: (Review | PublicReview)[]
  onSaved: (reviews: Review[]) => void
}) {
  const t = useT()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)

  if (order.status !== 'DELIVERED' || reviews.length === 0) return null
  const open = canReview(order)
  const hidden = reviews.some((r) => (r as Review).hidden)

  return (
    <div>
      <SectionTitle>{t('rev.yours')}</SectionTitle>
      {editing ? (
        <RateOrderForm
          order={order}
          reviews={reviews}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false)
            toast(t('rev.thanks'))
            onSaved(saved)
          }}
        />
      ) : (
        <Card>
          <div className="stack-sm">
            {hidden && <Notice tone="warn">{t('rev.hiddenForYou')}</Notice>}
            <div className="review-list">
              {reviews.map((r) => <ReviewItem key={r.id} review={r} showProduct />)}
            </div>
            {open && (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                <IconEdit aria-hidden="true" /> {t('rev.change')}
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

/**
 * THE RATING SCREEN SHE CANNOT GO PAST.
 *
 * Mounted once, in the customer layout, over every customer screen. While any
 * delivered order is unrated (the server's `toRate`), it covers the whole app
 * - bottom tabs included - with that order's rating form, and there is no
 * close button: rating what arrived comes before anything else. Rating one
 * order brings up the next; rating the last lets her go. The server refuses a
 * new order while any are waiting, so the rule holds without this screen too.
 *
 * Checked when the app opens, when she comes back to it, every two minutes
 * while it is open, and on moving between screens (at most every 30 seconds,
 * for rural data) - so an order the seller marks delivered while she is
 * browsing is asked about within moments rather than on her next visit.
 *
 * `onBlockingChange` lets the layout make everything behind the screen inert,
 * so a keyboard or screen reader cannot reach the tabs underneath either.
 */
export function RateOrderGate({ onBlockingChange }: { onBlockingChange?: (blocking: boolean) => void }) {
  const t = useT()
  const { session } = useAuth()
  const { toast } = useToast()
  const { key } = useLocation()
  const [order, setOrder] = useState<Order | null>(null)
  const lastCheck = useRef(0)

  const check = useCallback(async (force = false) => {
    if (session?.role !== 'customer') return
    if (!force && Date.now() - lastCheck.current < 30_000) return
    lastCheck.current = Date.now()
    try {
      const { orders, toRate } = await api.myOrders()
      const next = toRate?.[0]
      setOrder(next ? orders.find((o) => o.id === next) ?? null : null)
    } catch {
      /* offline for a moment - the next check will catch it */
    }
  }, [session?.role])

  useEffect(() => { void check(true) }, [check])
  useEffect(() => { void check() }, [key, check])
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void check(true) }
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void check(true) }, 120_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [check])

  useEffect(() => { onBlockingChange?.(!!order) }, [order, onBlockingChange])

  if (!order) return null

  return (
    <div className="gate" role="dialog" aria-modal="true" aria-labelledby="rate-gate-title">
      <div className="gate__inner stack">
        <div className="stack-sm">
          <h1 id="rate-gate-title" className="h2">{t('rate.title')}</h1>
          <p className="body">{t('rate.sub', { id: order.id })}</p>
          <p className="small muted">{t('rate.why')}</p>
        </div>
        {/* Keyed on the order, so the next one starts with empty stars. */}
        <RateOrderForm
          key={order.id}
          order={order}
          onSaved={() => {
            toast(t('rev.thanks'))
            void check(true)
          }}
        />
      </div>
    </div>
  )
}
