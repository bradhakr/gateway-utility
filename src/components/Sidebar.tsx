import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

interface NavItem {
  path: string
  label: string
  icon: ReactNode
  description: string
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Accent underline decoration placed directly below a section label */
function SectionUnderline() {
  return (
    <div style={{
      width: '24px',
      height: '2px',
      background: 'var(--color-accent-red, #CC0000)',
      borderRadius: '1px',
      margin: '2px 18px 8px',
      opacity: 0.75,
    }} />
  )
}

/** Full-width horizontal rule between sections */
function SectionDivider() {
  return (
    <div style={{
      borderTop: '1px solid rgba(255,255,255,0.12)',
      margin: '4px 0',
    }} />
  )
}

/** Section label + accent underline */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <>
      <div style={{
        padding: '14px 18px 4px',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '1px',
        textTransform: 'uppercase',
        color: 'rgba(184,197,208,0.5)',
      }}>
        {children}
      </div>
      <SectionUnderline />
    </>
  )
}

/** Shared active/hover style for all NavLink items */
function navLinkStyle({ isActive }: { isActive: boolean }): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '11px 18px',
    textDecoration: 'none',
    color: isActive ? 'var(--color-sidebar-active-text)' : 'var(--color-sidebar-text)',
    background: isActive ? 'var(--color-sidebar-active-bg)' : 'transparent',
    borderLeft: isActive ? '3px solid rgba(255,255,255,0.5)' : '3px solid transparent',
    transition: 'background 0.15s',
    cursor: 'pointer',
  }
}

function onEnter(e: React.MouseEvent<HTMLAnchorElement>) {
  const el = e.currentTarget
  if (!el.getAttribute('aria-current')) el.style.background = 'var(--color-sidebar-hover)'
}
function onLeave(e: React.MouseEvent<HTMLAnchorElement>) {
  const el = e.currentTarget
  if (!el.getAttribute('aria-current')) el.style.background = 'transparent'
}

function NavItem({ item }: { item: NavItem }) {
  return (
    <NavLink
      key={item.path}
      to={item.path}
      style={navLinkStyle}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <span style={{ flexShrink: 0, opacity: 0.85 }}>{item.icon}</span>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 500, lineHeight: '1.2' }}>
          {item.label}
        </div>
        <div style={{ fontSize: '11px', opacity: 0.55, marginTop: '1px' }}>
          {item.description}
        </div>
      </div>
    </NavLink>
  )
}

// ─── Nav data ─────────────────────────────────────────────────────────────────

const toolItems: NavItem[] = [
  {
    path: '/find-assertions',
    label: 'Find Assertions',
    description: 'Search & export policies',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="8" y1="11" x2="14" y2="11"/>
        <line x1="11" y1="8" x2="11" y2="14"/>
      </svg>
    ),
  },
  {
    path: '/check-compliance',
    label: 'Check Compliance',
    description: 'Multi-assertion audit',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <polyline points="9 12 11 14 15 10"/>
      </svg>
    ),
  },
  {
    path: '/certificate-management',
    label: 'Keys & Certificates',
    description: 'Expiry, edit & import certs',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s-8-4.5-8-11.8V5l8-3 8 3v5.2c0 7.3-8 11.8-8 11.8z"/>
        <polyline points="9 12 11 14 15 10"/>
      </svg>
    ),
  },
  {
    path: '/entity-updates',
    label: 'Entity Inspector',
    description: 'Browse, edit & import entities',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"/>
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
      </svg>
    ),
  },
  {
    path: '/entity-forge',
    label: 'Entity Forge',
    description: 'Build entities from schema',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2"/>
        <polyline points="2 17 12 22 22 17"/>
        <polyline points="2 12 12 17 22 12"/>
      </svg>
    ),
  },
  {
    path: '/entity-browser',
    label: 'Entity Browser',
    description: 'Query entities by filter',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="11" y1="8" x2="11" y2="14"/>
        <line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
    ),
  },
  {
    path: '/new-entity',
    label: 'Bundle Import',
    description: 'Upload & import bundle JSON',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="12" y1="11" x2="12" y2="17"/>
        <line x1="9" y1="14" x2="15" y2="14"/>
      </svg>
    ),
  },
  {
    path: '/repo-syncup',
    label: 'Repository SyncUp',
    description: 'Gateway ↔ Git sync',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 3 21 3 21 8"/>
        <line x1="4" y1="20" x2="21" y2="3"/>
        <polyline points="21 16 21 21 16 21"/>
        <line x1="15" y1="15" x2="21" y2="21"/>
      </svg>
    ),
  },
]

const configItems: NavItem[] = [
  {
    path: '/configuration',
    label: 'App Config',
    description: 'config.json settings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
  },
  {
    path: '/graphman-config',
    label: 'Graphman Config',
    description: 'Gateways & options',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    ),
  },
  {
    path: '/auth-setup',
    label: 'Auth Config',
    description: 'Gateway & OIDC config',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
  },
  {
    path: '/github-config',
    label: 'GitHub Config',
    description: 'Repositories & PAT tokens',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="18" r="3"/>
        <circle cx="6" cy="6" r="3"/>
        <path d="M13 6h3a2 2 0 0 1 2 2v7"/>
        <line x1="6" y1="9" x2="6" y2="21"/>
      </svg>
    ),
  },
]

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar() {
  return (
    <aside style={{
      width: '220px',
      background: 'var(--color-sidebar-bg)',
      position: 'fixed',
      top: '56px',
      left: 0,
      bottom: 0,
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      borderRight: '1px solid rgba(255,255,255,0.06)',
    }}>

      {/* ── Tools ────────────────────────────────────────────────────────────── */}
      <SectionLabel>Tools</SectionLabel>
      <nav>
        {toolItems.map(item => <NavItem key={item.path} item={item} />)}
      </nav>

      {/* ── Configuration ────────────────────────────────────────────────────── */}
      <SectionDivider />
      <SectionLabel>Configuration</SectionLabel>
      <nav>
        {configItems.map(item => <NavItem key={item.path} item={item} />)}
      </nav>

      {/* ── Graphman Client ──────────────────────────────────────────────────── */}
      <SectionDivider />
      <SectionLabel>Graphman Client</SectionLabel>
      <nav>
        <NavLink
          to="/graphman-version"
          style={navLinkStyle}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          <span style={{ flexShrink: 0, opacity: 0.85 }}>
            {/* Package / box icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 500, lineHeight: '1.2' }}>
              Graphman Version
            </div>
            <div style={{ fontSize: '11px', opacity: 0.55, marginTop: '1px' }}>
              Installed client info
            </div>
          </div>
        </NavLink>
      </nav>

      {/* ── Bottom branding ───────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 'auto',
        padding: '14px 18px',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        fontSize: '11px',
        color: 'rgba(184,197,208,0.35)',
        lineHeight: '1.6',
      }}>
        <div>Layer7 Graphman Scripts</div>
        <div style={{ marginTop: '2px' }}>Broadcom Inc.</div>
      </div>

    </aside>
  )
}
