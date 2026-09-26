import {
  useCallback, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n, useT } from '../i18n/I18nProvider.js'
import { useVoiceInput } from '../lib/useVoiceInput.js'
import {
  dropCache, openScreen, screenIdentity, shownFor, writeCache, type Shown,
} from '../lib/screenCache.js'
import NotificationBell from './NotificationBell.js'
import logo from '../assets/logo.png'
import { useToast } from '../store/ToastContext.js'
import {
  IconBack, IconCheck, IconCopy, IconEmpty, IconMic,
  IconMicStop, IconMinus, IconNo, IconPlus, IconWaiting, IconWarn, IconYes,
  type IconType,
} from './icons.js'

/* ================================================================== */
/* Buttons                                                             */
/* ================================================================== */

type Variant = 'primary' | 'ghost' | 'quiet' | 'danger' | 'accent'

export function Button({
  variant = 'primary', size, className = '', children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' }) {
  const v: Record<Variant, string> = {
    primary: '', ghost: 'btn--ghost', quiet: 'btn--quiet',
    danger: 'btn--danger', accent: 'btn--accent',
  }
  return (
    <button
      type="button"
      className={`btn ${v[variant]} ${size === 'sm' ? 'btn--sm' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ================================================================== */
/* App bar                                                             */
/* ================================================================== */

export function AppBar({
  title, sub, onBack, right, backTo, bell = true, brand = false,
}: {
  title: ReactNode
  sub?: ReactNode
  onBack?: () => void
  right?: ReactNode
  backTo?: string
  /**
   * शांताबाई's portrait beside the title. On the screens she arrives at - the
   * four tabs and the phone/OTP doors - and nowhere deeper, because a detail
   * screen already told her where she is and the header space belongs to the
   * back button and the title. The mark carries its own gold ring; never add
   * a border or a background here or it prints a second one.
   */
  brand?: boolean
  /**
   * The notification bell, on by default.
   *
   * In the bar rather than floated over it, so it takes its own space beside
   * the audio-help button instead of covering it. Off on the screens that have
   * no session behind them - the OTP screens - where it would render nothing
   * anyway but would still cost a render.
   */
  bell?: boolean
}) {
  const t = useT()
  const nav = useNavigate()
  return (
    <header className="appbar">
      {(onBack || backTo) && (
        <button
          className="appbar__btn"
          aria-label={t('common.back')}
          onClick={() => (onBack ? onBack() : nav(backTo!))}
        >
          <IconBack aria-hidden="true" />
        </button>
      )}
      {brand && <img className="appbar__mark" src={logo} alt="" aria-hidden="true" />}
      <h1 className="appbar__title">
        {title}
        {sub && <span className="appbar__sub">{sub}</span>}
      </h1>
      {right}
      {bell && <NotificationBell />}
    </header>
  )
}

/**
 * Reads the screen aloud in Marathi. The single biggest accessibility win for
 * a seller who reads slowly. Speech synthesis is the stand-in; ship
 * pre-recorded clips, because synthesised Marathi is poor on most phones.
 */
/* ================================================================== */
/* Surfaces                                                            */
/* ================================================================== */

export function Card({
  className = '', children, ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="row-between" style={{ marginBottom: 'var(--s2)' }}>
      <h2 className="section-title" style={{ margin: 0 }}>{children}</h2>
      {action}
    </div>
  )
}

export function Notice({
  tone = 'info', title, children,
}: {
  tone?: 'info' | 'warn' | 'ok' | 'danger'
  title?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={`notice notice--${tone}`}>
      {title && <strong className="notice__title">{title}</strong>}
      {children}
    </div>
  )
}

export function Pill({
  tone = 'neutral', icon, children,
}: {
  tone?: 'neutral' | 'info' | 'warn' | 'ok' | 'danger'
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <span className={`pill pill--${tone}`}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  )
}

export function EmptyState({
  icon: Icon = IconEmpty, title, body, action,
}: {
  icon?: IconType
  title: ReactNode
  body?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true"><Icon /></div>
      <div className="empty__title">{title}</div>
      {body && <div className="empty__body">{body}</div>}
      {action}
    </div>
  )
}

export function Loading() {
  const t = useT()
  return (
    <div className="empty">
      <div className="empty__icon empty__icon--spin" aria-hidden="true"><IconWaiting /></div>
      <div className="empty__body">{t('common.loading')}</div>
    </div>
  )
}

/* ================================================================== */
/* Fields                                                              */
/* ================================================================== */

export function Field({
  label, hint, error, required, children, htmlFor,
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  required?: boolean
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <div className="field">
      {label && (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
          {required && <span className="field__req" aria-hidden="true">*</span>}
        </label>
      )}
      {hint && <div className="field__hint">{hint}</div>}
      {children}
      {error && (
        <div className="field__err" role="alert">
          <IconWarn aria-hidden="true" /> {error}
        </div>
      )}
    </div>
  )
}

export function TextInput({
  error, ...rest
}: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return <input className={`input ${error ? 'input--err' : ''}`} {...rest} />
}

/**
 * A text field with its OWN microphone.
 *
 * Each field owns one recogniser and dictates into itself and nothing else.
 * The alternative - a single mic in the header that types into whichever field
 * was last touched - was tidier on screen and worse in the hand: a woman who
 * pressed it after scrolling had no way to tell where the words would land,
 * and there was nothing on the field itself to say it could be spoken.
 *
 * The keyboard is never taken away. The mic is an addition, so a phone with no
 * speech engine (iOS Safari) simply renders the plain box - the field still
 * works, and nothing is missing except the shortcut.
 *
 * Speech APPENDS rather than replaces. She says a name, sees it wrong, and
 * fixes the last word by hand; overwriting what is already there would throw
 * away the correction she just made.
 */
export function VoiceInput({
  value, onChange, error, multiline, lang: langOverride, speakHint, ...rest
}: {
  value: string
  onChange: (v: string) => void
  error?: boolean
  multiline?: boolean
  lang?: string
  /**
   * Say, under the box, that it can be spoken. For fields that are hard to
   * type - a village name that is not on our list. Where this phone cannot
   * listen, it points at the microphone on her keyboard instead, which works
   * in any box.
   */
  speakHint?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const t = useT()
  const { lang } = useI18n()

  // The latest value without re-creating the recogniser on every keystroke.
  const valueRef = useRef(value)
  valueRef.current = value

  const append = useCallback(
    (text: string) => {
      const current = valueRef.current
      onChange(current ? `${current} ${text}` : text)
    },
    [onChange],
  )

  const voice = useVoiceInput(append, {
    lang: langOverride ?? (lang === 'en' ? 'en-IN' : 'mr-IN'),
  })

  /**
   * The box grows with what is in it.
   *
   * A drag handle in the corner is a desktop idea: there is no corner to drag
   * on a phone, and the handle only ever produced a box stretched out of
   * shape. So the height follows the text - `resize: none` in the stylesheet,
   * and the height set from `scrollHeight` on every change and whenever the
   * value arrives from outside, which is what an edit screen loading her
   * saved words does.
   */
  const boxRef = useRef<HTMLTextAreaElement | null>(null)
  const grow = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => {
    if (multiline) grow(boxRef.current)
  }, [value, multiline, grow])

  const field = multiline ? (
    <textarea
      ref={boxRef}
      className={`textarea ${error ? 'textarea--err' : ''}`}
      value={value}
      rows={3}
      onChange={(e) => {
        onChange(e.target.value)
        grow(e.currentTarget)
      }}
      {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
    />
  ) : (
    <input
      className={`input ${error ? 'input--err' : ''}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  )

  // A locked field keeps no microphone. Dictating into a box that cannot
  // accept the words is worse than having no mic at all.
  if (rest.disabled) return field
  if (!voice.supported) {
    return speakHint ? (
      <>
        {field}
        <div className="field__hint">{t('voice.keyboardHint')}</div>
      </>
    ) : field
  }

  const problem =
    voice.error === 'denied'
      ? t('voice.denied')
      : voice.error === 'no-speech'
        ? t('voice.noSpeech')
        : voice.error
          ? t('voice.failed')
          : ''

  return (
    <>
      <div className="input-voice">
        {field}
        <button
          type="button"
          className={`mic ${voice.listening ? 'mic--on' : ''}`}
          onClick={voice.toggle}
          aria-pressed={voice.listening}
          aria-label={voice.listening ? t('common.listening') : t('voice.tapToSpeak')}
          title={t('voice.tapToSpeak')}
        >
          {voice.listening ? <IconMicStop aria-hidden="true" /> : <IconMic aria-hidden="true" />}
        </button>
      </div>

      {/* Live text under the field she is speaking into, so it is obvious
          which box the words are going to. */}
      {voice.listening && (
        <div className="field__hint" role="status">
          {voice.interim || t('common.listening')}
        </div>
      )}

      {problem && <div className="field__hint">{problem}</div>}

      {/* Said only while nothing else is: the live transcript and a mic
          problem are both more useful in this spot. */}
      {speakHint && !voice.listening && !problem && (
        <div className="field__hint">{t('voice.speakHint')}</div>
      )}
    </>
  )
}

/**
 * Language, as one row that opens.
 *
 * It used to be every language laid out permanently on the profile screen -
 * two big rows taking a third of the card to express a setting that is changed
 * once, if ever. Now it shows what is CURRENTLY set, and the list only appears
 * when she asks for it.
 *
 * A native <select> on purpose. Android renders it as a full-screen list with
 * system-sized rows, which is a better picker than anything drawn here would
 * be, it is reachable by every assistive technology without extra work, and it
 * costs no state. The only styling is the row it sits in.
 */
export function LanguagePicker() {
  const t = useT()
  const { lang, setLang, langs } = useI18n()

  return (
    <label className="langrow">
      <span className="langrow__l">{t('prof.language')}</span>
      <select
        className="select langrow__s"
        value={lang}
        onChange={(e) => setLang(e.target.value as typeof lang)}
      >
        {langs.map((l) => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
    </label>
  )
}

/** Big tappable option. Native radios have too small a hit area for this audience. */
export function Choice({
  selected, onSelect, title, sub, icon, disabled,
}: {
  selected: boolean
  onSelect: () => void
  title: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={`choice ${selected ? 'choice--on' : ''}`}
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
    >
      <span className="choice__mark" aria-hidden="true">{selected ? <IconCheck /> : null}</span>
      <span className="choice__body">
        {icon && <span aria-hidden="true" style={{ marginRight: 8 }}>{icon}</span>}
        {title}
        {sub && <span className="choice__sub">{sub}</span>}
      </span>
    </button>
  )
}

/** The yes/no pair used for the six digital-readiness questions. */
export function YesNo({
  value, onChange,
}: {
  value: boolean | null
  onChange: (v: boolean) => void
}) {
  const t = useT()
  return (
    <div className="yesno">
      <Choice selected={value === true} onSelect={() => onChange(true)} icon={<IconYes />} title={t('common.yes')} />
      <Choice selected={value === false} onSelect={() => onChange(false)} icon={<IconNo />} title={t('common.no')} />
    </div>
  )
}

export function Stepper({
  value, onChange, min = 1, max = 99,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="−">
        <IconMinus aria-hidden="true" />
      </button>
      <span className="stepper__v">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="+">
        <IconPlus aria-hidden="true" />
      </button>
    </div>
  )
}

/* ================================================================== */
/* Slot meter / dots / OTP / money                                     */
/* ================================================================== */

export function SlotMeter({ used, total, hint }: { used: number; total: number; hint?: ReactNode }) {
  const t = useT()
  const n = Math.max(total, 1)
  return (
    <div className="slotmeter">
      <div className="row-between">
        <strong>{t('biz.myProducts')}</strong>
        <span className="num dim">{used} / {total}</span>
      </div>
      <div className="slotmeter__bars" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className={`slotmeter__bar ${i < used ? 'slotmeter__bar--on' : ''}`} />
        ))}
      </div>
      {hint && <div className="small dim">{hint}</div>}
    </div>
  )
}

export function Dots({ step, total }: { step: number; total: number }) {
  return (
    <div className="dots" role="progressbar" aria-valuenow={step + 1} aria-valuemax={total}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`dots__d ${i === step ? 'dots__d--on' : ''} ${i < step ? 'dots__d--done' : ''}`}
        />
      ))}
    </div>
  )
}

