import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function GatewayLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [oidcLoading, setOidcLoading] = useState(false)
  const [error, setError]       = useState('')
  const [oidcConfigured, setOidcConfigured] = useState(false)
  // When true, the "waiting for popup" overlay is shown
  const [oidcWaiting, setOidcWaiting] = useState(false)

  const { login, oidcLogin } = useAuth()
  const navigate  = useNavigate()

  // Tear down message listener if the component unmounts mid-flow
  const oidcCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => { oidcCleanupRef.current?.() }, [])

  // Check if OIDC is configured so we can show/hide the IDSP button
  useEffect(() => {
    fetch('/api/auth/config')
      .then(r => r.json())
      .then(d => {
        const o = d.oidc || {}
        setOidcConfigured(!!(o.discoveryUrl && o.clientId && o.redirectUri))
      })
      .catch(() => {})
  }, [])

  function handleReset() {
    setUsername('')
    setPassword('')
    setError('')
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Please enter both username and password.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const resp = await fetch('/api/gateway-login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: username.trim(), password }),
      })
      const data = await resp.json()
      if (data.success) {
        const authToken = btoa(`${username.trim()}:${password}`)
        login(data.username ?? username.trim(), data.gateway ?? 'gateway', 'gateway', authToken)
        navigate('/dashboard', { replace: true })
      } else {
        setError(data.error ?? 'Login failed. Check your credentials and gateway URL.')
      }
    } catch (err) {
      setError(`Network error: ${String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  function cancelOidcWaiting() {
    oidcCleanupRef.current?.()
    setOidcWaiting(false)
    setOidcLoading(false)
  }

  async function handleIdspLogin() {
    setOidcLoading(true)
    setError('')
    try {
      const r = await fetch('/api/auth/oidc-init')
      const d = await r.json()
      if (!d.success || !d.authUrl) {
        setError(d.error || 'Failed to initiate IDSP login. Check Auth Setup configuration.')
        setOidcLoading(false)
        return
      }

      // Open the OIDC flow in a small popup (IDPs block iframe embedding).
      // Show a waiting overlay on this page so the user never navigates away.
      const pw = 520, ph = 660
      const pl = Math.round(window.screenX + (window.outerWidth  - pw) / 2)
      const pt = Math.round(window.screenY + (window.outerHeight - ph) / 2)
      const popup = window.open(
        d.authUrl,
        'idsp_login',
        `width=${pw},height=${ph},left=${pl},top=${pt},resizable=yes,scrollbars=yes`
      )

      if (!popup) {
        // Popup blocked — fall back to full-page redirect
        window.location.href = d.authUrl
        return
      }

      // Show "waiting for popup to complete" overlay on this page
      setOidcWaiting(true)

      function onMessage(evt: MessageEvent) {
        if (evt.origin !== window.location.origin) return
        if (evt.data?.type === 'oidc-success') {
          cleanup()
          setOidcWaiting(false)
          oidcLogin(evt.data.username as string, (evt.data.email as string) || '')
          navigate('/dashboard', { replace: true })
        } else if (evt.data?.type === 'oidc-error') {
          cleanup()
          setOidcWaiting(false)
          setError((evt.data.message as string) || 'IDSP login failed.')
          setOidcLoading(false)
        }
      }

      // Detect user closing the popup without finishing
      const pollId = setInterval(() => {
        if (popup.closed) { cleanup(); setOidcWaiting(false); setOidcLoading(false) }
      }, 600)

      function cleanup() {
        clearInterval(pollId)
        window.removeEventListener('message', onMessage)
        oidcCleanupRef.current = null
      }

      oidcCleanupRef.current = cleanup
      window.addEventListener('message', onMessage)

    } catch (e) {
      setError(`Network error: ${String(e)}`)
      setOidcLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-content-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '14px' }}>
            <img src="/L7White.png" alt="Layer7" style={{ height: '48px' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '0.2px' }}>Layer7 API Gateway</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Gateway Utility Console</div>
            </div>
          </div>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
          {/* Card header */}
          <div style={{ background: 'var(--color-accent-red)', padding: '16px 24px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>Gateway Login</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>
              Sign in with your gateway credentials
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} style={{ padding: '28px 24px 20px' }}>
            <div style={{ marginBottom: '18px' }}>
              <label style={labelSt}>Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                placeholder="Enter your username"
                style={inputSt}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={labelSt}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Enter your password"
                style={inputSt}
              />
            </div>

            {error && (
              <div style={{ marginBottom: '20px', padding: '10px 14px', borderRadius: '6px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '13px', lineHeight: '1.5' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={handleReset}
                disabled={loading}
                style={{ flex: 1, padding: '10px', borderRadius: '7px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{ flex: 2, padding: '10px', borderRadius: '7px', cursor: loading ? 'wait' : 'pointer', fontSize: '14px', fontWeight: 700, background: loading ? 'rgba(204,0,0,0.5)' : 'var(--color-accent-red)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {loading
                  ? <><Spinner />Signing in…</>
                  : 'Login →'}
              </button>
            </div>
          </form>

          {/* IDSP / OIDC divider + button */}
          {oidcConfigured && (
            <div style={{ padding: '0 24px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0 16px' }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>or continue with</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
              </div>
              <button
                onClick={handleIdspLogin}
                disabled={oidcLoading}
                style={{
                  width: '100%', padding: '10px', borderRadius: '7px',
                  cursor: oidcLoading ? 'wait' : 'pointer',
                  fontSize: '14px', fontWeight: 700,
                  background: oidcLoading ? '#F3F4F6' : '#1C2B3A',
                  border: '1px solid var(--color-border)',
                  color: oidcLoading ? 'var(--color-text-secondary)' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}
              >
                {oidcLoading
                  ? <><Spinner dark />Redirecting to IDSP…</>
                  : <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      Login with IDSP
                    </>
                }
              </button>
            </div>
          )}
        </div>

        {/* Footer links */}
        <div style={{ textAlign: 'center', marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '18px' }}>
          <button onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '13px' }}>
            ← Back
          </button>
          <span style={{ color: 'var(--color-text-secondary)', opacity: 0.4, fontSize: '13px' }}>|</span>
          <button onClick={() => navigate('/auth-setup')}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Auth Setup
          </button>
        </div>
      </div>

      {/* ── IDSP waiting overlay — shown while the OIDC popup is open ─────────── */}
      {oidcWaiting && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.72)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px',
        }}>
          <div style={{
            width: 'min(400px, 100%)',
            background: 'var(--color-card-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 32px 80px rgba(0,0,0,0.55)',
            textAlign: 'center',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 16px',
              background: '#1C2B3A',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>Sign in with IDSP</span>
              </div>
              <button
                onClick={cancelOidcWaiting}
                title="Cancel sign-in"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '5px', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '36px 28px 32px' }}>
              {/* Spinner */}
              <div style={{
                width: '52px', height: '52px', margin: '0 auto 22px',
                border: '3px solid rgba(255,255,255,0.1)',
                borderTopColor: '#1C2B3A',
                borderRadius: '50%', animation: 'spin 0.9s linear infinite',
              }} />
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '10px' }}>
                Complete sign-in in the IDSP window
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: '24px' }}>
                A sign-in window has opened. Please authenticate with your IDSP credentials there.
                This page will update automatically once you're signed in.
              </div>
              <button
                onClick={cancelOidcWaiting}
                style={{
                  padding: '8px 22px', borderRadius: '7px', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 600,
                  background: 'transparent', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Spinner helper ───────────────────────────────────────────────────────────
function Spinner({ dark }: { dark?: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: '14px', height: '14px',
      border: `2px solid ${dark ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.4)'}`,
      borderTopColor: dark ? '#CC0000' : '#fff',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite',
    }} />
  )
}

const labelSt: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.5px', color: 'var(--color-text-secondary)', marginBottom: '6px',
}
const inputSt: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box',
  background: 'var(--color-input-bg)', border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)', outline: 'none',
}
