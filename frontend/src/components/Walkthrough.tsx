import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useT } from '../i18n/I18nProvider.js'
import {
  TOURS, TOUR_MENU, markTourSeen, seenTours, shouldMarkSeen, wantsTour,
  type TourId, type TourStep,
} from '../lib/tours.js'
import { Button, Dots } from './ui.js'
import { IconNext, IconTraining } from './icons.js'

/**
 * The walkthrough for ONE page. Drop `<PageTour id="..." />` at the end of a
 * screen and it opens itself the first time she lands there.
 *
 * It rings the real control - there is no mock screen anywhere in here - so
 * what she is taught is the thing she then taps.
 */
export function PageTour({ id }: { id: TourId }) {
  const t = useT()
  const nav = useNavigate()
  const loc = useLocation()

  /**
   * The steps whose control is REALLY on this screen, decided when the tour
   * opens, not when it was written.
   *
   * An empty cart has no quantity buttons and no checkout bar, and a
   * walkthrough of three missing controls is three dimmed screens that teach
   * nothing. `null` means closed - and a tour that finds nothing does not
   * open, is not marked seen, and offers itself again when there is something
   * to point at.
   */
  const [live, setLive] = useState<TourStep[] | null>(null)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  /** An open we have committed to, still hunting for its controls. */
  const [wanted, setWanted] = useState(false)

  /* Help & Training asks for a replay by navigating here with the tour id in
     route state. The state is dropped as soon as it is spent, so a Back press
     onto this same entry does not start it over. */
  const replay = (loc.state as { tour?: TourId } | null)?.tour === id

  /**
   * Decide, then hunt - two effects, because the decision is made once and the
   * hunt can take a second.
   *
   * Wiping the route state re-runs this with `replay` already false, so the
   * intent has to be remembered rather than re-derived: without `wanted`, the
   * wipe cancelled the open that was still waiting for the screen to load, and
   * a topic tapped in Help & Training landed on the right page and did
   * nothing.
   */
  useEffect(() => {
    const seen = seenTours(localStorage).includes(id)
    setWanted((already) => wantsTour({ replay, seen, already }))
    // Outside the updater: React may run an updater twice in development, and
    // a navigation is not something to do twice.
    if (replay) nav(loc.pathname, { replace: true, state: null })
  }, [id, replay, loc.pathname, nav])

  useEffect(() => {
    if (!wanted || live) return

    /* The screen is usually still fetching when this mounts, so the controls
       do not exist yet. Look again for a couple of seconds rather than
       deciding on an empty page. */
    let tries = 0
    const open = () => {
      const found = TOURS[id].filter((s) => !s.sel || document.querySelector(s.sel))
      if (found.length) {
        setLive(found)
        setStep(0)
        return true
      }
      return false
    }
    if (open()) return
    const timer = setInterval(() => {
      if (open()) return clearInterval(timer)
      if (++tries > 6) {
        clearInterval(timer)
        // Asked for by name from Help & Training, so it never ends in silence:
        // with nothing to ring, the words still get their screen.
        setLive(TOURS[id])
        setStep(0)
      }
    }, 400)
    return () => clearInterval(timer)
  }, [wanted, live, id])

  /* Follow the control: the screen scrolls under the ring, and a phone
     keyboard or a rotation moves everything. */
  useEffect(() => {
    if (!live) return
    const sel = live[step]?.sel
    const el = sel ? document.querySelector(sel) : null

    const measure = () => {
      if (!el) return setRect(null)
      const r = el.getBoundingClientRect()
      /**
       * A ring around something the size of the page is not a highlight - the
       * dim is its own box-shadow, so a target that fills the screen pushes
       * the shade off the edges and draws a border around everything. Past
       * three quarters of the viewport, dim the screen and let the words do
       * the work.
       */
      const covers = (r.height * r.width) / (window.innerHeight * window.innerWidth)
      setRect(covers > 0.75 ? null : r)
    }

    // Only scroll when it is not already in front of her. A sticky bar is
    // always in view, and scrolling to its position in the document flow
    // throws the page to the bottom for no reason.
    const r = el?.getBoundingClientRect()
    const onScreen = r && r.top >= 0 && r.bottom <= window.innerHeight
    if (el && !onScreen) el.scrollIntoView({ block: 'center', behavior: 'smooth' })

    measure()
    // The scroll above is animated, so one measurement lands mid-flight.
    const settle = setTimeout(measure, 400)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      clearTimeout(settle)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [step, live])

  /**
   * THE PAGE UNDERNEATH HOLDS STILL.
   *
   * `.tour__block` caught taps but not a scroll: a wheel or a swipe still
   * moved the page, the ringed control slid up with it, and the ring - which
   * correctly follows its control - went up under the app bar, so the
   * highlight ended up around a tile half hidden behind the maroon header.
   * Nothing on screen explains that, and she has been told this page is a
   * picture for the moment.
   *
   * Locking the document rather than moving it keeps her scroll position, so
   * the page is exactly where she left it when the walkthrough closes.
   */
  useEffect(() => {
    if (!live) return
    // On a desktop browser the scrollbar is real, and hiding it would shift
    // the page - and the control under the ring - sideways as the tour opens.
    // A phone's scrollbar floats over the page and measures zero here.
    const bar = window.innerWidth - document.documentElement.clientWidth
    document.documentElement.classList.add('tour-open')
    if (bar > 0) document.body.style.paddingRight = `${bar}px`
    return () => {
      document.documentElement.classList.remove('tour-open')
      document.body.style.paddingRight = ''
    }
  }, [live])

  const close = useCallback(() => {
    // Skipping counts as done. Being shown the same overlay every visit
    // because she chose not to read it is nagging, not teaching.
    //
    // A stand-in shown on an empty screen does not count: she was told to go
    // and choose products, not taught the cart, so the real walkthrough is
    // still owed to her.
    if (live && shouldMarkSeen(live)) markTourSeen(localStorage, id)
    // Closed means closed: a provisional tour is not marked seen, so without
    // this the hunt would start again the moment it was dismissed.
    setWanted(false)
    setLive(null)
    setRect(null)
  }, [id, live])

  useEffect(() => {
    if (!live) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [live, close])

  if (!live) return null

  const s = live[Math.min(step, live.length - 1)]!
  const last = step >= live.length - 1
  // The card sits opposite the control, so it never covers what it explains.
  const cardTop = !!rect && rect.top + rect.height / 2 > window.innerHeight * 0.55

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={t('wt.title')}>
      {/* Catches every tap: during a walkthrough the page underneath is a
          picture, not a control. */}
      <div className="tour__block" onClick={close} />
      {rect ? (
        <div
          className="tour__ring"
          style={{
            top: rect.top - 6, left: rect.left - 6,
            width: rect.width + 12, height: rect.height + 12,
          }}
        />
      ) : (
        <div className="tour__dim" />
      )}

      <div className={`tour__card ${cardTop ? 'tour__card--top' : ''}`}>
        <Dots step={step} total={live.length} />
        <h2 className="h2">{t(s.title)}</h2>
        <p className="body">{t(s.body)}</p>
        <div className="btn-row">
          <Button variant="quiet" onClick={close}>{t('common.skip')}</Button>
          <Button onClick={() => (last ? close() : setStep(step + 1))}>
            {last ? t('common.done') : t('common.next')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * The Help & Training list: one row per bottom tab. Tapping one goes to the
 * REAL page and starts its walkthrough there, seen before or not.
 */
export function TourMenu({ role }: { role: 'seller' | 'customer' }) {
  const t = useT()
  const nav = useNavigate()
  return (
    <div className="stack-sm" data-wt="help-tours">
      {TOUR_MENU[role].map(({ id, to, label }) => (
        <button key={id} className="tile" onClick={() => nav(to, { state: { tour: id } })}>
          <div className="tile__img" aria-hidden="true"><IconTraining /></div>
          <div className="tile__body">
            <div className="tile__title">{t(label)}</div>
            <div className="tile__meta">{t('wt.replay')}</div>
          </div>
          <span aria-hidden="true"><IconNext /></span>
        </button>
      ))}
    </div>
  )
}
