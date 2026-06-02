import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthState {
  isAuthenticated: boolean
  username:        string
  email:           string
  gateway:         string
  loginType:       'gateway' | 'idsp' | null
  loginTime:       string | null
  authToken:       string | null  // Base64 Basic-auth token for gateway logoff
}

interface AuthContextType extends AuthState {
  login:     (username: string, gateway: string, type: 'gateway' | 'idsp', authToken?: string) => void
  oidcLogin: (username: string, email: string) => void
  logout:    () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY         = 'gwauth_v1'
const OIDC_POLL_INTERVAL  = 60_000   // 60 s — checks session validity with server

const defaultState: AuthState = {
  isAuthenticated: false,
  username:        '',
  email:           '',
  gateway:         '',
  loginType:       null,
  loginTime:       null,
  authToken:       null,
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) return JSON.parse(saved) as AuthState
    } catch { /* ignore */ }
    return defaultState
  })

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Persist gateway sessions to localStorage ──────────────────────────────
  useEffect(() => {
    if (auth.isAuthenticated && auth.loginType === 'gateway') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(auth))
    } else {
      // OIDC sessions are cookie-based (BFF); never persist token info in localStorage
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [auth])

  // ── OIDC session polling ──────────────────────────────────────────────────
  // Polls /api/auth/session every 60 s while logged in via IDSP.
  // If the server says session is invalid (token expired / introspection failed),
  // auto-logout is triggered immediately.
  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch('/api/auth/session')
        const d = await r.json()
        if (!d.valid) {
          // Session invalidated by server (token expired or introspection failed)
          setAuth(defaultState)
          stopPolling()
        }
      } catch {
        // Network error — keep session alive (don't log out on transient failures)
      }
    }, OIDC_POLL_INTERVAL)
  }, [stopPolling])

  useEffect(() => {
    if (auth.isAuthenticated && auth.loginType === 'idsp') {
      startPolling()
    } else {
      stopPolling()
    }
    return stopPolling
  }, [auth.isAuthenticated, auth.loginType, startPolling, stopPolling])

  // ── Actions ───────────────────────────────────────────────────────────────

  function login(username: string, gateway: string, type: 'gateway' | 'idsp', authToken?: string) {
    setAuth({
      isAuthenticated: true,
      username,
      email:     '',
      gateway,
      loginType: type,
      loginTime: new Date().toISOString(),
      authToken: authToken ?? null,
    })
  }

  // Called by OidcCallback after successful BFF token exchange
  function oidcLogin(username: string, email: string) {
    setAuth({
      isAuthenticated: true,
      username,
      email,
      gateway:   'IDSP',
      loginType: 'idsp',
      loginTime: new Date().toISOString(),
      authToken: null,  // tokens are held server-side only
    })
  }

  async function logout() {
    if (auth.loginType === 'idsp') {
      try {
        const r = await fetch('/api/auth/logout', { method: 'POST' })
        const d = await r.json()
        // Redirect browser to IDSP end-session endpoint if provided
        if (d.endSessionUrl) {
          setAuth(defaultState)
          stopPolling()
          window.location.href = d.endSessionUrl
          return
        }
      } catch { /* proceed with local logout */ }
    } else if (auth.authToken) {
      // Gateway logoff
      try {
        await fetch('/api/gateway-logoff', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ authToken: auth.authToken }),
        })
      } catch { /* ignore network errors */ }
    }
    setAuth(defaultState)
    stopPolling()
  }

  return (
    <AuthContext.Provider value={{ ...auth, login, oidcLogin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
