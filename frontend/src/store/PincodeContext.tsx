import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react'
import { api } from '../lib/api.js'

/**
 * PINCODE + SERVICEABILITY — asked once, reused everywhere.
 *
 * The customer sets her pincode once (on Explore, or wherever she first needs
 * it) and every screen downstream reads it from here:
 *
 *   entry → validate → serviceability → catalog filtering → checkout
 *
 * It is persisted, so she is not asked again on her next visit, and the answer
 * comes from the server's view of which sellers actually cover that pincode -
 * there is no hard-coded list of serviceable areas anywhere in the app.
 */

export interface Serviceability {
  pincode: string
  serviceable: boolean
  sellerCount: number
  productCount: number
  nearbyVillages: string[]
}

interface PincodeValue {
  pincode: string | null
  info: Serviceability | null
  checking: boolean
  error: string | null
  /** Validates and checks with the server. Returns the result. */
  setPincode: (value: string) => Promise<Serviceability | null>
  clear: () => void
}

const PincodeContext = createContext<PincodeValue | null>(null)
const KEY = 'smb.pincode'

export function PincodeProvider({ children }: { children: ReactNode }) {
  const [pincode, setPin] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEY)
    } catch {
      return null
    }
  })
  const [info, setInfo] = useState<Serviceability | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async (value: string): Promise<Serviceability | null> => {
    const clean = value.replace(/\D/g, '')
    setChecking(true)
    setError(null)
    try {
      const res = await api.serviceability(clean)
      setInfo(res)
      setPin(res.pincode)
      try {
        localStorage.setItem(KEY, res.pincode)
      } catch {
        /* private mode - she will be asked again next visit */
      }
      return res
    } catch {
      setError('invalid')
      return null
    } finally {
      setChecking(false)
    }
  }, [])

  // Re-check the stored pincode on load: sellers open, close and change their
  // delivery areas, so a saved "serviceable" is not permanently true.
  useEffect(() => {
    if (!pincode || info) return
    void check(pincode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pincode])

  const clear = useCallback(() => {
    setPin(null)
    setInfo(null)
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo(
    () => ({ pincode, info, checking, error, setPincode: check, clear }),
    [pincode, info, checking, error, check, clear],
  )
  return <PincodeContext.Provider value={value}>{children}</PincodeContext.Provider>
}

export function usePincode(): PincodeValue {
  const ctx = useContext(PincodeContext)
  if (!ctx) throw new Error('usePincode must be used inside <PincodeProvider>')
  return ctx
}
