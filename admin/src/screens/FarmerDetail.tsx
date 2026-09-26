import type { ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import type { AdminNotice, DigitalProfile } from '@shared/types.js'
import { BAND_LABEL, MAX_SCORE, SELF_REPORTED_FACTORS } from '@shared/readiness.js'
import { useI18n, useT } from '../i18n/I18nProvider.js'
import { api, type FarmerDetail as Detail } from '../lib/api.js'
import { isStuck, maskedLabel, rupees, when } from '../lib/format.js'
import { TopBar } from '../components/Shell.js'
import { FarmerActions, StatusPill } from '../components/FarmerActions.js'
import { Confirm, useConfirm } from '../components/Confirm.js'
import { ResetPassword } from '../components/ResetPassword.js'
import { ProductCard } from './Products.js'
import { ReviewTable, SummaryText } from './Reviews.js'
import { IconNo, IconProducts, IconYes } from '../components/icons.js'
import {
  Button, Card, CopyValue, EmptyState, ErrorNote, Loading, Notice, Pill, SectionTitle, useAsync,
  useErrorText,
} from '../components/ui.js'

/**
 * One woman's page.
 *
 * The register answers "who is this"; everything here answers the questions
 * that come next - what she sells, what she has earned, what she was given and
 * by whom. Registration collects some forty fields and the row showed eight of
 * them, so an admin deciding whether to verify him was deciding on a name
 * and a village.
 *
 * READ-ONLY apart from verifying and blocking. Her name, her shop, her UPI
 * and her prices are hers to change in her own app; an admin editing them from
 * here would leave her looking at a shop she did not write.
 */
export function FarmerDetail() {
  const { farmerId } = useParams()
  const t = useT()
  const [data, loading, error, reload] = useAsync(
    () => api.farmerDetail(farmerId!),
    [farmerId],
  )

  if (loading) {
    return (
      <>
        <TopBar title={t('se.title')} back="/farmers" backLabel={t('sd.back')} />
        <div className="body"><Loading /></div>
      </>
    )
  }

  if (error || !data) {
    return (
      <>
        <TopBar title={t('se.title')} back="/farmers" backLabel={t('sd.back')} />
        <div className="body stack">
          <ErrorNote error={error} />
          {!error && <Card><EmptyState title={t('sd.notFound')} /></Card>}
        </div>
      </>
    )
  }

  const { farmer } = data

  return (
    <>
      <TopBar
        title={farmer.shopName}
        sub={`${farmer.farmerCode} · ${farmer.village}`}
        back="/farmers"
        backLabel={t('sd.back')}
      />

      <div className="body stack">
        <Identity detail={data} onDone={reload} />
        <Numbers detail={data} />

        <div className="chartgrid">
          <Business detail={data} />
          <Readiness detail={data} />
          <ShopSettings detail={data} />
          <Decisions notices={farmer.notices ?? []} />
        </div>

        <Listings detail={data} onDone={reload} />
        <Orders detail={data} />
        <Feedback detail={data} onDone={reload} />
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Who she is                                                          */
/* ------------------------------------------------------------------ */

function Identity({ detail, onDone }: { detail: Detail; onDone: () => void }) {
  const t = useT()
  const errorText = useErrorText()
  const verify = useConfirm()
  const { farmer } = detail

  async function doVerify() {
    verify.setBusy(true)
    verify.setError('')
    try {
      await api.verifyFarmer(farmer.id)
      verify.close()
      onDone()
    } catch (e) {
      verify.setError(errorText(e))
    } finally {
      verify.setBusy(false)
    }
  }

  return (
    <Card>
      <div className="row wrap" style={{ gap: 14, alignItems: 'flex-start' }}>
        <Portrait name={farmer.name} photo={farmer.photo} />

        <div className="grow min0">
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="strong" style={{ fontSize: 17 }}>{farmer.name}</span>
            <StatusPill status={farmer.status} />
            {!farmer.isOpen && <Pill tone="warn">{t('sd.shopClosed')}</Pill>}
          </div>

          <div className="small dim">
            <span className="mono">{farmer.farmerCode}</span>
            {' · '}{farmer.village}, {farmer.taluka}, {farmer.district}
            {' · '}<span className="mono">{farmer.pincode}</span>
          </div>

          <div className="small dim" style={{ marginTop: 4 }}>
            {t('se.phone')}: <span className="mono">{farmer.phone}</span>
            {farmer.whatsapp && <> · WhatsApp: <span className="mono">{farmer.whatsapp}</span></>}
          </div>

          {/* Where her money goes. Copied rather than retyped: a UPI ID wrong
              by one character pays a stranger. */}
          {farmer.upiId && (
            <div className="small dim" style={{ marginTop: 4 }}>
              {t('se.upi')}{' '}
              <CopyValue value={farmer.upiId} label={t('c.copy')} copiedText={t('c.upiCopied')} />
              {farmer.upiVerified && <Pill tone="ok">{t('sd.upiVerified')}</Pill>}
              {farmer.upiQrReady && <Pill tone="info">{t('sd.qrReady')}</Pill>}
            </div>
          )}

          <div className="small dim-2" style={{ marginTop: 4 }}>
            {t('sd.joined')}: {when(farmer.createdAt)}
          </div>
        </div>
      </div>

      {/* Blocked is not a state to discover from a greyed-out button. */}
      {farmer.status === 'BLOCKED' && (
        <div style={{ marginTop: 12 }}>
          <Notice tone="danger">
            {t('sd.blockedOn', { when: when(farmer.blockedAt ?? '') })}
            {farmer.blockReason ? ` — ${t('c.reason')}: ${farmer.blockReason}` : ''}
          </Notice>
        </div>
      )}

      {/* The one check a farmer gets. Once he is verified, what he lists goes
          on sale without anyone looking at each listing. */}
      {farmer.status === 'PENDING_VERIFICATION' && (
        <div style={{ marginTop: 12 }}>
          <Button disabled={verify.open} onClick={verify.ask}>{t('sel.verify')}</Button>
          <Confirm
            open={verify.open}
            title={t('sel.verify')}
            description={t('sel.verifyConsequence')}
            confirmLabel={t('sel.verify')}
            busy={verify.busy}
            error={verify.error}
            onCancel={verify.close}
            onConfirm={() => void doVerify()}
          />
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <FarmerActions farmer={farmer} onDone={onDone} />
      </div>
      <div style={{ marginTop: 12 }}>
        <ResetPassword role="farmer" userId={farmer.id} />
      </div>
    </Card>
  )
}

/** Her own photo if she uploaded one, her initial if she did not. */
function Portrait({ name, photo }: { name: string; photo?: string }) {
  const box: React.CSSProperties = {
    width: 56, height: 56, flex: 'none', borderRadius: '50%',
    border: '1px solid var(--line)', background: 'var(--maroon-soft)',
    color: 'var(--maroon)', objectFit: 'cover',
    display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 700,
  }
  if (photo && /^https?:/.test(photo)) return <img src={photo} alt="" style={box} loading="lazy" />
  return <div style={box} aria-hidden="true">{name ? [...name][0] : '·'}</div>
}

/* ------------------------------------------------------------------ */
/* The numbers, above everything that explains them                     */
/* ------------------------------------------------------------------ */

function Numbers({ detail }: { detail: Detail }) {
  const t = useT()
  const { farmer, products, orders, earned } = detail

  const live = products.filter((p) => p.status === 'LIVE').length
  const delivered = orders.filter((o) => o.status === 'DELIVERED').length

  return (
    <div className="tiles">
      <Tile n={live} label={t('sd.liveListings')} />
      <Tile n={orders.length} label={t('sd.ordersAll')} />
      <Tile n={delivered} label={t('sd.delivered')} />
      <Tile n={rupees(earned)} label={t('sd.earned')} />
      <Tile n={`${farmer.readinessScore}/${MAX_SCORE}`} label={t('se.readiness')} />
    </div>
  )
}

function Tile({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="tile">
      <div className="tile__n tile__n--mini">{n}</div>
      <div className="tile__l">{label}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* What she makes, and how she sells it                                 */
/* ------------------------------------------------------------------ */

function Business({ detail }: { detail: Detail }) {
  const t = useT()
  const { farmer } = detail

  return (
    <Card>
      <SectionTitle>{t('sd.business')}</SectionTitle>
      <dl className="kv">
        <Row label={t('sd.businessType')}>{farmer.businessType}</Row>
        <Row label={t('sd.food')}>{farmer.sellsFood ? t('c.yes') : t('c.no')}</Row>
        {farmer.shgName && <Row label={t('sd.shg')}>{farmer.shgName}</Row>}
        {farmer.yearsInBusiness != null && (
          <Row label={t('sd.years')}><span className="num">{farmer.yearsInBusiness}</span></Row>
        )}
        {farmer.monthlyCapacity != null && (
          <Row label={t('sd.capacity')}>
            <span className="num">{farmer.monthlyCapacity}</span> {t('sd.perMonth')}
          </Row>
        )}
        {farmer.age != null && <Row label={t('sd.age')}><span className="num">{farmer.age}</span></Row>}
        {farmer.education && <Row label={t('sd.education')}>{farmer.education}</Row>}
        <Row label={t('sd.qr')}>
          <span className="num">{farmer.qrScans}</span> {t('sd.scans')}
          {' · '}<span className="num">{farmer.qrOrders}</span> {t('sd.ordersFromQr')}
        </Row>
      </dl>

      {/* Her own words about her shop, as customers read them. */}
      {farmer.about && (
        <p className="small dim" style={{ marginBottom: 0 }}>{farmer.about}</p>
      )}
    </Card>
  )
}

function ShopSettings({ detail }: { detail: Detail }) {
  const t = useT()
  const { farmer } = detail

  return (
    <Card>
      <SectionTitle>{t('sd.shopSettings')}</SectionTitle>
      <dl className="kv">
        <Row label={t('sd.takingOrders')}>
          {farmer.isOpen
            ? <Pill tone="ok">{t('c.yes')}</Pill>
            : <Pill tone="warn">{t('c.no')}</Pill>}
        </Row>
        <Row label={t('sd.deliveryFee')}>
          {farmer.deliveryFee > 0 ? rupees(farmer.deliveryFee) : t('sd.freeDelivery')}
        </Row>
        {farmer.freeDeliveryAbove > 0 && (
          <Row label={t('sd.freeAbove')}>{rupees(farmer.freeDeliveryAbove)}</Row>
        )}
        <Row label={t('sd.minOrder')}>
          {farmer.minOrder > 0 ? rupees(farmer.minOrder) : t('c.none')}
        </Row>
        <Row label={t('sd.dispatch')}>{farmer.dispatch}</Row>
        {farmer.fssai && <Row label={t('sd.fssai')}>{farmer.fssai}</Row>}
        {/* The pincodes she delivers to. An order outside them is refused by
            the API, so this is the answer to "why can she not see my area". */}
        <Row label={t('sd.serves')}>
          <span className="mono">{farmer.pincodes.join(', ') || '—'}</span>
        </Row>
      </dl>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Digital readiness                                                    */
/* ------------------------------------------------------------------ */

/**
 * Six answers she gave on the day she registered, and four things the platform
 * watched her do. The split is the whole point of the index - keep it visible,
 * or the before/after comparison reads as her opinion of herself changing.
 */
function Readiness({ detail }: { detail: Detail }) {
  const t = useT()
  const { lang } = useI18n()
  const { farmer } = detail
  const band = BAND_LABEL[farmer.readinessBand]

  return (
    <Card>
      <SectionTitle>{t('se.readiness')}</SectionTitle>

      <div className="row" style={{ gap: 10, marginBottom: 10 }}>
        <span className="num" style={{ fontSize: 26, fontWeight: 700 }}>
          {farmer.readinessScore}
        </span>
        <span className="dim-2 small">/ {MAX_SCORE}</span>
        <Pill tone="info">{lang === 'mr' ? band.mr : band.en}</Pill>
      </div>

      <div className="small dim-2">{t('sd.selfReported')}</div>
      <ul className="checks">
        {SELF_REPORTED_FACTORS.map((f) => (
          <Check key={f.key} on={farmer.digital[f.key as keyof DigitalProfile]}>
            {lang === 'mr' ? f.mr : f.en}
          </Check>
        ))}
      </ul>

      <div className="small dim-2" style={{ marginTop: 10 }}>{t('sd.measured')}</div>
      <ul className="checks">
        <Check on={!!farmer.about && farmer.about.length > 20 && detail.products.length > 0}>
          {t('sd.mBranding')}
        </Check>
        <Check on={detail.products.some((p) => !!p.ingredients || !!p.imageUrl)}>
          {t('sd.mPackaging')}
        </Check>
        <Check on={detail.orders.some((o) => o.status === 'DELIVERED')}>
          {t('sd.mOnlineOrders')}
        </Check>
        <Check on={farmer.upiVerified && detail.orders.some((o) => o.status === 'DELIVERED')}>
          {t('sd.mFinance')}
        </Check>
      </ul>
    </Card>
  )
}

/** Colour is never the only signal: the tick and the cross carry it too. */
function Check({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <li className={`check ${on ? 'check--on' : ''}`}>
      <span className="check__i" aria-hidden="true">{on ? <IconYes /> : <IconNo />}</span>
      <span>{children}</span>
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* What has been done to her account                                    */
/* ------------------------------------------------------------------ */

/**
 * Verification, blocks and take-downs, newest first.
 *
 * A verification only changes a status, so without this list "who verified
 * him, and when" cannot be answered after the fact - which is exactly the
 * question asked when something looks wrong.
 */
function Decisions({ notices }: { notices: AdminNotice[] }) {
  const t = useT()
  const rows = [...notices].reverse()

  return (
    <Card>
      <SectionTitle>{t('sd.decisions')}</SectionTitle>

      {rows.length === 0 ? (
        <div className="small dim-2">{t('sd.noDecisions')}</div>
      ) : (
        <ul className="timeline">
          {rows.map((n, i) => (
            <li key={`${n.at}-${i}`}>
              <div className="row" style={{ gap: 8 }}>
                <span className="strong small">{t(`nt.${n.kind}`)}</span>
                {n.n != null && <span className="num small dim">{n.n}</span>}
                <span className="small dim-2">{when(n.at)}</span>
              </div>
              {n.note && <div className="small dim">{n.note}</div>}
            </li>
          ))}
        </ul>
      )}

    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Her listings and her orders                                          */
/* ------------------------------------------------------------------ */

function Listings({ detail, onDone }: { detail: Detail; onDone: () => void }) {
  const t = useT()
  const { products } = detail

  return (
    <section>
      <SectionTitle>{t('sd.listings')} ({products.length})</SectionTitle>
      {products.length === 0 ? (
        <Card><EmptyState icon={IconProducts} title={t('sd.noListings')} /></Card>
      ) : (
        <div className="stack-sm">
          {/* The same card the moderation screen uses, so taking a listing
              down works identically from here. */}
          {products.map((p) => <ProductCard key={p.id} product={p} onDone={onDone} />)}
        </div>
      )}
    </section>
  )
}

/**
 * THE BUYER IS MASKED HERE TOO.
 *
 * Reading a farmer's page is not a reason to be handed a list of women's names
 * and phone numbers. The unmasked details stay where they were - inside one
 * order on the orders screen, where looking is a deliberate act.
 */
function Orders({ detail }: { detail: Detail }) {
  const t = useT()
  const { orders } = detail

  if (orders.length === 0) {
    return (
      <section>
        <SectionTitle>{t('sd.orders')}</SectionTitle>
        <Card><EmptyState title={t('or.empty')} /></Card>
      </section>
    )
  }

  return (
    <section>
      <SectionTitle>{t('sd.orders')} ({orders.length})</SectionTitle>
      <Card flush>
        <div className="tablewrap">
          <table className="t">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('or.customerHidden')}</th>
                <th>{t('or.placed')}</th>
                <th className="right">{t('or.total')}</th>
                <th>{t('sd.payment')}</th>
                <th>{t('se.status')}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.id}</td>
                  <td className="mono dim">{maskedLabel(o)}</td>
                  <td className="small dim">{when(o.placedAt)}</td>
                  <td className="right num">{rupees(o.total)}</td>
                  <td className="small dim">{o.paymentMode} · {o.paymentStatus}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <Pill>{o.status}</Pill>
                      {isStuck(o) && <Pill tone="danger">{t('or.stuck')}</Pill>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="small dim-2" style={{ marginTop: 8 }}>{t('or.customerHiddenNote')}</div>
    </section>
  )
}

/**
 * What her buyers said, hidden reviews included and marked. Before deciding
 * anything about her account, an admin should read this: a run of low ratings
 * is a reason to call her, and a reason nobody would otherwise see.
 */
function Feedback({ detail, onDone }: { detail: Detail; onDone: () => void }) {
  const t = useT()
  const { reviews, rating } = detail

  return (
    <section>
      <SectionTitle>{t('sd.reviews')} ({reviews.length})</SectionTitle>
      {reviews.length === 0 ? (
        <Card><EmptyState title={t('rv.none')} /></Card>
      ) : (
        <div className="stack-sm">
          <SummaryText summary={rating} />
          <ReviewTable reviews={reviews} onChanged={onDone} />
        </div>
      )}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  )
}
