import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Role } from '@shared/types.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { homeFor, useAuth } from '../../store/AuthContext.js'
import { Card, ConfirmSheet } from '../../components/ui.js'
import {
  IconBuy, IconCash, IconCheck, IconDelivery, IconFarmer, IconGrowth, IconQr, IconSend,
} from '../../components/icons.js'
import { SUPPORT_PHONE } from '../farmer/Misc.js'
import CollegeCard from './CollegeCard.js'
import logo from '../../assets/logo.png'
import heroWide from '../../assets/photos/hero-field.jpg'
import heroTall from '../../assets/photos/hero-field-tall.jpg'
import stepRegister from '../../assets/photos/step-register.jpg'
import stepList from '../../assets/photos/step-list.jpg'
import stepSell from '../../assets/photos/step-sell.jpg'

type Mode = 'register' | 'login'

/**
 * The public landing page: a farmer in a field and the promise, then the ways
 * in, then the poster - why it is needed, how it works, what it offers, what
 * it should change, and the college behind it.
 *
 * Its practical job is the four ways in under the photo - the farmer's
 * sign-up first and largest, the buyer's second, both log-ins on one line.
 * The feature list describes the whole programme, so it names parts that are
 * still being built.
 */
export default function Landing() {
  const t = useT()
  const { lang, setLang, langs } = useI18n()
  const nav = useNavigate()
  const { session, signOut } = useAuth()

  /** Set when a button needs the "end this session first?" decision. */
  const [switchTo, setSwitchTo] = useState<{ role: Role; mode: Mode } | null>(null)

  /**
   * What a button does depends on who is signed in:
   *
   *  - no session          -> /register/<role> or /login/<role>;
   *  - a session, same role -> straight in, rather than the app forgetting them;
   *  - a session, the OTHER role -> one account is in one section at a time,
   *    so this needs the current session closed, and says so first.
   */
  function go(role: Role, mode: Mode) {
    if (session) {
      if (session.role === role) nav(homeFor(role))
      else setSwitchTo({ role, mode })
      return
    }
    nav(`/${mode}/${role}`)
  }

  const workflow = [
    [IconFarmer, t('lp.wf1')],
    [IconSend, t('lp.wf2')],
    [IconCash, t('lp.wf3')],
    [IconBuy, t('lp.wf4')],
    [IconQr, t('lp.wf5')],
    [IconDelivery, t('lp.wf6')],
  ] as const

  const steps = [[stepRegister, 1], [stepList, 2], [stepSell, 3]] as const

  return (
    <div className="landing">
      <header className="lnav">
        <div className="wrap lnav__in">
          <div className="brand">
            <img className="brand__mark" src={logo} alt="" aria-hidden="true" />
            <span style={{ minWidth: 0 }}>
              <span className="brand__name">{t('app.name')}</span>
              <span className="brand__sub">{t('app.nameShort')}</span>
            </span>
          </div>
          <div className="grow" />
          {/* Language sits in the header, never buried in settings. */}
          <div className="langswitch">
            {langs.map((l) => (
              <button key={l.code} onClick={() => setLang(l.code)} aria-pressed={lang === l.code}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* 1. The promise, over a field. The band is soil underneath, so on slow
          4G or with the image blocked the words are still white on dark. */}
      <section className="lphoto">
        <picture>
          <source media="(min-width: 700px)" srcSet={heroWide} />
          <img
            className="lphoto__img" src={heroTall} alt="" fetchPriority="high"
            onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
          />
        </picture>
        <div className="wrap lphoto__text">
          <h1 className="lphoto__title">{t('lp.heroTitle')}</h1>
          <p className="lphoto__sub">{t('lp.heroSub')}</p>
        </div>
      </section>

      <main className="wrap lstack">
        {/* 2. The four ways in. The log-ins share one line: someone coming
            back already knows which of the two they are. */}
        <div className="ldoors">
          <button className="btn" onClick={() => go('farmer', 'register')}>
            <IconFarmer aria-hidden="true" /> {t('lp.farmerCta')}
          </button>
          <button className="btn btn--ghost" onClick={() => go('customer', 'register')}>
            <IconBuy aria-hidden="true" /> {t('lp.buyerCta')}
          </button>
          <p className="ldoors__login">
            <span>{t('lp.haveAccount')}</span>
            <span className="ldoors__links">
              <button className="linkbtn" onClick={() => go('farmer', 'login')}>{t('auth.loginFarmer')}</button>
              <button className="linkbtn" onClick={() => go('customer', 'login')}>{t('auth.loginBuyer')}</button>
            </span>
          </p>
        </div>

        {/* 3. Three claims, each true in the code: no fee or commission is
            charged anywhere, UPI pays the farmer's own ID, every lot has a QR. */}
        <ul className="ltrust">
          <li><strong>{t('cart.free')}</strong><span>{t('lp.trust1Sub')}</span></li>
          <li><strong>UPI</strong><span>{t('lp.trust2Sub')}</span></li>
          <li><strong>QR</strong><span>{t('lp.trust3Sub')}</span></li>
        </ul>

        {/* 4. How it works: three steps a farmer can picture, then the poster's
            full workflow as a compact strip. The poster's "AI analysis" step is
            a price hint here: this build has no AI (spec 5.8). */}
        <section>
          <div className="sec-head"><h2 className="sec-head__t">{t('lp.workflowTitle')}</h2></div>
          <ol className="lsteps">
            {steps.map(([src, n]) => (
              <li key={n} className="lstep">
                <span className="lstep__n" aria-hidden="true">{n}</span>
                <img className="lstep__img" src={src} alt="" loading="lazy" width="96" height="72" />
                <span className="lstep__t">
                  <strong>{t(`lp.step${n}`)}</strong>
                  <span>{t(`lp.step${n}Sub`)}</span>
                </span>
              </li>
            ))}
          </ol>
          <ol className="lflow">
            {workflow.map(([Icon, label], i) => (
              <li key={label}>
                <span className="lflow__i" aria-hidden="true"><Icon /></span>
                <span><b className="num">{i + 1}.</b> {label}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* 5. Features - the whole programme, including parts still being built */}
        <section>
          <div className="sec-head"><h2 className="sec-head__t">{t('lp.featuresTitle')}</h2></div>
          <ul className="lchips">
            {['lp.feat1', 'lp.feat2', 'lp.feat3', 'lp.feat4', 'lp.feat5', 'lp.feat6', 'lp.feat7'].map((k) => (
              <li key={k}><IconCheck aria-hidden="true" /> {t(k)}</li>
            ))}
          </ul>
        </section>

        {/* 6. Why it is needed beside what it should change, so each problem
            reads against its answer. Stacks on a phone. */}
        <div className="lneed">
          <div className="lneed__col lneed__col--need">
            <h2 className="lneed__t">{t('lp.needTitle')}</h2>
            <ul className="llist">
              {['lp.need1', 'lp.need2', 'lp.need3', 'lp.need4', 'lp.need5'].map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
          </div>
          <div className="lneed__col lneed__col--ben">
            <h2 className="lneed__t">{t('lp.benefitsTitle')}</h2>
            <ul className="llist llist--tick">
              {['lp.ben1', 'lp.ben2', 'lp.ben3', 'lp.ben4', 'lp.ben5'].map((k) => (
                <li key={k}><IconCheck aria-hidden="true" /> {t(k)}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* 7. Aims. The poster's "analysis with AI" line has no AI here. */}
        <section>
          <div className="sec-head">
            <h2 className="sec-head__t"><IconGrowth aria-hidden="true" /> {t('lp.goalsTitle')}</h2>
          </div>
          <ul className="llist">
            {['lp.goal1', 'lp.goal2', 'lp.goal3', 'lp.goal4', 'lp.goal5'].map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        </section>

        {/* 8. The mission, in the project's own words */}
        <Card className="lmission">
          <p className="lmission__band">{t('lp.band')}</p>
          <p className="lmission__tag">{t('app.tagline')}</p>
          <p className="lmission__text">{t('lp.mission')}</p>
          <p className="lmission__intro">{t('lp.intro')}</p>
        </Card>

        {/* 9. The college behind the project */}
        <Card>
          <div className="sec-head"><h2 className="sec-head__t">{t('lp.collegeTitle')}</h2></div>
          <CollegeCard />
        </Card>
      </main>

      {/* 10. Footer */}
      <footer className="lfoot">
        <div className="wrap lfoot__in">
          <strong className="lfoot__quote">{t('lp.footerQuote')}</strong>
          <span className="lfoot__motto">{t('lp.footerMotto')}</span>
          <a href={`tel:+91${SUPPORT_PHONE}`}>{t('lp.helpPhone', { phone: SUPPORT_PHONE })}</a>
          {/* The farmer map link comes back with /shop/map (Task 10). */}
          <a className="linkbtn" href={`tel:+91${SUPPORT_PHONE}`}>{t('common.help')}</a>
        </div>
      </footer>

      <ConfirmSheet
        open={switchTo !== null}
        title={t('lp.switchTitle')}
        body={switchTo?.role === 'customer' ? t('lp.switchBuyBody') : t('lp.switchBody')}
        confirmLabel={t('lp.switchConfirm')}
        tone="danger"
        onCancel={() => setSwitchTo(null)}
        onConfirm={() => {
          const target = switchTo
          setSwitchTo(null)
          signOut()
          if (target) nav(`/${target.mode}/${target.role}`)
        }}
      />
    </div>
  )
}
