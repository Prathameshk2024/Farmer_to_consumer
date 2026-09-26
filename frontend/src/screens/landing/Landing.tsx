import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Role } from '@shared/types.js'
import { useI18n, useT } from '../../i18n/I18nProvider.js'
import { homeFor, useAuth } from '../../store/AuthContext.js'
import { ConfirmSheet } from '../../components/ui.js'
import {
  IconBuy, IconBuyers, IconCheck, IconQr, IconSafe, IconSell, IconSeller,
} from '../../components/icons.js'
import { clearRegisterTicket, liveTicket } from '../../lib/registerTicket.js'
import { clearDraft, sessionStore } from '../auth/sellerDraft.js'
import CollegeCard from './CollegeCard.js'
import PhotoRotator from './PhotoRotator.js'
import logo from '../../assets/logo.png'
import heroPapad from '../../assets/landing/papad.jpg'
import heroPickle from '../../assets/landing/pickle-jar.jpg'
import heroSpices from '../../assets/landing/spices.jpg'
import heroWeaving from '../../assets/landing/weaving-loom.jpg'
import phonePhoto from '../../assets/landing/phone-photo.jpg'
import phoneVoice from '../../assets/landing/phone-voice.jpg'
import phoneTogether from '../../assets/landing/phone-together.jpg'
import phoneOrder from '../../assets/landing/phone-order.jpg'
import catMasala from '../../assets/categories/masala.jpg'
import catPickles from '../../assets/categories/pickles.jpg'
import catPapad from '../../assets/categories/papad.jpg'
import catSweets from '../../assets/categories/sweets.jpg'
import catHandicrafts from '../../assets/categories/handicrafts.jpg'
import catTextiles from '../../assets/categories/textiles.jpg'
import catAgarbatti from '../../assets/categories/agarbatti.jpg'
import catHomemade from '../../assets/categories/homemade.jpg'

/* The hero shows what she makes. The "built for her" section shows her using
   the app, because that is what the copy beside it actually claims. */
/* Same order as the lede names them: पापड, लोणची, मसाले, हस्तकला. */
const HERO_PHOTOS = [heroPapad, heroPickle, heroSpices, heroWeaving]
const PHONE_PHOTOS = [phonePhoto, phoneVoice, phoneTogether, phoneOrder]

/**
 * The public landing page — the only full-width surface in the app.
 *
 * Its single job is to send two very different people through two different
 * doors: a woman who wants to sell, and a shopper who wants to buy. Both doors
 * appear above the fold and again at the bottom, because on a phone a long
 * page loses the top.
 *
 * Everything else exists to make a first-time visitor trust it, so the copy
 * leads with the problem in her own words rather than with platform features.
 */
