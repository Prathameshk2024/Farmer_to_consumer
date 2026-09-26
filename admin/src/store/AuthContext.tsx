import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'
import {
  api, getToken, onSessionExpired, setToken, TOKEN_KEY, type AdminSession,
} from '../lib/api.js'
import { useToast } from './ToastContext.js'
import { useI18n } from '../i18n/I18nProvider.js'

/**
 * One admin account for now - a single ADMIN_EMAIL and password held in the
 * backend's environment.
 *
 * The limitation, stated so nobody discovers it during an argument: every
 * action is recorded against that one identity, so `verifiedBy` on an approved
 * payment says "admin@shantabazar.in" no matter which member of staff clicked
 * it. The moment two people share the login, "who approved this?" has one
 * answer for everybody. Per-person accounts is a backend change.
 */

const SESSION_KEY = 'wb.admin.session'

interface AuthValue {
  session: AdminSession | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

function storedSession(): AdminSession | null {
  if (!getToken()) return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as AdminSession) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast()
  const { t } = useI18n()
  const [session, setSession] = useState<AdminSession | null>(storedSession)

  // The api client has just been told the token is dead. This is the only
  // place that turns that into "you are signed out" - without it the shell
  // stays on screen re-requesting with no credentials.
  useEffect(() => onSessionExpired(() => setSession(null)), [])

  /**
   * TABS SHARE A DESK, SO THEY SHARE A SESSION.
   *
   * The console is used on shared machines with several tabs open, and every
   * tab holds its own copy of this state. `storage` fires in the OTHER tabs
   * when a key changes, so signing out in one reaches the rest; without it the
   * second tab kept a live admin session - approving payments and reading
   * every buyer's address - after somebody had signed out and walked away.
   *
   * The token is re-derived from what storage now holds rather than trusted
   * from memory, because the api client keeps its own copy.
   */
  useEffect(() => {
    function adopt(e: StorageEvent) {
      // `key === null` is localStorage.clear(). Both of ours matter here.
      if (e.key !== null && e.key !== SESSION_KEY && e.key !== TOKEN_KEY) return
      const next = storedSession()
      setToken(next?.token ?? null)
      setSession((cur) => (JSON.stringify(cur ?? null) === JSON.stringify(next) ? cur : next))
    }
    window.addEventListener('storage', adopt)
    return () => window.removeEventListener('storage', adopt)
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.signIn(email, password)
    // A 200 with no token would sign the seller in with no credentials: the
    // shell renders and every panel on it answers 401. Fail on the sign-in
    // screen, where the message can still be read, rather than one screen
    // later.
    if (!res.session?.token) throw new Error('The server did not return a session token')
    setToken(res.session.token)
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(res.session))
    } catch {
      /* private mode - it just will not survive a refresh */
    }
    setSession(res.session)
    toast(t('ok.signedIn'))
  }, [toast, t])

  const signOut = useCallback(() => {
    // Tell the server first - the request reads the token before it is
    // cleared. Not awaited: she must end up signed out on this desk whether or
    // not the network cooperates, and the session idles out on its own.
    void api.logout().catch(() => {
      /* offline - nothing more this side can do */
    })
    setToken(null)
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      /* nothing to clean up */
    }
    setSession(null)
    toast(t('ok.signedOut'))
  }, [toast, t])

  const value = useMemo(() => ({ session, signIn, signOut }), [session, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
