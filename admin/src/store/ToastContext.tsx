import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import { IconAllClear, IconWarn } from '../components/icons.js'

/**
 * CONFIRMATION, EVERY TIME
 * ========================
 * The same rule as the seller app, and it matters more here: approving a ₹50
 * payment releases a woman's account, and rejecting one does not. Both used to
 * end with a row quietly leaving a list, which on a slow connection is
 * indistinguishable from nothing having happened - and the natural response to
 * that is to click again.
 *
 * A context rather than local state because the confirmation usually outlives
 * the row that earned it: the list reloads and the row is gone by the time the
 * message would render.
 */

export type ToastTone = 'ok' | 'warn' | 'danger'

interface Toast {
  id: number
  text: string
  tone: ToastTone
  /** Optional: a queue alert an admin should be able to act on. */
  action?: { label: string; onClick: () => void }
}

interface ToastValue {
  toast: (text: string, tone?: ToastTone, action?: Toast['action']) => void
}

const ToastContext = createContext<ToastValue | null>(null)

/** Longer than the phone app's: a desk user is often looking elsewhere. */
const DWELL_MS = 6000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const nextId = useRef(1)

  const toast = useCallback(
    (text: string, tone: ToastTone = 'ok', action?: Toast['action']) => {
      const id = nextId.current++
      setItems((cur) => [{ id, text, tone, action }, ...cur].slice(0, 4))
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== id)), DWELL_MS)
    },
    [],
  )

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((x) => (
          <div key={x.id} className={`toast toast--${x.tone}`}>
            <span className="toast__i" aria-hidden="true">
              {x.tone === 'ok' ? <IconAllClear /> : <IconWarn />}
            </span>
            <span className="grow">{x.text}</span>
            {x.action && (
              <button
                type="button"
                className="toast__go"
                onClick={() => {
                  setItems((cur) => cur.filter((y) => y.id !== x.id))
                  x.action!.onClick()
                }}
              >
                {x.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** Never throws without a provider - a missing toast must not break an action. */
export function useToast(): ToastValue {
  return useContext(ToastContext) ?? { toast: () => {} }
}
