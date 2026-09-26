import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useI18n, useT } from '../i18n/I18nProvider.js'
import logo from '../assets/logo.png'
import { useAuth } from '../store/AuthContext.js'
import { api } from '../lib/api.js'
import { Button, useAsync } from './ui.js'
import { Confirm } from './Confirm.js'
import {
  IconBack, IconHome, IconImpact, IconOrders, IconProducts,
  IconComplaints, IconReviews, IconFarmers, IconToday, IconPasswords, IconMap,
} from './icons.js'

/**
 * Sidebar plus working area.
 *
 * The badges are the point of the sidebar: an admin's job here is a queue, and
 * the counts are what tells her whether there is one. They come from
 * /admin/stats, which already computes all three, so no extra request.
 */
export function Shell() {
  const t = useT()
  const { signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  /**
   * Polled, at one minute.
   *
   * The comment that used to sit here said nothing changes without an admin
   * doing it - and that was wrong in exactly the case that matters. A farmer
   * registers and then cannot sell anything at all until somebody here
   * verifies him; he has no way to hurry that along, and nobody at this desk
   * had any way to know he was waiting short of reloading the page.
   *
   * One request a minute against an endpoint that reads an in-memory snapshot
   * is cheap. Anything faster would be spending a woman's Firestore quota to
   * tell an admin something a minute sooner.
   *
   * Only while the tab is visible. The API runs with CPU always allocated, so
   * Cloud Run bills every second an instance is up, and a console left open
   * overnight in a background tab kept one up all night asking for numbers
   * nobody was looking at. Coming back to the tab asks at once instead.
   */
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const bump = () => {
      if (document.visibilityState === 'visible') setTick((n) => n + 1)
    }
    const id = setInterval(bump, 60_000)
    document.addEventListener('visibilitychange', bump)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', bump)
    }
  }, [])

  const [data] = useAsync(() => api.stats(), [tick])
  const s = data?.stats

  const items = [
    { to: '/', end: true, icon: IconHome, label: t('nav.home') },
    { to: '/today', icon: IconToday, label: t('nav.today') },
    { to: '/products', icon: IconProducts, label: t('nav.products') },
    { to: '/farmers', icon: IconFarmers, label: t('nav.farmers'), badge: s?.pendingVerification },
    { to: '/orders', icon: IconOrders, label: t('nav.orders'), badge: s?.stuckOrders },
    { to: '/reviews', icon: IconReviews, label: t('nav.reviews') },
    { to: '/complaints', icon: IconComplaints, label: t('nav.complaints') },
    { to: '/password-requests', icon: IconPasswords, label: t('pwr.title'), badge: s?.openPasswordRequests },
    { to: '/impact', icon: IconImpact, label: t('nav.impact') },
    { to: '/map', icon: IconMap, label: t('map.title') },
  ]

  return (
    <div className="shell">
      <aside className="side">
        {/* The mark goes home, the way a masthead does everywhere else. It was
            the only thing on the page that looked clickable and was not. */}
        <Link className="side__brand" to="/" aria-label={t('nav.home')}>
          {/* The mark is decorative; the name is printed beside it. */}
          <img className="side__logo" src={logo} alt="" aria-hidden="true" />
          <div className="min0">
            <div className="side__name">{t('app.name')}</div>
            <div className="side__short">{t('app.nameShort')}</div>
            <div className="side__role">{t('app.admin')}</div>
          </div>
        </Link>

        <nav className="side__nav">
          {items.map(({ to, end, icon: Icon, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `navlink ${isActive ? 'navlink--on' : ''}`}
            >
              <span className="navlink__icon" aria-hidden="true"><Icon /></span>
              <span className="grow truncate">{label}</span>
              {!!badge && <span className="navlink__badge num">{badge}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="side__foot">
          {/* Asked, not done on the first click: the button sits at the
              bottom of the sidebar, right under the nav an admin is clicking
              all day, and getting back in means finding the password. */}
          {signingOut ? (
            <Confirm
              open
              title={t('app.signOutConfirmTitle')}
              description={t('app.signOutConfirm')}
              confirmLabel={t('app.signOut')}
              tone="danger"
              onConfirm={signOut}
              onCancel={() => setSigningOut(false)}
            />
          ) : (
            <Button variant="quiet" small className="side__signout" onClick={() => setSigningOut(true)}>{t('app.signOut')}</Button>
          )}
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}

/**
 * The whole console is bilingual, so this is not a settings-page preference -
 * it sits in the chrome where it can be reached from any screen, in one click.
 * In the top bar's right-hand corner, where a language switch is looked for;
 * at the foot of the sidebar it sat below the fold on a short laptop screen.
 */
export function LangToggle() {
  const { lang, setLang, langs } = useI18n()
  const t = useT()

  return (
    <div className="langtoggle" role="group" aria-label={t('app.language')}>
      {langs.map((l) => (
        <button
          key={l.code}
          type="button"
          aria-pressed={lang === l.code}
          onClick={() => setLang(l.code)}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

export function TopBar({
  title, sub, back, backLabel,
}: {
  title: string
  sub?: string
  /** Where the arrow goes. A page reached from a list needs the way back in
   *  the chrome, not only in the browser's own button. */
  back?: string
  backLabel?: string
}) {
  return (
    <div className="topbar">
      {back && (
        <Link className="topbar__back" to={back} aria-label={backLabel ?? 'Back'}>
          <IconBack aria-hidden="true" />
        </Link>
      )}
      <h1>{title}</h1>
      {sub && <span className="topbar__sub">{sub}</span>}
      <LangToggle />
    </div>
  )
}
