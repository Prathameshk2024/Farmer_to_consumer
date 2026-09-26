import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cropById } from '@shared/crops.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { useAuth } from '../../store/AuthContext.js'
import { api } from '../../lib/api.js'
import { Avatar } from '../../components/Avatar.js'
import {
  AppBar, Button, Card, ConfirmSheet, CopyValue, EmptyState, FdriPill,
  LanguagePicker, Loading, Notice, Pill, Rupees, SectionTitle, useAsync,
} from '../../components/ui.js'
import {
  IconCall, IconCheck, IconDown, IconEdit, IconGrowth,
  IconNext, IconQr, IconUp, IconWaiting,
  IconWhatsapp,
} from '../../components/icons.js'
import { PageTour, TourMenu } from '../../components/Walkthrough.js'
import { CloseAccountSheet } from '../../components/CloseAccount.js'
import { ComplaintSheet } from '../../components/ComplaintSheet.js'

/* ================================================================== */
/* Profile                                                             */
/* ================================================================== */

export function FarmerProfile() {
  const t = useT()
  const nav = useNavigate()
  const { lang } = useI18n()
  const { signOut } = useAuth()

  const [me, loading] = useAsync(() => api.me(), [])
  const [productData] = useAsync(() => api.myProducts(), [])
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)

  if (loading || !me) {
    return <><AppBar brand title={t('prof.title')} /><div className="screen"><Loading /></div></>
  }

  const farmer = me.farmer

  return (
    <>
      <AppBar brand title={t('prof.title')} />
      <div className="screen stack">
        <Card>
          <div className="row">
            <Avatar name={farmer.name} size={64} />
            <div className="grow">
              <div style={{ fontWeight: 700, fontSize: 'var(--t-md)' }}>{farmer.name}</div>
              <div className="small dim">{farmer.shopName}</div>
              <div className="small dim num">+91 {farmer.phone}</div>
            </div>
          </div>
          <div style={{ marginTop: 'var(--s3)' }}>
            <Notice tone="ok">
              <span className="small dim">{t('reg.yourId')}</span>
              <div className="num" style={{ fontWeight: 800, fontSize: 'var(--t-md)' }}>
                {farmer.farmerCode}
              </div>
            </Notice>
          </div>
        </Card>

        {/* The FDRI from registration: ten answers, one mark each. */}
        <Card>
          <div className="row-between">
            <div>
              <div className="small dim">{t('reg.fdriScore')}</div>
              <strong className="num" style={{ fontSize: 'var(--t-lg)' }}>{farmer.fdriScore} / 10</strong>
            </div>
            <FdriPill band={farmer.fdriBand} />
          </div>
        </Card>

        <Card data-wt="prof-pay">
          <SectionTitle>{t('prof.payment')}</SectionTitle>
          <div className="stack-sm">
            <Notice tone="warn">{t('reg.upiHint')}</Notice>
            <div className="row-between">
              <div>
                <div className="small dim">{t('pay.upiId')}</div>
                {/* Read out over the phone, typed into a bank app, sent on
                    WhatsApp - copying beats retyping a string that pays
                    somebody else if one character is wrong. */}
                <CopyValue value={farmer.upiId} />
              </div>
              <Pill tone={farmer.upiVerified ? 'ok' : 'warn'} icon={farmer.upiVerified ? <IconCheck /> : <IconWaiting />}>
                {farmer.upiVerified ? t('prof.verified') : t('prof.notVerified')}
              </Pill>
            </div>

            {/* The payment QR is its own step - say plainly whether it is done. */}
            {farmer.upiQrReady ? (
              <Button variant="ghost" size="sm" onClick={() => nav('/farmer/payment')}>
                <IconQr aria-hidden="true" /> {t('qrpay.title')}
              </Button>
            ) : (
              <>
                <Notice tone="warn">{t('qrpay.empty')}</Notice>
                <Button onClick={() => nav('/farmer/payment')}>{t('qrpay.add')}</Button>
              </>
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle>{t('prof.business')}</SectionTitle>
          <div className="stack-sm small">
            <Row label={t('reg.shopName')} value={farmer.shopName} />
            <Row label={t('reg.village')} value={`${farmer.village} (${farmer.villageCode})`} />
            <Row label={t('reg.taluka')} value={farmer.taluka} />
            <Row label={t('reg.district')} value={farmer.district} />
            <Row label={t('reg.pincode')} value={farmer.pincode} />
            <Row
              label={t('reg.crops')}
              value={(farmer.crops ?? []).map((id) => cropById(id)?.[lang]).filter(Boolean).join(', ')}
            />
            <Row label={t('reg.location')} value={t(farmer.locationConsent ? 'reg.locationOn' : 'reg.locationOff')} />
          </div>
        </Card>

        <Button variant="ghost" onClick={() => nav('/farmer/profile/edit')}>
          <IconEdit aria-hidden="true" /> {t('prof.edit')}
        </Button>

        <Card data-wt="prof-lang">
          <LanguagePicker />
        </Card>

        <Button variant="ghost" onClick={() => setLogoutOpen(true)}>{t('prof.logout')}</Button>

        {/* DELETING THE ACCOUNT IS NOT A NEIGHBOUR OF LOGGING OUT.
            Play requires the option and requires it to be findable; it does
            not require it to sit under her thumb next to the button she
            presses every week. Its own card at the very end, a quiet line
            rather than a red button, and everything that makes it hard to do
            by accident is inside the sheet. */}
        <Card>
          <div className="stack-sm">
            <div className="small dim">{t('close.sectionTitle')}</div>
            <Button variant="quiet" size="sm" onClick={() => setCloseOpen(true)}>
              {t('close.open')}
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmSheet
        open={logoutOpen}
        title={t('prof.logoutConfirmTitle')}
        body={t('prof.logoutConfirm')}
        confirmLabel={t('prof.logout')}
        tone="danger"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={() => { signOut(); nav('/', { replace: true }) }}
      />

      <CloseAccountSheet
        role="farmer"
        phone={farmer.phone}
        productCount={productData?.products.length ?? 0}
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
      />

      <PageTour id="farmer.profile" />
    </>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="row-between">
      <span className="dim">{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value || '—'}</span>
    </div>
  )
}

/* ================================================================== */
/* Help & Training                                                     */
/* ================================================================== */

/**
 * The programme's own number, which both buttons use. Ten digits, no country
 * code: `+91` is added where it is needed, because `tel:` and `wa.me` want it
 * written differently and a number typed twice is a number that drifts.
 */
export const SUPPORT_PHONE = '7057899018'

export function FarmerHelp() {
  const t = useT()
  /** Open while she is writing what went wrong. */
  const [complaining, setComplaining] = useState(false)

  return (
    <>
      <AppBar brand title={t('help.title')} />
      <div className="screen stack">
        {/* Her own screens first: a walkthrough runs on the real page,
            which is the fastest answer to "how do I do this". */}
        <div>
          <SectionTitle>{t('wt.title')}</SectionTitle>
          <p className="small dim" style={{ marginTop: -4, marginBottom: 'var(--s2)' }}>
            {t('wt.sub')}
          </p>
          <TourMenu role="farmer" />
        </div>

        <ComplaintSheet
          open={complaining}
          onClose={() => setComplaining(false)}
          whatsappHref={`https://wa.me/91${SUPPORT_PHONE}`}
        />

        <Card data-wt="help-contact">
          <SectionTitle>{t('help.contact')}</SectionTitle>
          <div className="stack-sm">
            <a className="btn btn--ghost" href={`https://wa.me/91${SUPPORT_PHONE}`} target="_blank" rel="noreferrer">
              <IconWhatsapp aria-hidden="true" /> {t('help.whatsapp')}
            </a>
            <a className="btn btn--ghost" href={`tel:+91${SUPPORT_PHONE}`}>
              <IconCall aria-hidden="true" /> {t('help.call')}
            </a>
            <Button variant="quiet" onClick={() => setComplaining(true)}>
              <IconEdit aria-hidden="true" /> {t('help.complaint')}
            </Button>
          </div>
        </Card>

        <Card>
          <SectionTitle>{t('help.faq')}</SectionTitle>
          <div className="stack-sm small">
            <div>• {t('help.faq2')}</div>
            <div>• {t('help.faq3')}</div>
          </div>
        </Card>
      </div>

      <PageTour id="farmer.help" />
    </>
  )
}

/* ================================================================== */
/* My Growth - her own past is the only benchmark, never a leaderboard */
/* ================================================================== */

export function FarmerGrowth() {
  const t = useT()
  const { lang } = useI18n()
  const { session } = useAuth()
  const [data, loading] = useAsync(
    () => api.farmerWeek(session?.farmerId ?? ''),
    [session?.farmerId],
  )

  if (loading) {
    return <><AppBar title={t('grow.title')} backTo="/farmer" /><div className="screen"><Loading /></div></>
  }

  const week = data?.week

  // Only when she has never earned at all. It used to hide below FIVE orders
  // this week, which meant a woman with her first sale - the moment that most
  // deserves a chart - was told there was not enough information.
  if (!week) {
    return (
      <>
        <AppBar title={t('grow.title')} backTo="/farmer" />
        <div className="screen">
          <Card>
            <EmptyState icon={IconGrowth} title={t('grow.needMoreData')} body={t('grow.needMoreDataSub')} />
          </Card>
        </div>
      </>
    )
  }

  const total = week.days.reduce((n, d) => n + d.v, 0)
  const max = Math.max(...week.days.map((d) => d.v), 1)
  const diff = total - week.lastWeekTotal
  const up = diff >= 0

  return (
    <>
      <AppBar title={t('grow.title')} backTo="/farmer" />
      <div className="screen stack">
        {/* The number first, the chart second. */}
        <Card>
          <div className="section-title">{t('grow.earnWeek')}</div>
          <div className="row" style={{ alignItems: 'baseline', gap: 'var(--s3)', flexWrap: 'wrap' }}>
            <span className="hero-num"><Rupees value={total} /></span>
            <span style={{ color: up ? 'var(--ok)' : 'var(--danger)', fontWeight: 700 }}>
              {up ? <IconUp aria-hidden="true" /> : <IconDown aria-hidden="true" />} <Rupees value={Math.abs(diff)} /> {up ? t('grow.more') : t('grow.less')}
            </span>
          </div>

          {/* No axis, no gridlines, no legend. Every bar carries its value. */}
          <div
            className="bars"
            style={{ gridTemplateColumns: `repeat(${week.days.length}, 1fr)`, marginTop: 'var(--s4)' }}
          >
            {week.days.map((d) => (
              <div className="bars__col" key={d.dEn}>
                <span className={`bars__v ${d.v === 0 ? 'bars__v--zero' : ''}`}>₹{d.v}</span>
                <div
                  className={`bars__bar ${d.v === 0 ? 'bars__bar--zero' : ''}`}
                  style={{ height: d.v === 0 ? 3 : `${Math.round((d.v / max) * 100)}%` }}
                />
                <span className="bars__d">{lang === 'mr' ? d.d : d.dEn}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="row" style={{ gap: 'var(--s3)' }}>
          <Card className="grow">
            <div className="small dim">{t('grow.ordersWeek')}</div>
            <div className="hero-num num" style={{ fontSize: 'var(--t-xl)' }}>{week.ordersThisWeek}</div>
            <div className="small dim">{t('grow.vsLastWeek')} {week.ordersLastWeek}</div>
          </Card>
          <Card className="grow">
            <div className="small dim">{t('grow.repeatCustomers')}</div>
            <div className="hero-num num" style={{ fontSize: 'var(--t-xl)' }}>{week.repeatCustomers}</div>
          </Card>
        </div>

        {/* Two numbers, not a chart. */}
        <Card>
          <div className="section-title">{t('grow.viewsToOrders')}</div>
          <div className="row-between">
            <div>
              <div className="hero-num num" style={{ fontSize: 'var(--t-lg)' }}>{week.views}</div>
              <div className="small dim">{t('grow.peopleSaw', { n: week.views })}</div>
            </div>
            <span style={{ fontSize: '1.5rem' }} aria-hidden="true"><IconNext /></span>
            <div style={{ textAlign: 'right' }}>
              <div className="hero-num num" style={{ fontSize: 'var(--t-lg)' }}>{week.ordered}</div>
              <div className="small dim">{t('grow.peopleOrdered', { n: week.ordered })}</div>
            </div>
          </div>
        </Card>

      </div>
    </>
  )
}