export function OtpInput({
  value, onChange, length = 4,
}: {
  value: string
  onChange: (v: string) => void
  length?: number
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])

  function setAt(i: number, ch: string) {
    const digits = value.padEnd(length, ' ').split('')
    digits[i] = ch
    onChange(digits.join('').replace(/\s/g, ''))
    if (ch && i < length - 1) refs.current[i + 1]?.focus()
  }

  return (
    <div className="otp">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ''}
          onChange={(e) => setAt(i, e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !value[i] && i > 0) refs.current[i - 1]?.focus()
          }}
          aria-label={`OTP digit ${i + 1}`}
        />
      ))}
    </div>
  )
}

export function Rupees({ value, className = '' }: { value: number; className?: string }) {
  return <span className={`num money ${className}`}>₹{Number(value || 0).toLocaleString('en-IN')}</span>
}

/**
 * Confirmation sheet. The body always spells out the consequence -
 * "removing this frees one slot" - never a bare "Are you sure?".
 */
export function ConfirmSheet({
  open, title, body, confirmLabel, tone = 'primary', onConfirm, onCancel,
}: {
  open: boolean
  title: ReactNode
  body?: ReactNode
  confirmLabel?: ReactNode
  tone?: 'primary' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}) {
  const t = useT()
  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="stack">
          <div className="stack-sm">
            <h2 className="h2">{title}</h2>
            {body && <p className="body muted">{body}</p>}
          </div>
          <div className="btn-row">
            <Button variant="quiet" onClick={onCancel}>{t('common.cancel')}</Button>
            <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
              {confirmLabel ?? t('common.confirm')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Load-once helper with a loading flag, so screens stay tidy.
 *
 * `cacheKey` makes the screen come back instantly. With one, the last answer
 * this key received is rendered in the FIRST frame - full height, no spinner -
 * while the fetch goes out to replace it. That is what makes Back look like
 * nothing happened: the scroll can be put back before the browser paints,
 * instead of after a spinner has collapsed the page to one screen. Give it to
 * a screen she returns to; leave it off anything that must never be a moment
 * out of date.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
  cacheKey?: string,
): [T | null, boolean, (d: T) => void] {
  const identity = screenIdentity(deps, cacheKey)
  const [state, setState] = useState<Shown<T>>(() => openScreen<T>(identity, cacheKey))
  // Decided while drawing, not in the effect: an effect runs after the paint,
  // which is one frame of the previous product at this product's address.
  const shown = shownFor(state, identity, cacheKey)

  useEffect(() => {
    let alive = true
    // A different screen starts from its own last answer or a spinner. The
    // same screen - StrictMode's second run in development - keeps what it has.
    setState((s) => shownFor(s, identity, cacheKey))
    /**
     * Loading means "there is nothing to show yet", not "something is in
     * flight".
     *
     * Screens render a spinner INSTEAD of their content while this is true, so
     * flipping it on a refetch replaced a tall list with one short spinner -
     * and the browser, with nowhere left to scroll, clamped her to the top.
     * From the outside that is "the page jumped up when I did something at the
     * bottom". Keeping the old data on screen until the new data lands has no
     * such effect, and is what she expects anyway - for the SAME screen.
     */
    fn()
      .then((data) => {
        if (cacheKey) writeCache(cacheKey, data)
        if (alive) setState({ for: identity, loading: false, data })
      })
      .catch(() => {
        if (cacheKey) dropCache(cacheKey)
        if (alive) setState((s) => ({ ...shownFor(s, identity, cacheKey), loading: false }))
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity])

  return [shown.data, shown.loading, (d: T) => setState({ for: identity, loading: false, data: d })]
}

/**
 * A value she copies rather than retypes - her UPI ID.
 *
 * She reads this one out over the phone and types it into a bank app, and a
 * UPI ID wrong by one character pays a stranger with no way back. The toast is
 * the whole point: the clipboard is invisible, so without it a copy the
 * browser refused looks exactly like one that worked.
 */
export function CopyValue({
  value, onCopied, copiedText,
}: {
  value: string
  onCopied?: () => void
  /** The toast. Defaults to "UPI ID copied", which is what this was built for. */
  copiedText?: string
}) {
  const t = useT()
  const { toast } = useToast()
  if (!value) return null
  return (
    <div className="copyrow">
      <strong className="num" style={{ wordBreak: 'break-all' }}>{value}</strong>
      {/* The icon alone. A button wearing the word "Copy" was three times the
          width of the ID it belonged to, which read as the important thing on
          the screen - and the important thing is the address the money goes
          to. The name lives in aria-label, where it costs no width. */}
      <Button
        className="copybtn"
        variant="quiet"
        size="sm"
        aria-label={t('common.copy')}
        title={t('common.copy')}
        onClick={() => {
          navigator.clipboard
            .writeText(value)
            .then(() => { toast(copiedText ?? t('ok.upiCopied')); onCopied?.() })
            .catch(() => toast(t('err.copyFailed')))
        }}
      >
        <IconCopy aria-hidden="true" />
      </Button>
    </div>
  )
}
