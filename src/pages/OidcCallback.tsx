import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

type Status = 'processing' | 'error'

// Rendering context — determined once at module load time.
//   popup  — opened via window.open() by the login page
//   iframe — embedded inside the login page (only if IDSP allows framing)
//   direct — full-page redirect (popup blocked fallback)
const inPopup  = !!(window.opener && !window.opener.closed)
const inIframe = !inPopup && window.parent !== window

export default function OidcCallback() {
  const [searchParams]      = useSearchParams()
  const [status, setStatus] = useState<Status>('processing')
  const [errorMsg, setErrorMsg] = useState('')
  const { oidcLogin } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const code      = searchParams.get('code')
    const state     = searchParams.get('state')
    const error     = searchParams.get('error')
    const errorDesc = searchParams.get('error_description')

    function signalParent(type: 'oidc-success' | 'oidc-error', payload: Record<string, string>) {
      const msg = { type, ...payload }
      if (inPopup) {
        window.opener.postMessage(msg, window.location.origin)
        window.close()
      } else {
        // iframe
        window.parent.postMessage(msg, window.location.origin)
      }
    }

    if (error) {
      const msg = `IDSP error: ${error}${errorDesc ? ` — ${errorDesc}` : ''}`
      if (inPopup || inIframe) {
        signalParent('oidc-error', { message: msg })
      } else {
        setErrorMsg(msg)
        setStatus('error')
      }
      return
    }

    if (!code || !state) {
      const msg = 'Missing code or state in callback URL. The OIDC flow may have been interrupted.'
      if (inPopup || inIframe) {
        signalParent('oidc-error', { message: msg })
      } else {
        setErrorMsg(msg)
        setStatus('error')
      }
      return
    }

    // Exchange the authorization code for tokens via the BFF backend.
    // The server looks up the pending flow by the `state` value in
    // oidcPendingStore, so this works from any rendering context without
    // relying on session-cookie visibility.
    fetch('/api/auth/token-exchange', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code, state }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          if (inPopup || inIframe) {
            signalParent('oidc-success', { username: d.username || '', email: d.email || '' })
          } else {
            oidcLogin(d.username, d.email || '')
            navigate('/dashboard', { replace: true })
          }
        } else {
          const msg = d.error || 'Token exchange failed.'
          if (inPopup || inIframe) {
            signalParent('oidc-error', { message: msg })
          } else {
            setErrorMsg(msg)
            setStatus('error')
          }
        }
      })
      .catch(e => {
        const msg = `Network error during token exchange: ${String(e)}`
        if (inPopup || inIframe) {
          signalParent('oidc-error', { message: msg })
        } else {
          setErrorMsg(msg)
          setStatus('error')
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Popup / iframe: minimal spinner — parent handles navigation ───────────
  if (inPopup || inIframe) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--color-content-bg)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: '40px', height: '40px',
          border: '3px solid #E5E7EB', borderTopColor: '#CC0000',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
          marginBottom: '14px',
        }} />
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
          Completing sign-in…
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          Exchanging authorization code with IDSP
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── Direct full-page redirect: full card UI ───────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-content-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '420px', textAlign: 'center' }}>

        {status === 'processing' && (
          <>
            <div style={{
              width: '48px', height: '48px', margin: '0 auto 20px',
              border: '3px solid #E5E7EB', borderTopColor: '#CC0000',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            }} />
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              Completing sign-in…
            </div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              Exchanging authorization code with IDSP
            </div>
          </>
        )}

        {status === 'error' && (
          <div style={{
            background: 'var(--color-card-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: '10px',
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          }}>
            <div style={{ background: '#CC0000', padding: '16px 24px' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>Authentication Failed</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>
                OIDC / IDSP login could not complete
              </div>
            </div>
            <div style={{ padding: '24px' }}>
              <div style={{
                padding: '12px 14px', borderRadius: '6px',
                background: '#FEF2F2', border: '1px solid #FECACA',
                color: '#7F1D1D', fontSize: '13px', lineHeight: '1.6',
                marginBottom: '20px', textAlign: 'left',
              }}>
                {errorMsg}
              </div>
              <button
                onClick={() => navigate('/login', { replace: true })}
                style={{
                  width: '100%', padding: '10px', borderRadius: '7px',
                  cursor: 'pointer', fontSize: '14px', fontWeight: 700,
                  background: '#CC0000', border: 'none', color: '#fff',
                }}
              >
                Back to Login
              </button>
            </div>
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}
