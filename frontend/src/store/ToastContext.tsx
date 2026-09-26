import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import { IconAllClear, IconClose, IconWarn } from '../components/icons.js'

/**
 * CONFIRMATION, EVERY TIME
 * ========================
 * Nothing in this app used to say it had worked. An order was accepted and the
 * button simply stopped being there; a product was published and the screen
 * changed; a profile was saved and nothing at all happened. On a fast laptop
 * that reads as "instant". On a cheap phone on a village connection it reads
 * as "did that go through?", and the answer people reach for is to press the
 * button again - which is how an order gets accepted twice and how a woman
 * stops trusting the app.
 *
 * So every completed action ends with a line on the screen that names what
 * happened. Not a spinner, not a colour change: a sentence.
 *
 * WHY THIS IS A CONTEXT AND NOT A COMPONENT PER SCREEN
 * The confirmation usually has to outlive the screen that earned it. Publishing
 * a product navigates away from the wizard; logging out unmounts everything.
 * A toast owned by the screen would be destroyed in the same tick it was
 * created, which is exactly the case that matters most.
 */

export type ToastTone = 'ok' | 'warn' | 'danger'

interface Toast {
  id: number
  text: string
  tone: ToastTone
}

interface ToastValue {
  /** Say what just happened. Past tense, in her language, from the dictionary. */
  toast: (text: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastValue | null>(null)

/**
 * Four seconds.
 *
 * Long enough to read a short Marathi sentence without hurrying, short enough
 * that it is gone before she needs the space. Anything she must act on is a
 * Notice on the screen itself, not a message that removes itself.
 */
const DWELL_MS = 4000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const nextId = useRef(1)

  const toast = useCallback((text: string, tone: ToastTone = 'ok') => {
    const id = nextId.current++
    // Newest on top, and never more than three: a stack that grows past the
    // screen hides the newest message behind the oldest.
    setItems((cur) => [{ id, text, tone }, ...cur].slice(0, 3))
    setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== id)), DWELL_MS)
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* aria-live, so the confirmation reaches a screen reader too - this is
          the one place the app says "that worked", and it must not be visual
          only. */}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((x) => (
          <div key={x.id} className={`toast toast--${x.tone}`}>
            <span className="toast__i" aria-hidden="true">
              {x.tone === 'ok' ? <IconAllClear /> : <IconWarn />}
            </span>
            <span className="grow">{x.text}</span>
            <button
              type="button"
              className="toast__x"
              aria-label="OK"
              onClick={() => setItems((cur) => cur.filter((y) => y.id !== x.id))}
            >
              <IconClose aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/**
 * Never throws when there is no provider.
 *
 * A missing confirmation must not be able to white-screen a working action -
 * the toast is the least important thing on any screen it appears on.
 */
export function useToast(): ToastValue {
  return useContext(ToastContext) ?? { toast: () => {} }
}

/** Fire once, on mount. For "you are signed in" the moment a screen appears. */
export function useToastOnce(text: string | null, tone: ToastTone = 'ok'): void {
  const { toast } = useToast()
  const fired = useRef(false)
  useEffect(() => {
    if (!text || fired.current) return
    fired.current = true
    toast(text, tone)
  }, [text, tone, toast])
}
