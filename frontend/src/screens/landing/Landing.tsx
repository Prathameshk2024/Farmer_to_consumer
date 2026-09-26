import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Role } from '@shared/types.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { homeFor, useAuth } from '../../store/AuthContext.js'
import { Card, ConfirmSheet } from '../../components/ui.js'
import {
  IconBuy, IconCash, IconCheck, IconDelivery, IconFarmer, IconGrowth, IconQr, IconSell, IconSend,
} from '../../components/icons.js'
import { clearRegisterTicket, liveTicket } from '../../lib/registerTicket.js'
import { clearDraft, sessionStore } from '../auth/farmerDraft.js'
import { SUPPORT_PHONE } from '../farmer/Misc.js'
import CollegeCard from './CollegeCard.js'
import HeroArt from './HeroArt.js'
import logo from '../../assets/logo.png'

type Mode = 'join' | 'login'

/**
 * The public landing page, laid out like the project poster: who it is for,
 * why it is needed, how it works, what it offers, what it should change, and
 * the college behind it.
 *
 * Its practical job is the four entry buttons in the first card - farmer and
 * buyer, each with sign-up and log-in. The feature list describes the whole
 * programme, so it names parts that are still being built.
 */
export default function Landing() {
  const t = useT()
  const { lang, setLang, langs } = useI18n()
  const nav = useNavigate()
  const { session, signOut } = useAuth()

  /** Set when a button needs the "end this session first?" decision. */
  const [switchTo, setSwitchTo] = useState<{ role: Role; mode: Mode } | null>(null)

  /**
   * EVERY BUTTON GOES THROUGH THE PHONE SCREEN. What differs is how much is left:
   *
   *  - no session          -> /join/<role> or /login/<role>;
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
    // A half-finished farmer registration holds a verified ticket and several
    // screens of answers; a buyer button would silently abandon both.
    if (role === 'customer' && liveTicket()) {
      setSwitchTo({ role, mode })
      return
    }
    nav(`/${mode}/${role}`)
  }

  /** The confirmation is about a pending registration, not a live session. */
  const abandoning = switchTo !== null && !session

  const workflow = [
    [IconFarmer, t('lp.wf1')],
    [IconSend, t('lp.wf2')],
    [IconCash, t('lp.wf3')],
    [IconBuy, t('lp.wf4')],
    [IconQr, t('lp.wf5')],
    [IconDelivery, t('lp.wf6')],
  ] as const

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

      <main className="wrap lstack">
        {/* 1. Hero: who we are, and the four ways in */}
        <Card className="lhero">
          <img className="lhero__logo" src={logo} alt="" aria-hidden="true" />
          <h1 className="lhero__name">{t('app.name')}</h1>
          <p className="lhero__short">{t('app.nameShort')}</p>
          <p className="lhero__band">{t('lp.band')}</p>
          <p className="lhero__tag">{t('app.tagline')}</p>
          <HeroArt />
          <p className="lhero__mission">{t('lp.mission')}</p>
          <p className="lhero__intro">{t('lp.intro')}</p>

          <h2 className="lhero__who"><IconFarmer aria-hidden="true" /> {t('lp.farmers')}</h2>
          <div className="doors doors--pair">
            <button className="door door--primary" onClick={() => go('farmer', 'join')}>
              <span className="door__icon" aria-hidden="true"><IconSell /></span>
              <span className="door__t">{t('lp.register')}</span>
            </button>
            <button className="door door--primary" onClick={() => go('farmer', 'login')}>
              <span className="door__icon" aria-hidden="true"><IconFarmer /></span>
              <span className="door__t">{t('lp.login')}</span>
            </button>
          </div>

          <h2 className="lhero__who"><IconBuy aria-hidden="true" /> {t('lp.buyers')}</h2>
          <div className="doors doors--pair">
            <button className="door" onClick={() => go('customer', 'join')}>
              <span className="door__icon" aria-hidden="true"><IconBuy /></span>
              <span className="door__t">{t('lp.register')}</span>
            </button>
            <button className="door" onClick={() => go('customer', 'login')}>
              <span className="door__icon" aria-hidden="true"><IconBuy /></span>
              <span className="door__t">{t('lp.login')}</span>
            </button>
          </div>
        </Card>

        {/* 2. Why the project is needed */}
        <Card>
          <div className="sec-head"><h2 className="sec-head__t">{t('lp.needTitle')}</h2></div>
          <ul className="llist">
            {['lp.need1', 'lp.need2', 'lp.need3', 'lp.need4', 'lp.need5'].map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        </Card>

        {/* 2b. Aims. The poster's "analysis with AI" line has no AI here. */}
        <Card>
          <div className="sec-head">
            <h2 className="sec-head__t"><IconGrowth aria-hidden="true" /> {t('lp.goalsTitle')}</h2>
          </div>
          <ul className="llist">
            {['lp.goal1', 'lp.goal2', 'lp.goal3', 'lp.goal4', 'lp.goal5'].map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        </Card>

        {/* 3. Workflow. The poster's "AI analysis" step is a price hint here:
            this build has no AI (spec 5.8). */}
        <Card>
          <div className="sec-head"><h2 className="sec-head__t">{t('lp.workflowTitle')}</h2></div>
          <ol className="lflow">
            {workflow.map(([Icon, label], i) => (
              <li key={label}>
                <span className="lflow__i" aria-hidden="true"><Icon /></span>
                <span><b className="num">{i + 1}.</b> {label}</span>
              </li>
            ))}
          </ol>
        </Card>

        {/* 4. Features - the whole programme, including parts still being built */}
        <Card>
          <div className="sec-head"><h2 className="sec-head__t">{t('lp.featuresTitle')}</h2></div>
          <ul className="llist llist--tick">
            {['lp.feat1', 'lp.feat2', 'lp.feat3', 'lp.feat4', 'lp.feat5', 'lp.feat6', 'lp.feat7'].map((k) => (
              <li key={k}><IconCheck aria-hidden="true" /> {t(k)}</li>
            ))}
          </ul>
        </Card>

        {/* 5. Expected outcomes */}
        <Card>
          <div className="sec-head"><h2 className="sec-head__t">{t('lp.benefitsTitle')}</h2></div>
          <ul className="llist llist--tick">
            {['lp.ben1', 'lp.ben2', 'lp.ben3', 'lp.ben4', 'lp.ben5'].map((k) => (
              <li key={k}><IconCheck aria-hidden="true" /> {t(k)}</li>
            ))}
          </ul>
        </Card>

        {/* 6. The college behind the project */}
        <Card>
          <div className="sec-head"><h2 className="sec-head__t">{t('lp.collegeTitle')}</h2></div>
          <CollegeCard />
        </Card>
      </main>

      {/* 7. Footer */}
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
        title={abandoning ? t('lp.abandonTitle') : t('lp.switchTitle')}
        body={
          abandoning
            ? t('lp.abandonBody')
            : switchTo?.role === 'customer' ? t('lp.switchBuyBody') : t('lp.switchBody')
        }
        confirmLabel={abandoning ? t('lp.abandonConfirm') : t('lp.switchConfirm')}
        tone="danger"
        onCancel={() => setSwitchTo(null)}
        onConfirm={() => {
          const target = switchTo
          setSwitchTo(null)
          if (abandoning) {
            // The ticket AND the answers, together; a draft left behind would
            // keep a name and village on the handset that nothing can submit.
            const pending = liveTicket()
            if (pending) clearDraft(sessionStore(), pending.phone)
            clearRegisterTicket()
          } else {
            signOut()
          }
          if (target) nav(`/${target.mode}/${target.role}`)
        }}
      />
    </div>
  )
}
