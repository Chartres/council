import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { isAuthConfigured, supabase } from './supabase'
import { identify, track } from '@/analytics'

export interface AuthUser {
  id: string
  email?: string
}

interface AuthContextValue {
  configured: boolean
  loading: boolean
  user: AuthUser | null
  /** Supabase access token for the gateway's `Authorization: Bearer`. */
  token: string | null
  signInWithEmail: (email: string) => Promise<{ ok: boolean; error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** The sign-up funnel's last step: a person arriving signed in after asking for a link or code in
 *  this browser (SignInPanel sets the flag). supabase-js also emits SIGNED_IN for sessions that
 *  already existed (tab refocus, a second tab), and those are not sign-ups. */
export const SIGNUP_FLAG = 'council:signup-started'

function completed(userId: string) {
  const key = `council:signed-in:${userId}`
  try {
    if (!localStorage.getItem(SIGNUP_FLAG) || localStorage.getItem(key)) return
    localStorage.removeItem(SIGNUP_FLAG)
    localStorage.setItem(key, '1')
  } catch {
    return // no storage, no way to tell a sign-up from a restored session
  }
  track('signup_completed', { method: 'email' })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(isAuthConfigured)

  useEffect(() => {
    if (!supabase) return
    const apply = (session: { access_token?: string; user?: { id: string; email?: string } } | null) => {
      const u = session?.user
      setUser(u ? { id: u.id, email: u.email ?? undefined } : null)
      setToken(session?.access_token ?? null)
      identify(u?.id ?? null) // cross-product identity on the shared platform
    }
    supabase.auth.getSession().then(({ data }) => {
      apply(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      apply(session)
      if (event === 'SIGNED_IN' && session?.user) completed(session.user.id)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value: AuthContextValue = {
    configured: isAuthConfigured,
    loading,
    user,
    token,
    async signInWithEmail(email: string) {
      if (!supabase) return { ok: false, error: 'Sign-in is not configured in this build.' }
      // auth-identity.md rule 4: always name our own origin, never trust Site URL.
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      })
      return error ? { ok: false, error: error.message } : { ok: true }
    },
    async signOut() {
      await supabase?.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