export default function Landing() {
  const t = useT()
  const { lang, setLang, langs } = useI18n()
  const nav = useNavigate()
  const { session, signOut } = useAuth()

  /** Set when a door needs the "end this session first?" decision. */
  const [switchTo, setSwitchTo] = useState<Role | null>(null)

  /**
   * BOTH DOORS GO THROUGH LOGIN. What differs is how much of it is left:
   *
   *  - no session          -> the phone + OTP screen for that role;
   *  - a session, same role -> straight in. She has already logged in, and
   *    asking again would be the app forgetting her, which is what a back
   *    press out of /seller used to look like;
   *  - a session, the OTHER role -> one account can only be in one section at
   *    a time, so this genuinely needs the current session closed. That is a
   *    consequence worth spelling out rather than doing silently, so it is a
   *    confirmation with the consequence in the body and "लॉग आउट करा" on the
   *    button - never a bare "are you sure?".
   */
  function go(role: Role) {
    if (session) {
      if (session.role === role) nav(homeFor(role))
      else setSwitchTo(role)
      return
    }

    /**
     * HALF REGISTERED IS ALSO "IN THE SELLING SECTION", even though there is
     * no session yet - she is holding a verified ticket and six screens of
     * answers. Walking her silently into customer login would abandon both,
     * and she would find out only when she came back to finish and was asked
     * for a fresh OTP. So the buy door asks first, exactly like the
     * session case, and only then ends the registration she had going.
     */
    if (role === 'customer' && liveTicket()) {
      setSwitchTo('customer')
      return
    }

    nav(`/login/${role}`)
  }

  /** The confirmation is about a pending registration, not a live session. */
  const abandoning = switchTo !== null && !session

  const goSell = () => go('seller')
  const goBuy = () => go('customer')

  return (
    <div className="landing">
      {/* ---------------------------------------------------------- */}
      {/* 1. Header                                                    */}
      {/* ---------------------------------------------------------- */}
      <header className="lnav">
        <div className="wrap lnav__in">
          <div className="brand">
            {/* शांताबाई herself. The app is named after her, so the mark is
                her portrait rather than the first letter of her name. */}
            <img className="brand__mark" src={logo} alt="" aria-hidden="true" />
            <span>
              <span className="brand__name">
                शांताई <em>महिला बाजार</em>
              </span>
              <span className="brand__sub">Shantai Mahila Bazar</span>
            </span>
          </div>

          <div className="grow" />

          {/* Language sits in the header, never buried in settings. */}
          <div className="langswitch">
            {langs.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                aria-pressed={lang === l.code}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------- */}
      {/* 2. Hero                                                      */}
      {/* ---------------------------------------------------------- */}
      <section className="hero">
        <div className="wrap hero__in">
          <div>
            <span className="hero__eyebrow">
              <span aria-hidden="true">●</span> {t('lp.eyebrow')}
            </span>

            <h1>
              {t('lp.heroA')}
              <br />
              <em>{t('lp.heroB')}</em>
            </h1>

            <p className="hero__lede">{t('lp.heroLede')}</p>

            <div className="doors">
              <button className="door door--primary" onClick={goSell}>
                <span className="door__icon" aria-hidden="true"><IconSell /></span>
                <span className="grow">
                  <span className="door__t">{t('lp.ctaSell')}</span>
                  {/* In Marathi the door and its sub-line are now the same
                      sentence, so the second copy is dropped rather than
                      printed twice. English still has two distinct lines. */}
                  {t('lp.sellerDoorSub') !== t('lp.ctaSell') && (
                    <span className="door__s">{t('lp.sellerDoorSub')}</span>
                  )}
                </span>
              </button>

              <button className="door" onClick={goBuy}>
                <span className="door__icon" aria-hidden="true"><IconBuy /></span>
                <span className="grow">
                  <span className="door__t">{t('lp.ctaBuy')}</span>
                  <span className="door__s">{t('lp.customerDoorSub')}</span>
                </span>
              </button>
            </div>
          </div>

          <figure className="hero__art">
            <PhotoRotator photos={HERO_PHOTOS} />
            <figcaption>
              <strong>{t('lp.artName')}</strong>
              {t('lp.artCaption')}
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 3. How it works — two lanes, four steps each                 */}
      {/* ---------------------------------------------------------- */}
      <section className="lsection lsection--tint">
        <div className="wrap">
          <div className="lsection__head">
            <h2>{t('lp.howTitle')}</h2>
            <p>{t('lp.howLede')}</p>
          </div>

          <div className="lanes">
            <div className="lane">
              <h3 className="lane__t">
                <IconSeller aria-hidden="true" /> {t('lp.forSellers')}
              </h3>
              <ol className="steps">
                {[t('lp.s1'), t('lp.s2'), t('lp.s3'), t('lp.s4')].map((step, i) => (
                  <li key={step}>
                    <b>{i + 1}</b>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="lane lane--buy">
              <h3 className="lane__t">
                <IconBuy aria-hidden="true" /> {t('lp.forCustomers')}
              </h3>
              <ol className="steps">
                {[t('lp.c1'), t('lp.c2'), t('lp.c3'), t('lp.c4')].map((step, i) => (
                  <li key={step}>
                    <b>{i + 1}</b>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 4. Why                                                       */}
      {/* ---------------------------------------------------------- */}
      <section className="lsection">
        <div className="wrap">
          <div className="lsection__head">
            <h2>{t('lp.whyTitle')}</h2>
          </div>

          <div className="whys">
            {([
              [IconBuyers, t('lp.w1'), t('lp.w1b')],
              [IconQr, t('lp.w2'), t('lp.w2b')],
              [IconSeller, t('lp.w3'), t('lp.w3b')],
              [IconSafe, t('lp.w4'), t('lp.w4b')],
            ] as const).map(([Icon, title, body]) => (
              <article className="why" key={title}>
                <div className="why__icon" aria-hidden="true"><Icon /></div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 5. Categories — tapping one goes straight to shopping        */}
      {/* ---------------------------------------------------------- */}
      <section className="lsection lsection--tint">
        <div className="wrap">
          <div className="lsection__head">
            <h2>{t('lp.catTitle')}</h2>
            <p>{t('lp.catLede')}</p>
          </div>

          <div className="cats">
            {[
              [catMasala, 'मसाले', 'Masala'],
              [catPickles, 'लोणची', 'Pickles'],
              [catPapad, 'पापड', 'Papad'],
              [catSweets, 'मिठाई', 'Sweets'],
              [catHandicrafts, 'हस्तकला', 'Handicrafts'],
              [catTextiles, 'कापड', 'Textiles'],
              [catAgarbatti, 'अगरबत्ती', 'Agarbatti'],
              [catHomemade, 'घरगुती पदार्थ', 'Homemade'],
            ].map(([photo, mr, en]) => (
              <button className="cat" key={en} onClick={goBuy}>
                {/* The photo is decorative: the label under it names the
                    category, so alt text would only repeat what is read next. */}
                <img className="cat__i" src={photo} alt="" aria-hidden="true" />
                <div className="cat__t">{lang === 'mr' ? mr : en}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 6. Built for her                                             */}
      {/* ---------------------------------------------------------- */}
      <section className="lsection">
        <div className="wrap women">
          <figure className="hero__art" style={{ margin: 0 }}>
            <PhotoRotator photos={PHONE_PHOTOS} />
          </figure>

          <div className="women__copy">
            <h2>{t('lp.womenTitle')}</h2>
            <p className="muted">{t('lp.womenLede')}</p>
            <ul className="women__list">
              {[t('lp.wl1'), t('lp.wl2'), t('lp.wl3'), t('lp.wl4')].map((line) => (
                <li key={line}>
                  <span aria-hidden="true"><IconCheck /></span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 7. The college behind the project                            */}
      {/* ---------------------------------------------------------- */}
      <section className="lsection lsection--tint">
        <div className="wrap">
          <div className="lsection__head">
            <h2>{t('lp.collegeTitle')}</h2>
            <p>{t('lp.collegeLede')}</p>
          </div>
          <CollegeCard />
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 8. Final call — the doors again                              */}
      {/* ---------------------------------------------------------- */}
      <section className="lsection">
        <div className="wrap">
          <div className="cta">
            <h2>{t('lp.finalTitle')}</h2>
            <p>{t('lp.finalLede')}</p>
            <div className="cta__btns">
              <button className="btn" onClick={goSell}>
                <IconSell aria-hidden="true" /> {t('lp.finalSell')}
              </button>
              <button className="btn btn--ghost" onClick={goBuy}>
                <IconBuy aria-hidden="true" /> {t('lp.finalBuy')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* 9. Footer                                                    */}
      {/* ---------------------------------------------------------- */}
      <footer className="lfoot">
        <div className="wrap lfoot__in">
          <div>
            <strong style={{ color: 'var(--maroon)' }}>शांताई महिला बाजार</strong>
            {' — '}
            {t('lp.footer')}
          </div>
          <div>Shantai Mahila Bazar</div>
        </div>
      </footer>

      {/* One account, one section at a time. Switching means ending the
          session she is holding, so the body says so and the button says what
          it does - never a bare "are you sure?". */}
      <ConfirmSheet
        open={switchTo !== null}
        title={abandoning ? t('lp.abandonTitle') : t('lp.switchTitle')}
        body={
          abandoning
            ? t('lp.abandonBody')
            : switchTo === 'customer' ? t('lp.switchBuyBody') : t('lp.switchBody')
        }
        confirmLabel={abandoning ? t('lp.abandonConfirm') : t('lp.switchConfirm')}
        tone="danger"
        onCancel={() => setSwitchTo(null)}
        onConfirm={() => {
          const role = switchTo
          setSwitchTo(null)
          if (abandoning) {
            // Her ticket AND her answers, together. Leaving the draft behind
            // would put her name and village on the handset with nothing left
            // that could ever submit them.
            const pending = liveTicket()
            if (pending) clearDraft(sessionStore(), pending.phone)
            clearRegisterTicket()
          } else {
            signOut()
          }
          if (role) nav(`/login/${role}`)
        }}
      />
    </div>
  )
}
