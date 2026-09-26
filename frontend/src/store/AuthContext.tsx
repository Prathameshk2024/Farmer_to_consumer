import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react'
import type { Session } from '@shared/types.js'
import { api, onMustChangePassword, onSessionExpired, onTokenRefresh, setToken } from '../lib/api.js'
import { clearScreenCache } from '../lib/screenCache.js'
import { useToast } from './ToastContext.js'
import { useI18n } from '../i18n/I18nProvider.js'

/**
 * Session state. One phone number can be both a farmer and a customer, so the
 * account carries a role rather than being two separate accounts - that avoids
 * asking the same person for their details twice.
 *
 * The password is checked on the SERVER. This context only stores what came back.
 *
 * WHAT ENDS A SESSION
 * ===================
 * Exactly two things:
 *
 *   1. they press Log out;
 *   2. the server answers 401, meaning the token it issued is no longer valid.
 *
 * Nothing else. Not a back press, not a reload, not opening /farmer a second
 * time. That list used to be longer by accident: the refreshed token the
 * server hands back mid-session was written to the api client's copy only, so
 * the next reload restored the ORIGINAL token from here and threw the slide
 * away. `onTokenRefresh` closes that gap - a re-stamped token is written back
 * into the stored session, which is what makes the fifteen-day window an
 * inactivity window rather than a countdown from login.
 */

interface AuthValue {
  session: Session | null
  signIn: (s: Session) => void
  signOut: () => void
  patchSession: (p: Partial<Session>) => void
}

const AuthContext = createContext<AuthValue | null>(null)
const KEY = 'wb.session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast()
  const { t } = useI18n()

  const [session, setSession] = useState<Session | null>(() => {
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? (JSON.parse(raw) as Session) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    try {
      if (session) {
        localStorage.setItem(KEY, JSON.stringify(session))
        setToken(session.token)
      } else {
        localStorage.removeItem(KEY)
        setToken(null)
        // The screens' last answers go with them. On a field coordinator's
        // phone, where one handset signs in as farmer after farmer, a kept
        // "my products" is the previous farmer's shop.
        clearScreenCache()
      }
    } catch {
      /* ignore */
    }
  }, [session])

  const signIn = useCallback((s: Session) => setSession(s), [])

  /**
   * Tell the SERVER, then forget locally.
   *
   * Clearing localStorage alone left the token valid for the rest of its
   * window, so signing out on a borrowed phone did not sign them out of
   * anything. The local state is cleared either way and without waiting: if
   * the network is down they must still end up signed out on this device, and
   * the session will idle out on its own.
   */
  const signOut = useCallback(() => {
    void api.logout().catch(() => {
      /* offline - the session expires on its own, and they are out locally */
    })
    setSession(null)
    toast(t('ok.loggedOut'))
  }, [toast, t])
  const patchSession = useCallback(
    (p: Partial<Session>) => setSession((s) => (s ? { ...s, ...p } : s)),
    [],
  )

  /**
   * TABS SHARE A BROWSER, SO THEY SHARE A SESSION.
   *
   * Two tabs each hold their own copy of this state, and `storage` is the only
   * event that crosses between them - it fires in every OTHER tab of this
   * origin when the key changes. Without it, logging out in one tab left the
   * second signed in and working: its React state was untouched, and the next
   * time anything re-rendered, the effect above wrote the deleted key back.
   * A refresh then found the resurrected key and the tab carried on, which is
   * exactly what "log out" must never mean on a shared or borrowed phone.
   *
   * Adopting whatever storage now says also carries a sign-in the other way,
   * and a re-stamped token, so the tabs cannot drift apart.
   */
  useEffect(() => {
    function adopt(e: StorageEvent) {
      // `key === null` is localStorage.clear(); anything else is not ours.
      if (e.key !== null && e.key !== KEY) return
      let next: Session | null = null
      try {
        const raw = localStorage.getItem(KEY)
        next = raw ? (JSON.parse(raw) as Session) : null
      } catch {
        next = null
      }
      // Only on a real change. Setting a fresh object every time would have
      // the effect above rewrite the key, which fires this in the other tab,
      // which rewrites it back - forever.
      setSession((cur) => (JSON.stringify(cur ?? null) === JSON.stringify(next) ? cur : next))
    }
    window.addEventListener('storage', adopt)
    return () => window.removeEventListener('storage', adopt)
  }, [])

  // Subscribed once, for the life of the app, so a refresh that arrives while
  // they are on any screen is kept.
  useEffect(() => {
    const stopRefresh = onTokenRefresh((token) => {
      setSession((s) => (s && s.token !== token ? { ...s, token } : s))
    })
    const stopExpiry = onSessionExpired(() => setSession(null))
    // The router sends a session marked like this to /password and nowhere else.
    const stopMustChange = onMustChangePassword(() => {
      setSession((s) => (s && !s.mustChangePassword ? { ...s, mustChangePassword: true } : s))
    })
    return () => {
      stopRefresh()
      stopExpiry()
      stopMustChange()
    }
  }, [])

  const value = useMemo(
    () => ({ session, signIn, signOut, patchSession }),
    [session, signIn, signOut, patchSession],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Where a signed-in session belongs. One definition, used by every guard. */
export function homeFor(role: Session['role']): string {
  return role === 'farmer' ? '/farmer' : role === 'customer' ? '/shop' : '/'
}
