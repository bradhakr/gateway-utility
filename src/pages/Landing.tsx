import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { ReactNode } from 'react'

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    path: '/find-assertions',
    label: 'Find Assertions',
    subtitle: 'Search & Export Policies',
    color: '#cc0000',
    desc: 'Search all gateway services and policies for a specific assertion type. Export affected bundles, optionally replace the assertion with a newer version, and import changes back — all from one workflow.',
  },
  {
    path: '/check-compliance',
    label: 'Check Compliance',
    subtitle: 'Audit Encass Usage',
    color: '#1d4ed8',
    desc: 'Audit every service and policy on the gateway for correct Encapsulated Assertion usage. Results are clearly marked Compliant or Not Compliant — instant view of policy coverage and governance gaps.',
  },
  {
    path: '/certificate-management',
    label: 'Keys & Certificates',
    subtitle: 'Manage Certs & Keys',
    color: '#065f46',
    desc: 'Inspect and manage trusted certificates and private keys. Each entry shows validity dates with colour-coded expiry alerts. Edit inline and import directly to the target gateway.',
  },
  {
    path: '/entity-updates',
    label: 'Entity Inspector',
    subtitle: 'Browse, Edit & Import',
    color: '#78350f',
    desc: 'Browse the full inventory of gateway entities — services, policies, encass configs, JDBC connections, and more — side by side across gateways. Edit JSON and push to target in one step.',
  },
  {
    path: '/entity-forge',
    label: 'Entity Forge',
    subtitle: 'Build from Schema',
    color: '#0891b2',
    desc: 'Build a new gateway entity through a guided form using live schema metadata. No JSON editing required — fill fields with smart type-aware controls, preview the bundle, and import directly.',
  },
  {
    path: '/entity-browser',
    label: 'Entity Browser',
    subtitle: 'Query by Filter',
    color: '#7c3aed',
    desc: 'Query any gateway using built-in ByFilters GraphQL queries. Pick an entity type, define field conditions, and retrieve matching entities in a live results table. Export as JSON. Requires schema v11.2.0+.',
  },
  {
    path: '/new-entity',
    label: 'Bundle Import',
    subtitle: 'Upload & Import Bundle',
    color: '#6d28d9',
    desc: 'Upload or paste any valid Graphman JSON bundle and import it to a configured gateway. Validate the payload — entity types and item counts listed automatically — then push in one step.',
  },
]

