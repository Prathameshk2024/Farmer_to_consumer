import { useCallback, useEffect, useRef } from 'react'

/**
 * TELL THE SCREEN WHEN THEY COME BACK FROM THEIR UPI APP.
 *
 * The 12-digit reference is the only thing tying a payment to an order, and
 * the tap after paying is Back. So the payment screens arm this when they save
 * the QR or copy the UPI ID - the two things they do right before leaving -
 * and put the reference box in front of them when they return.
 *
 * Fires only on hidden-then-visible, never on `focus` alone: a download bar or
 * a toast can move focus without them ever leaving, and "did the payment go
 * through?" asked two seconds after they saved a picture reads as a bug. Once
 * per arming, for the same reason.
 */
export function useReturnFromApp(onReturn: () => void): () => void {
  const armed = useRef(false)
  const away = useRef(false)
  const latest = useRef(onReturn)

  useEffect(() => {
    latest.current = onReturn
  }, [onReturn])

  useEffect(() => {
    function change() {
      if (!armed.current) return
      if (document.visibilityState === 'hidden') {
        away.current = true
        return
      }
      if (!away.current) return
      armed.current = false
      away.current = false
      latest.current()
    }
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])

  return useCallback(() => {
    armed.current = true
    away.current = false
  }, [])
}
