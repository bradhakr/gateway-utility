import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// ─── Dropdown hook ────────────────────────────────────────────────────────────

function useDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  return { open, setOpen, ref, toggle: () => setOpen(p => !p) }
}

// ─── Tool list for the post-login Tools dropdown ──────────────────────────────

const TOOL_LINKS = [
  { path: '/find-assertions',        label: 'Find Assertions',    icon: '🔍' },
  { path: '/check-compliance',       label: 'Check Compliance',   icon: '🛡' },
  { path: '/certificate-management', label: 'Keys & Certificates',icon: '🔐' },
  { path: '/entity-updates',         label: 'Entity Inspector',   icon: '🗄' },
  { path: '/entity-forge',           label: 'Entity Forge',       icon: '⚒'  },
  { path: '/entity-browser',         label: 'Entity Browser',     icon: '🔎' },
  { path: '/new-entity',             label: 'Bundle Import',      icon: '📦' },
]

// ─── Shared drop-down menu wrapper ───────────────────────────────────────────

function DropdownMenu({ children, open }: { children: React.ReactNode; open: boolean }) {
  if (!open) return null
  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 6px)', right: 0,
      background: '#1e2533', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '8px', minWidth: '200px', overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 200,
    }}>
      {children}
    </div>
  )
}

function MenuItem({ label, onClick, icon, danger }: { label: string; onClick: () => void; icon?: string; danger?: boolean }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
        padding: '10px 16px', background: hovered ? 'rgba(255,255,255,0.07)' : 'transparent',
        border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '13px', fontWeight: 500,
        color: danger ? '#fca5a5' : 'rgba(255,255,255,0.85)',
      }}
    >
      {icon && <span style={{ fontSize: '14px', opacity: 0.8 }}>{icon}</span>}
      {label}
    </button>
  )
}

function MenuDivider() {
  return <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '4px 0' }} />
}

// ─── Header ──────────────────────────────────────────────────────────────────