const CONFIG = [
  {
    path: '/configuration',
    label: 'App Config',
    subtitle: 'Application Settings',
    color: '#64748b',
    desc: 'Set gateway names, login URL, Graphman home path, assertion type, and schema versions. Saved to config.json.',
  },
  {
    path: '/graphman-config',
    label: 'Graphman Config',
    subtitle: 'Gateways & Runtime Options',
    color: '#475569',
    desc: 'Add, edit, or remove gateway connection entries — address, credentials, TLS settings, mutations — and configure global runtime options.',
  },
  {
    path: '/auth-setup',
    label: 'Auth Config',
    subtitle: 'Login & OIDC Settings',
    color: '#b45309',
    desc: 'Configure gateway login endpoints and OIDC settings. Set discovery URL, client ID, scopes, and redirect URIs. Also reachable before login to fix auth misconfigurations.',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toRgba(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

// ─── Icon renderer ────────────────────────────────────────────────────────────

function ToolIcon({ path, size = 17 }: { path: string; size?: number }) {
  const s = { width: size, height: size, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (path) {
    case '/find-assertions':
      return <svg viewBox="0 0 24 24" {...s}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/></svg>
    case '/check-compliance':
      return <svg viewBox="0 0 24 24" {...s}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
    case '/certificate-management':
      return <svg viewBox="0 0 24 24" {...s}><path d="M12 22s-8-4.5-8-11.8V5l8-3 8 3v5.2c0 7.3-8 11.8-8 11.8z"/><polyline points="9 12 11 14 15 10"/></svg>
    case '/entity-updates':
      return <svg viewBox="0 0 24 24" {...s}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
    case '/entity-forge':
      return <svg viewBox="0 0 24 24" {...s}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
    case '/entity-browser':
      return <svg viewBox="0 0 24 24" {...s}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
    case '/new-entity':
      return <svg viewBox="0 0 24 24" {...s}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
    case '/configuration':
      return <svg viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    case '/graphman-config':
      return <svg viewBox="0 0 24 24" {...s}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
    case '/auth-setup':
      return <svg viewBox="0 0 24 24" {...s}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    default:
      return <svg viewBox="0 0 24 24" {...s}><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
  }
}

// ─── Rich card ────────────────────────────────────────────────────────────────

function RichCard({ path, label, subtitle, color, desc, onClick }: typeof TOOLS[0] & { onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: '10px',
        padding: '14px 15px 15px',
        background: 'var(--color-card-bg)',
        border: '1px solid var(--color-border)',
        borderTop: `3px solid ${color}`,
        borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
        transform: hov ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hov ? '0 8px 24px rgba(0,0,0,0.18)' : '0 1px 3px rgba(0,0,0,0.06)',
        width: '100%',
      }}
    >
      {/* Icon + name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '34px', height: '34px', borderRadius: '9px', flexShrink: 0,
          background: toRgba(color, 0.10),
          border: `1px solid ${toRgba(color, 0.25)}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color,
        }}>
          <ToolIcon path={path} size={17} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}
          </div>
          <div style={{ fontSize: '10.5px', fontWeight: 600, color, marginTop: '1px', letterSpacing: '0.1px' }}>
            {subtitle}
          </div>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, opacity: hov ? 0.7 : 0.2, transition: 'opacity 0.18s' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: toRgba(color, 0.12) }} />

      {/* Description */}
      <div style={{
        fontSize: '11.5px', color: 'var(--color-text-secondary)', lineHeight: 1.6,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
      }}>
        {desc}
      </div>
    </button>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function SectionCard({ accent, label, count, children }: { accent: string; label: string; count: string; children: ReactNode }) {
  return (
    <div style={{
      background: 'var(--color-sidebar-bg)',
      border: '1px solid var(--color-border)',
      borderLeft: `4px solid ${accent}`,
      borderRadius: '10px',
      overflow: 'hidden',
      marginBottom: '14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid var(--color-border)' }}>
        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#ffffff' }}>
          {label}
        </span>
        <span style={{ fontSize: '10px', fontWeight: 600, color: '#ffffff', background: `${accent}55`, border: `1px solid ${accent}99`, padding: '2px 9px', borderRadius: '10px' }}>
          {count}
        </span>
      </div>
      <div style={{ padding: '12px 14px' }}>
        {children}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Landing() {
  const { username, gateway, loginTime } = useAuth()
  const navigate = useNavigate()

  return (
    <div style={{ padding: '16px 24px', maxWidth: '1100px' }}>

      {/* ── Welcome banner ── */}
      <div style={{ background: 'linear-gradient(135deg, rgba(204,0,0,0.12) 0%, rgba(204,0,0,0.04) 100%)', border: '1px solid rgba(204,0,0,0.22)', borderRadius: '8px', padding: '12px 18px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            Welcome, <span style={{ color: 'var(--color-accent-red)' }}>{username}</span>
          </span>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Connected to <strong style={{ color: 'var(--color-text-primary)' }}>{gateway}</strong>
            {loginTime && <span style={{ opacity: 0.7 }}> · {new Date(loginTime).toLocaleTimeString()}</span>}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => navigate('/configuration')}
            style={{ padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, background: 'rgba(255,255,255,0.08)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
            App Config
          </button>
          <button onClick={() => navigate('/graphman-config')}
            style={{ padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, background: 'rgba(255,255,255,0.08)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
            Graphman Config
          </button>
          <button onClick={() => navigate('/auth-setup')}
            style={{ padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, background: 'rgba(255,255,255,0.08)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
            Auth Config
          </button>
        </div>
      </div>

      {/* ── Tools section ── */}
      <SectionCard accent="#cc0000" label="Tools" count={`${TOOLS.length} tools`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {TOOLS.map(t => (
            <RichCard key={t.path} {...t} onClick={() => navigate(t.path)} />
          ))}
        </div>
      </SectionCard>

      {/* ── Configuration section ── */}
      <SectionCard accent="#0ea5e9" label="Configuration" count={`${CONFIG.length} items`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {CONFIG.map(t => (
            <RichCard key={t.path} {...t} onClick={() => navigate(t.path)} />
          ))}
        </div>
      </SectionCard>

    </div>
  )
}