export default function Header() {
  const { isAuthenticated, username, loginType, logout } = useAuth()
  const navigate   = useNavigate()
  const loginDrop  = useDropdown()
  const toolsDrop  = useDropdown()
  const configDrop = useDropdown()

  async function handleLogout() {
    // For OIDC, logout() will call /api/auth/logout which returns endSessionUrl;
    // AuthContext will redirect the browser there if provided.
    await logout()
    // Only navigate locally if we're still here (OIDC may have already redirected)
    navigate('/', { replace: true })
  }

  return (
    <header style={{
      background: 'var(--color-header-bg)',
      color: 'var(--color-header-text)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', height: '56px',
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      borderBottom: '2px solid var(--color-accent-red)',
    }}>
      {/* Left: logo + title + Home (post-login) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <img src="/L7.png" alt="Layer7" style={{ height: '36px', width: 'auto' }}
          onError={e => {
            const img = e.target as HTMLImageElement
            img.style.display = 'none'
            const sib = img.nextElementSibling as HTMLElement | null
            if (sib) sib.style.display = 'flex'
          }}
        />
        <span style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '6px', background: 'var(--color-accent-red)', color: '#fff', fontWeight: 800, fontSize: '14px', flexShrink: 0 }}>L7</span>

        <div style={{ borderLeft: '1px solid rgba(255,255,255,0.22)', paddingLeft: '14px', cursor: isAuthenticated ? 'pointer' : 'default' }}
             onClick={() => isAuthenticated && navigate('/dashboard')}>
          <div style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '0.2px', lineHeight: '1.2' }}>Layer7 API Gateway</div>
          <div style={{ fontSize: '11px', opacity: 0.6, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Gateway Utility Console</div>
        </div>

        {isAuthenticated && (
          <button onClick={() => navigate('/dashboard')}
            style={{ marginLeft: '10px', padding: '6px 13px', borderRadius: '7px', cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            Home
          </button>
        )}
      </div>

      {/* Right: auth-dependent menus */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>

        {/* ── Pre-login: Login dropdown ── */}
        {!isAuthenticated && (
          <>
            {/* Auth Setup — always accessible pre-login so misconfigs can be fixed */}
            <button
              onClick={() => navigate('/auth-setup')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 13px', borderRadius: '7px', cursor: 'pointer',
                background: 'transparent', border: '1px solid rgba(255,255,255,0.2)',
                color: 'rgba(255,255,255,0.75)', fontSize: '13px', fontWeight: 600,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Auth Config
            </button>

            {/* Login dropdown */}
            <div ref={loginDrop.ref} style={{ position: 'relative' }}>
              <button onClick={loginDrop.toggle}
                style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 14px', borderRadius: '7px', cursor: 'pointer', background: loginDrop.open ? 'rgba(204,0,0,0.3)' : 'var(--color-accent-red)', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 700 }}>
                Login
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: loginDrop.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <DropdownMenu open={loginDrop.open}>
                <div style={{ padding: '8px 16px 6px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.35)' }}>Select Login Type</div>
                <MenuDivider />
                <MenuItem icon="🔗" label="Gateway" onClick={() => { loginDrop.setOpen(false); navigate('/login') }} />
                <MenuItem icon="🪪" label="IDSP"    onClick={() => { loginDrop.setOpen(false); navigate('/login-idsp') }} />
              </DropdownMenu>
            </div>
          </>
        )}

        {/* ── Post-login menus ── */}
        {isAuthenticated && (
          <>
            {/* Tools dropdown */}
            <div ref={toolsDrop.ref} style={{ position: 'relative' }}>
              <button onClick={toolsDrop.toggle}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 13px', borderRadius: '7px', cursor: 'pointer', background: toolsDrop.open ? 'rgba(255,255,255,0.1)' : 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)', fontSize: '13px', fontWeight: 600 }}>
                Tools
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: toolsDrop.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <DropdownMenu open={toolsDrop.open}>
                <div style={{ padding: '8px 16px 6px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.35)' }}>Available Tools</div>
                <MenuDivider />
                {TOOL_LINKS.map(t => (
                  <MenuItem key={t.path} icon={t.icon} label={t.label} onClick={() => { toolsDrop.setOpen(false); navigate(t.path) }} />
                ))}
              </DropdownMenu>
            </div>

            {/* Configuration dropdown */}
            <div ref={configDrop.ref} style={{ position: 'relative' }}>
              <button onClick={configDrop.toggle}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 13px', borderRadius: '7px', cursor: 'pointer', background: configDrop.open ? 'rgba(255,255,255,0.1)' : 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)', fontSize: '13px', fontWeight: 600 }}>
                Configuration
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: configDrop.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              <DropdownMenu open={configDrop.open}>
                <div style={{ padding: '8px 16px 6px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.35)' }}>Configuration</div>
                <MenuDivider />
                <MenuItem icon="⚙" label="App Config"      onClick={() => { configDrop.setOpen(false); navigate('/configuration') }} />
                <MenuItem icon="🔗" label="Graphman Config" onClick={() => { configDrop.setOpen(false); navigate('/graphman-config') }} />
                <MenuItem icon="🔒" label="Auth Config"      onClick={() => { configDrop.setOpen(false); navigate('/auth-setup') }} />
              </DropdownMenu>
            </div>

            {/* Graphman Version — standalone, not inside Tools or Configuration */}
            <button
              onClick={() => navigate('/graphman-version')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 13px', borderRadius: '7px', cursor: 'pointer',
                background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.85)', fontSize: '13px', fontWeight: 600,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                <line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
              Graphman Version
            </button>

            {/* User badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 12px', borderRadius: '7px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{
                width: '22px', height: '22px', borderRadius: '50%',
                background: loginType === 'idsp' ? '#1C2B3A' : 'var(--color-accent-red)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 800, color: '#fff',
                border: loginType === 'idsp' ? '1.5px solid rgba(255,255,255,0.3)' : 'none',
              }}>
                {loginType === 'idsp'
                  ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  : username.charAt(0).toUpperCase()
                }
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#fff', lineHeight: 1.1 }}>{username}</div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', lineHeight: 1 }}>
                  {loginType === 'idsp' ? 'IDSP / OIDC' : 'Gateway'}
                </div>
              </div>
            </div>

            {/* Logoff */}
            <button onClick={handleLogout}
              style={{ padding: '6px 13px', borderRadius: '7px', cursor: 'pointer', background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', fontSize: '13px', fontWeight: 600 }}>
              Logoff
            </button>
          </>
        )}
      </div>
    </header>
  )
}
