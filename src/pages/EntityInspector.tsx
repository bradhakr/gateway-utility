import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useDirtyGuard } from '../hooks/useDirtyGuard'
import { NavigationBlocker } from '../components/NavigationBlocker'

const PAGE_COLOR = '#78350f'
const PAGE_RGBA  = 'rgba(120,53,15,'

// ─── Column & entity metadata ─────────────────────────────────────────────────

interface ColDef { key: string; label: string; truncate?: boolean; badge?: boolean }
interface EntityMeta { columns: ColDef[]; nameKey: string }

const ENTITY_META: Record<string, EntityMeta> = {
  webApiServices:         { nameKey: 'name', columns: [{ key: 'name', label: 'Name' }, { key: 'resolutionPath', label: 'Resolution Path' }, { key: 'enabled', label: 'Enabled', badge: true }, { key: 'folderPath', label: 'Folder Path', truncate: true }] },
  internalWebApiServices: { nameKey: 'name', columns: [{ key: 'name', label: 'Name' }, { key: 'resolutionPath', label: 'Resolution Path' }, { key: 'enabled', label: 'Enabled', badge: true }] },
  backgroundTaskServices: { nameKey: 'name', columns: [{ key: 'name', label: 'Name' }, { key: 'enabled', label: 'Enabled', badge: true }, { key: 'folderPath', label: 'Folder Path', truncate: true }] },
  policyFragments:        { nameKey: 'name', columns: [{ key: 'name', label: 'Name' }, { key: 'policyType', label: 'Type', badge: true }, { key: 'folderPath', label: 'Folder Path', truncate: true }] },
  encassConfigs:          { nameKey: 'name', columns: [{ key: 'name', label: 'Name' }, { key: 'policyName', label: 'Policy Name' }, { key: 'description', label: 'Description', truncate: true }] },
  listenPorts:            { nameKey: 'name', columns: [{ key: 'name', label: 'Name' }, { key: 'port', label: 'Port' }, { key: 'protocol', label: 'Protocol', badge: true }, { key: 'enabled', label: 'Enabled', badge: true }] },
  trustedCerts:           { nameKey: 'name', columns: [{ key: 'name', label: 'Name' }, { key: 'thumbprintSha1', label: 'Thumbprint SHA1', truncate: true }, { key: 'verifyHostname', label: 'Verify Host', badge: true }, { key: 'trustedForSsl', label: 'SSL', badge: true }] },
  keys:                   { nameKey: 'alias', columns: [{ key: 'alias', label: 'Alias' }, { key: 'keyType', label: 'Key Type', badge: true }, { key: 'keystoreId', label: 'Keystore ID' }] },
  sslKeys:                { nameKey: 'alias', columns: [{ key: 'alias', label: 'Alias' }, { key: 'keyType', label: 'Key Type', badge: true }] },
  internalUsers:          { nameKey: 'login', columns: [{ key: 'login', label: 'Login' }, { key: 'name', label: 'Full Name' }, { key: 'firstName', label: 'First Name' }, { key: 'lastName', label: 'Last Name' }, { key: 'email', label: 'Email' }] },
  clusterProperties:      { nameKey: 'name', columns: [{ key: 'name', label: 'Name' }, { key: 'value', label: 'Value', truncate: true }] },
  jdbcConnections:        { nameKey: 'name', columns: [{ key: 'name', label: 'Name' }, { key: 'driverClass', label: 'Driver Class' }, { key: 'jdbcUrl', label: 'JDBC URL', truncate: true }, { key: 'enabled', label: 'Enabled', badge: true }] },
  cassandraConnections:   { nameKey: 'name', columns: [{ key: 'name', label: 'Name' }, { key: 'host', label: 'Host' }, { key: 'port', label: 'Port' }, { key: 'enabled', label: 'Enabled', badge: true }] },
  scheduledTasks:         { nameKey: 'name', columns: [{ key: 'name', label: 'Name' }, { key: 'status', label: 'Status', badge: true }, { key: 'jobType', label: 'Job Type', badge: true }, { key: 'executionDate', label: 'Next Execution' }] },
  customKeyValues:        { nameKey: 'name', columns: [{ key: 'name', label: 'Name' }, { key: 'value', label: 'Value', truncate: true }] },
  activeConnectors:       { nameKey: 'name', columns: [{ key: 'name', label: 'Name' }, { key: 'type', label: 'Type', badge: true }, { key: 'enabled', label: 'Enabled', badge: true }, { key: 'hardwiredServiceGuid', label: 'Service GUID', truncate: true }] },
  httpConfigurations:     { nameKey: 'host', columns: [{ key: 'host', label: 'Host' }, { key: 'port', label: 'Port' }, { key: 'protocol', label: 'Protocol', badge: true }] },
  emailListeners:         { nameKey: 'name', columns: [{ key: 'name', label: 'Name' }, { key: 'active', label: 'Active', badge: true }, { key: 'pollInterval', label: 'Poll Interval (ms)' }, { key: 'hostname', label: 'Hostname' }] },
  roles:                  { nameKey: 'name', columns: [{ key: 'name', label: 'Name' }, { key: 'description', label: 'Description', truncate: true }, { key: 'userCreated', label: 'User Created', badge: true }] },
  folders:                { nameKey: 'name', columns: [{ key: 'name', label: 'Name' }, { key: 'folderId', label: 'Folder ID', truncate: true }, { key: 'parentFolderId', label: 'Parent ID', truncate: true }] },
  passwords:              { nameKey: 'name', columns: [{ key: 'name', label: 'Name' }, { key: 'description', label: 'Description', truncate: true }] },
}

const ENTITY_DESCRIPTIONS: Record<string, string> = {
  webApiServices:         'Published web API services with resolution paths and policy assignments.',
  internalWebApiServices: 'Internal web API services not exposed to external clients.',
  backgroundTaskServices: 'Services scheduled to run as background jobs.',
  policyFragments:        'Reusable policy fragments referenced by services and other policies.',
  encassConfigs:          'Encapsulated assertion configurations with linked policy definitions.',
  listenPorts:            'Network listeners that define how the gateway accepts inbound connections.',
  trustedCerts:           'Trusted CA and peer certificates used for SSL/TLS validation.',
  keys:                   'Private keys and key pairs used for message signing and encryption.',
  sslKeys:                'SSL private keys stored in the gateway keystore.',
  internalUsers:          'Internal gateway user accounts and their credentials.',
  clusterProperties:      'Gateway cluster-wide configuration properties (key-value pairs).',
  jdbcConnections:        'JDBC database connection pool configurations.',
  cassandraConnections:   'Apache Cassandra NoSQL connection configurations.',
  scheduledTasks:         'Policy tasks scheduled for periodic or timed execution.',
  customKeyValues:        'Custom configuration key-value pairs stored on the gateway.',
  activeConnectors:       'Active connectors for routing inbound messages to services.',
  httpConfigurations:     'HTTP and HTTPS proxy and routing configuration settings.',
  emailListeners:         'Email listener configurations for processing inbound email.',
  roles:                  'Role-based access control (RBAC) role definitions.',
  folders:                'Hierarchical folder structure for organizing policies and services.',
  passwords:              'Stored secure password configurations.',
}

function getMeta(entityType: string): EntityMeta {
  return ENTITY_META[entityType] ?? { nameKey: 'name', columns: [] }
}
function getEntityName(item: Record<string, unknown>, meta: EntityMeta): string {
  return String(item[meta.nameKey] ?? item['name'] ?? item['alias'] ?? item['login'] ?? 'Unnamed')
}
function inferColumns(item: Record<string, unknown>): ColDef[] {
  return Object.keys(item)
    .filter(k => { const v = item[k]; return v === null || typeof v !== 'object' || Array.isArray(v) })
    .slice(0, 5)
    .map(k => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, ' $1') }))
}
function formatBadge(value: unknown) {
  const s = String(value ?? '')
  if (value === true  || s === 'true'  || s === 'ACTIVE'   || s === 'ENABLED')  return { text: s, color: '#22c55e' }
  if (value === false || s === 'false' || s === 'DISABLED' || s === 'INACTIVE') return { text: s, color: '#ef4444' }
  return { text: s || '—', color: 'var(--color-accent-red)' }
}
function renderCell(value: unknown, col: ColDef): string {
  if (value === undefined || value === null) return '—'
  if (Array.isArray(value)) return `[${value.length} items]`
  if (typeof value === 'object') return '{…}'
  if (col.truncate) { const s = String(value); return s.length > 60 ? s.slice(0, 57) + '…' : s }
  return String(value)
}
function humanLabel(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return 'Not fetched'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

type ViewMode = 'source' | 'target'

// ─── Boolean Toggle ────────────────────────────────────────────────────────────

function BooleanToggle({ value, disabled, onChange }: { value: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => { if (!disabled) onChange(!value) }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'transparent', border: 'none', padding: 0, cursor: disabled ? 'default' : 'pointer' }}
    >
      <div style={{ width: '42px', height: '24px', borderRadius: '12px', background: value ? '#22c55e' : 'rgba(255,255,255,0.12)', border: `1px solid ${value ? '#16a34a' : 'var(--color-border)'}`, position: 'relative', transition: 'background 0.2s, border-color 0.2s', flexShrink: 0, opacity: disabled ? 0.5 : 1 }}>
        <div style={{ position: 'absolute', top: '3px', left: value ? '19px' : '3px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
      </div>
      <span style={{ fontSize: '13px', fontWeight: 500, color: disabled ? 'var(--color-text-secondary)' : (value ? '#86efac' : 'var(--color-text-secondary)') }}>
        {value ? 'true' : 'false'}
      </span>
    </button>
  )
}

// ─── Entity Form Editor ────────────────────────────────────────────────────────

interface EntityFormEditorProps {
  entityType: string
  item: Record<string, unknown>
  savedEdit?: Record<string, unknown>
  isReadOnly: boolean
  onSave: (parsed: Record<string, unknown>) => void
  onBack: () => void
  onDirtyChange?: (dirty: boolean) => void
}

function EntityFormEditor({ entityType, item, savedEdit, isReadOnly, onSave, onBack, onDirtyChange }: EntityFormEditorProps) {
  const meta = getMeta(entityType)
  const displayName = getEntityName(item, meta)

  const [formState, setFormState] = useState<Record<string, unknown>>({ ...(savedEdit ?? item) })
  const [complexText, setComplexText] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    Object.entries(savedEdit ?? item).forEach(([k, v]) => {
      if (v !== null && typeof v === 'object') out[k] = JSON.stringify(v, null, 2)
    })
    return out
  })
  const [complexErrors, setComplexErrors] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showAdditional, setShowAdditional] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaved, setIsSaved] = useState(!!savedEdit)
  const [downloaded, setDownloaded] = useState(false)

  const hasErrors = Object.keys(complexErrors).length > 0

  useEffect(() => { onDirtyChange?.(isDirty) }, [isDirty, onDirtyChange])

  const knownKeys  = meta.columns.map(c => c.key)
  const allKeys    = Object.keys(formState)
  const primaryKeys    = knownKeys.filter(k => allKeys.includes(k))
  const additionalKeys = allKeys.filter(k => !knownKeys.includes(k)).sort()

  function setField(key: string, value: unknown) {
    setFormState(prev => ({ ...prev, [key]: value }))
    setIsDirty(true)
    setIsSaved(false)
  }

  function handleComplexChange(key: string, text: string) {
    setComplexText(prev => ({ ...prev, [key]: text }))
    try {
      const parsed = JSON.parse(text)
      setFormState(prev => ({ ...prev, [key]: parsed }))
      setComplexErrors(prev => { const n = { ...prev }; delete n[key]; return n })
      setIsDirty(true)
      setIsSaved(false)
    } catch (e: unknown) {
      setComplexErrors(prev => ({ ...prev, [key]: (e as Error).message.split('\n')[0] }))
    }
  }

  function toggleExpand(key: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  function handleSave() {
    if (hasErrors || isReadOnly) return
    onSave(formState)
    setIsDirty(false)
    setIsSaved(true)
  }

  function handleDownload() {
    const safeName = displayName.replace(/[^a-z0-9]/gi, '_')
    const blob = new Blob([JSON.stringify(formState, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `${entityType}_${safeName}.json`
    a.click()
    URL.revokeObjectURL(url)
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 2000)
  }

  function getFieldLabel(key: string) {
    return meta.columns.find(c => c.key === key)?.label ?? humanLabel(key)
  }

  function renderInput(key: string, value: unknown): React.ReactNode {
    const disabled = isReadOnly
    const base: React.CSSProperties = {
      background: disabled ? 'rgba(255,255,255,0.03)' : 'var(--color-input-bg)',
      border: '1px solid var(--color-border)',
      borderRadius: '6px',
      color: disabled ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
      padding: '8px 12px',
      fontSize: '13px',
      width: '100%',
      outline: 'none',
      boxSizing: 'border-box' as const,
    }

    if (value === null || value === undefined) {
      return (
        <input style={base} value="" placeholder="null" readOnly={disabled}
          onChange={e => setField(key, e.target.value || null)} />
      )
    }
    if (typeof value === 'boolean') {
      return <BooleanToggle value={value} disabled={disabled} onChange={v => setField(key, v)} />
    }
    if (typeof value === 'number') {
      return (
        <input type="number" style={base} value={String(value)} readOnly={disabled}
          onChange={e => setField(key, e.target.value === '' ? 0 : Number(e.target.value))} />
      )
    }
    if (typeof value === 'string') {
      const multiline = value.length > 80 || value.includes('\n')
      return multiline
        ? <textarea style={{ ...base, resize: 'vertical', minHeight: '80px', lineHeight: '1.5', fontFamily: 'inherit' }}
            value={value} readOnly={disabled} onChange={e => setField(key, e.target.value)} />
        : <input style={base} value={value} readOnly={disabled} onChange={e => setField(key, e.target.value)} />
    }

    // Object or Array
    const isArr = Array.isArray(value)
    const isExp = expanded.has(key)
    const text  = complexText[key] ?? JSON.stringify(value, null, 2)
    const err   = complexErrors[key]
    const count = isArr ? (value as unknown[]).length : Object.keys(value as object).length

    return (
      <div>
        <button type="button" onClick={() => toggleExpand(key)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '5px', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '5px 10px', fontSize: '12px', fontFamily: 'monospace' }}>
          <span style={{ fontSize: '9px' }}>{isExp ? '▼' : '▶'}</span>
          {isArr ? `[ ${count} item${count !== 1 ? 's' : ''} ]` : `{ ${count} field${count !== 1 ? 's' : ''} }`}
        </button>
        {isExp && (
          <div style={{ marginTop: '6px' }}>
            <textarea
              style={{ ...base, resize: 'vertical', minHeight: '120px', fontFamily: 'ui-monospace,"Cascadia Code","Fira Code",monospace', fontSize: '12px', lineHeight: '1.6', background: '#0d1117', color: err ? '#fca5a5' : (disabled ? '#6b7280' : '#c9d1d9') }}
              value={text} readOnly={disabled}
              onChange={e => handleComplexChange(key, e.target.value)} />
            {err && <div style={{ fontSize: '11px', color: '#fca5a5', marginTop: '4px' }}>JSON error: {err}</div>}
          </div>
        )}
      </div>
    )
  }

  function renderField(key: string, value: unknown, isPrimary: boolean) {
    const isIdField = key === 'goid' || key === 'id'
    return (
      <div key={key} style={{ marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: isPrimary ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
            {getFieldLabel(key)}
          </label>
          {isIdField && (
            <span style={{ fontSize: '9px', fontWeight: 700, color: '#6b7280', background: 'rgba(107,114,128,0.1)', border: '1px solid rgba(107,114,128,0.2)', padding: '0 5px', borderRadius: '3px', textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>ID</span>
          )}
        </div>
        {renderInput(key, value)}
      </div>
    )
  }

  const liveJson = JSON.stringify(formState, null, 2)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '55fr 45fr', gap: '16px', alignItems: 'start' }}>

      {/* ── Left: Form panel ──────────────────────────────────────────────── */}
      <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.02)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => { if (isDirty && !window.confirm('You have unsaved edits. Leave without saving?')) return; onDirtyChange?.(false); onBack() }}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '5px', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '4px 10px', fontSize: '12px' }}>
              ← Back to list
            </button>
            <span style={{ color: 'var(--color-border)' }}>·</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{humanLabel(entityType)}</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>›</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{displayName}</span>
            {isDirty && (
              <span style={{ fontSize: '11px', color: '#facc15', background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.3)', padding: '1px 7px', borderRadius: '4px', fontWeight: 600 }}>Unsaved changes</span>
            )}
            {isSaved && !isDirty && (
              <span style={{ fontSize: '11px', color: '#86efac', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', padding: '1px 7px', borderRadius: '4px', fontWeight: 600 }}>✓ Staged</span>
            )}
          </div>
          {isReadOnly && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span>⚠</span> Read-only (Target snapshot) — download for reference only
            </div>
          )}
        </div>

        {/* Form body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(100vh - 360px)' }}>

          {/* Primary fields */}
          {primaryKeys.length > 0 && (
            <>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)', marginBottom: '14px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: PAGE_COLOR, display: 'inline-block', flexShrink: 0 }} />
                Primary Fields
              </div>
              {primaryKeys.map(key => renderField(key, formState[key], true))}
            </>
          )}

          {/* Additional fields — collapsible */}
          {additionalKeys.length > 0 && (
            <div style={{ marginTop: primaryKeys.length > 0 ? '8px' : 0 }}>
              <button type="button" onClick={() => setShowAdditional(p => !p)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '8px 12px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: showAdditional ? '14px' : 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '9px' }}>{showAdditional ? '▼' : '▶'}</span>
                  Additional Fields
                  <span style={{ background: 'rgba(255,255,255,0.08)', padding: '0 6px', borderRadius: '10px', fontWeight: 400, fontSize: '10px', textTransform: 'none', letterSpacing: 0 }}>{additionalKeys.length}</span>
                </span>
              </button>
              {showAdditional && (
                <div style={{ marginTop: '14px' }}>
                  {additionalKeys.map(key => renderField(key, formState[key], false))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            {isReadOnly
              ? <span style={{ color: '#f59e0b' }}>Target snapshot is read-only</span>
              : hasErrors
                ? <span style={{ color: '#fca5a5' }}>✕ Fix JSON errors before saving</span>
                : isDirty
                  ? 'Changes not yet staged'
                  : isSaved
                    ? 'Staged — go back and click Import to push to gateway'
                    : 'No changes'}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => { if (isDirty && !window.confirm('You have unsaved edits. Leave without saving?')) return; onDirtyChange?.(false); onBack() }}
              style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              Cancel
            </button>
            {!isReadOnly && (
              <button onClick={handleSave} disabled={hasErrors || !isDirty}
                style={{ padding: '8px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, background: (hasErrors || !isDirty) ? `${PAGE_RGBA}0.3)` : PAGE_COLOR, border: 'none', color: '#fff', cursor: (hasErrors || !isDirty) ? 'not-allowed' : 'pointer', opacity: (hasErrors || !isDirty) ? 0.55 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <SaveIcon /> Save Changes
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Right: Live Bundle ─────────────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: '24px', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>Live Bundle</span>
            <span style={{ background: PAGE_COLOR, color: '#fff', fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', letterSpacing: '0.3px', flexShrink: 0 }}>{entityType}</span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>{displayName}</span>
          </div>
          <button onClick={handleDownload}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 500, background: downloaded ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.07)', border: `1px solid ${downloaded ? '#86efac' : 'var(--color-border)'}`, color: downloaded ? '#86efac' : 'var(--color-text-primary)', transition: 'all 0.2s', flexShrink: 0 }}>
            {downloaded ? <><CheckIcon /> Downloaded!</> : <><DownloadIcon /> Download</>}
          </button>
        </div>

        {/* Live JSON */}
        <pre style={{ margin: 0, padding: '16px 20px', background: '#0d1117', color: '#c9d1d9', fontFamily: 'ui-monospace,"Cascadia Code","Fira Code",monospace', fontSize: '12px', lineHeight: '1.6', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {liveJson}
        </pre>
      </div>
    </div>
  )
}

// ─── Gateway panel (one per side) ────────────────────────────────────────────

const EXPORT_TIMEOUT_MS = 65_000

interface GatewayPanelProps {
  label: string
  role: 'Source (Read)' | 'Target (Import)'
  gatewayName: string
  fileModified: string | null | undefined
  dotColor: string
  viewMode: ViewMode
  myMode: ViewMode
  refreshing: boolean
  refreshElapsed?: number
  totalEntityTypes?: number
  totalItems?: number
  onRefresh: () => void
  onCancel?: () => void
  onSwitchView: () => void
  onGatewayChange?: (v: string) => void
  extraNote?: string
}
function GatewayPanel({ label, role, gatewayName, fileModified, dotColor, viewMode, myMode, refreshing, refreshElapsed, totalEntityTypes, totalItems, onRefresh, onCancel, onSwitchView, onGatewayChange, extraNote }: GatewayPanelProps) {
  const isActive = viewMode === myMode
  return (
    <div style={{ padding: '18px 24px', position: 'relative', background: isActive ? `${dotColor}10` : 'transparent', boxShadow: isActive ? `inset 0 3px 0 0 ${dotColor}` : 'none', transition: 'background 0.2s' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>{label} — {role}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: fileModified ? dotColor : '#6b7280', flexShrink: 0 }} />
        {onGatewayChange ? (
          <input value={gatewayName} onChange={e => onGatewayChange(e.target.value)} placeholder="gateway name…"
            style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-text-primary)', background: 'transparent', border: 'none', outline: 'none', borderBottom: '1px dashed var(--color-border)', paddingBottom: '2px', width: '180px' }} />
        ) : (
          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>{gatewayName || '—'}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '20px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Last Fetched</div>
          <div style={{ fontSize: '12px', color: fileModified ? 'var(--color-text-primary)' : '#6b7280', marginTop: '2px' }}>{fmtDate(fileModified)}</div>
        </div>
        {fileModified && totalEntityTypes !== undefined && (
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Entity Types</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-primary)', marginTop: '2px' }}>{totalEntityTypes}</div>
          </div>
        )}
        {fileModified && totalItems !== undefined && (
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Total Items</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-primary)', marginTop: '2px' }}>{totalItems.toLocaleString()}</div>
          </div>
        )}
      </div>
      {extraNote && <div style={{ fontSize: '11px', color: 'rgba(184,197,208,0.5)', marginBottom: '12px', lineHeight: '1.5' }}>{extraNote}</div>}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={onRefresh} disabled={refreshing}
          style={{ padding: '6px 14px', borderRadius: '6px', cursor: refreshing ? 'wait' : 'pointer', fontSize: '12px', fontWeight: 500, background: 'rgba(255,255,255,0.07)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px', opacity: refreshing ? 0.6 : 1 }}>
          {refreshing
            ? <><Spinner /> Exporting… {(refreshElapsed ?? 0) > 0 && <span style={{ fontSize: '11px', opacity: 0.75 }}>({refreshElapsed}s / 65s)</span>}</>
            : <><RefreshIcon /> Re-export from {gatewayName || 'gateway'}</>}
        </button>
        {refreshing && onCancel && (
          <button onClick={onCancel}
            style={{ padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, background: 'transparent', border: '1px solid rgba(239,68,68,0.5)', color: '#fca5a5' }}>
            Cancel
          </button>
        )}
        <button onClick={onSwitchView}
          style={{ padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, background: isActive ? 'var(--color-accent-red)' : 'transparent', border: `1px solid ${isActive ? 'var(--color-accent-red)' : 'var(--color-border)'}`, color: isActive ? '#fff' : 'var(--color-text-secondary)' }}>
          {isActive ? `✓ Viewing ${gatewayName || 'this'} data` : `View ${gatewayName || 'this'} data`}
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25

export default function EntityInspector() {
  const [sourceGateway, setSourceGateway]   = useState('')
  const [targetGateway, setTargetGateway]   = useState('')
  const [sourceFileModified, setSrcMod]     = useState<string | null>(null)
  const [targetFileModified, setTgtMod]     = useState<string | null>(null)

  const [srcStats, setSrcStats] = useState<{ types: number; items: number } | null>(null)
  const [tgtStats, setTgtStats] = useState<{ types: number; items: number } | null>(null)

  const [entityTypes, setEntityTypes]       = useState<string[]>([])
  const [counts, setCounts]                 = useState<Record<string, number>>({})
  const [bundleExists, setBundleExists]     = useState(true)
  const [loadingTypes, setLoadingTypes]     = useState(true)
  const [viewMode, setViewMode]             = useState<ViewMode>('source')

  const [selectedType, setSelectedType]     = useState('')
  const [items, setItems]                   = useState<Record<string, unknown>[]>([])
  const [loadingItems, setLoadingItems]     = useState(false)
  const [itemsError, setItemsError]         = useState('')
  const [search, setSearch]                 = useState('')
  const [page, setPage]                     = useState(1)

  const [editedItems, setEditedItems]       = useState<Record<string, Record<string, unknown>>>({})
  const [selectedEdited, setSelectedEdited] = useState<Set<string>>(new Set())
  const [importingRows, setImportingRows]   = useState<Set<string>>(new Set())
  const [importStatus, setImportStatus]     = useState<{ name: string; success: boolean; message: string; suggestVerify?: boolean } | null>(null)
  const [formDirty, setFormDirty]           = useState(false)

  const [refreshingSource, setRefreshingSrc] = useState(false)
  const [refreshingTarget, setRefreshingTgt] = useState(false)
  const [refreshError, setRefreshError]      = useState<string | null>(null)
  const [refreshElapsed, setRefreshElapsed]  = useState(0)
  const refreshAbortRef = useRef<AbortController | null>(null)

  // Inline form editor — replaces the old modal
  const [editingItem, setEditingItem]       = useState<Record<string, unknown> | null>(null)

  const meta    = useMemo(() => getMeta(selectedType), [selectedType])
  const columns = useMemo<ColDef[]>(() => meta.columns.length > 0 ? meta.columns : (items[0] ? inferColumns(items[0]) : []), [meta, items])

  // ── Load entity types ──────────────────────────────────────────────────────
  const loadEntityTypes = useCallback((mode: ViewMode) => {
    setLoadingTypes(true)
    setBundleExists(true)
    fetch(`/api/entities?from=${mode}`)
      .then(r => r.json())
      .then(data => {
        setBundleExists(data.exists ?? false)
        const CERT_TYPES = new Set(['trustedCerts', 'keys', 'sslKeys'])
        setEntityTypes((data.entities ?? []).filter((t: string) => !CERT_TYPES.has(t)))
        setCounts(data.counts ?? {})
        setSourceGateway(data.sourceGateway ?? '')
        setTargetGateway(data.targetGateway ?? '')
        setSrcMod(data.sourceFileModified ?? null)
        setTgtMod(data.targetFileModified ?? null)
        if (mode === 'source') setSrcStats(data.exists ? { types: data.totalEntityTypes ?? 0, items: data.totalItems ?? 0 } : null)
        if (mode === 'target') setTgtStats(data.exists ? { types: data.totalEntityTypes ?? 0, items: data.totalItems ?? 0 } : null)
      })
      .catch(() => setBundleExists(false))
      .finally(() => setLoadingTypes(false))
  }, [])

  useEffect(() => { loadEntityTypes(viewMode) }, [loadEntityTypes, viewMode])

  const refreshingAny = refreshingSource || refreshingTarget
  useEffect(() => {
    let t: ReturnType<typeof setInterval>
    if (refreshingAny) { setRefreshElapsed(0); t = setInterval(() => setRefreshElapsed(s => s + 1), 1000) }
    return () => clearInterval(t)
  }, [refreshingAny])

  // ── Switch view ────────────────────────────────────────────────────────────
  function switchView(mode: ViewMode) {
    if (mode === viewMode) return
    setViewMode(mode)
    setSelectedType('')
    setItems([])
    setEditedItems({})
    setSelectedEdited(new Set())
    setImportStatus(null)
    setSearch('')
    setPage(1)
    setEditingItem(null)
    setFormDirty(false)
  }

  // ── Load items ─────────────────────────────────────────────────────────────
  const loadItems = useCallback((type: string, mode: ViewMode) => {
    if (!type) return
    setLoadingItems(true); setItemsError(''); setItems([]); setPage(1); setSearch('')
    fetch(`/api/entities/${encodeURIComponent(type)}?from=${mode}`)
      .then(r => r.json())
      .then(data => { if (data.success) setItems(data.items ?? []); else setItemsError(data.error ?? 'Failed to load.') })
      .catch(err => setItemsError(String(err)))
      .finally(() => setLoadingItems(false))
  }, [])

  function handleTypeChange(type: string) {
    setSelectedType(type)
    setEditedItems({})
    setSelectedEdited(new Set())
    setImportStatus(null)
    setEditingItem(null)
    setFormDirty(false)
    loadItems(type, viewMode)
  }

  // ── Re-export ──────────────────────────────────────────────────────────────
  async function handleRefresh(outputKey: 'source' | 'target') {
    const gw = outputKey === 'target' ? targetGateway : sourceGateway
    const ac = new AbortController()
    refreshAbortRef.current = ac
    const timer = setTimeout(() => ac.abort(), EXPORT_TIMEOUT_MS)
    if (outputKey === 'source') setRefreshingSrc(true); else setRefreshingTgt(true)
    setRefreshError(null)
    try {
      const resp = await fetch('/api/export-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway: gw, outputKey }),
        signal: ac.signal,
      })
      const data = await resp.json()
      if (data.success) {
        if (outputKey === viewMode) {
          loadEntityTypes(viewMode)
          if (selectedType) loadItems(selectedType, viewMode)
        } else {
          loadEntityTypes(viewMode)
        }
      } else {
        setRefreshError([data.error, data.hint].filter(Boolean).join(' — ') || 'Export failed.')
      }
    } catch (err: unknown) {
      const aborted = (err as { name?: string }).name === 'AbortError'
      setRefreshError(aborted
        ? `Gateway "${gw}" did not respond within ${EXPORT_TIMEOUT_MS / 1000}s — check network connectivity.`
        : String(err))
    } finally {
      clearTimeout(timer)
      if (outputKey === 'source') setRefreshingSrc(false); else setRefreshingTgt(false)
    }
  }

  // ── Stage an edit ──────────────────────────────────────────────────────────
  function handleSave(originalItem: Record<string, unknown>, parsed: Record<string, unknown>) {
    const name = getEntityName(originalItem, meta)
    setEditedItems(prev => ({ ...prev, [name]: parsed }))
    setSelectedEdited(prev => new Set([...prev, name]))
    setImportStatus(null)
  }

  // ── Import a single staged entity ─────────────────────────────────────────
  async function handleImportRow(originalItem: Record<string, unknown>) {
    const name = getEntityName(originalItem, meta)
    const entityData = editedItems[name]
    if (!entityData) return
    const ac    = new AbortController()
    const timer = setTimeout(() => ac.abort(), EXPORT_TIMEOUT_MS)
    setImportingRows(prev => new Set(prev).add(name)); setImportStatus(null)
    try {
      const resp = await fetch('/api/entity-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: selectedType, entityData, gateway: targetGateway }),
        signal: ac.signal,
      })
      const data = await resp.json()
      if (data.success) {
        setEditedItems(prev => { const n = { ...prev }; delete n[name]; return n })
        setSelectedEdited(prev => { const n = new Set(prev); n.delete(name); return n })
        setImportStatus({ name, success: true, message: `"${name}" imported to gateway "${targetGateway}" successfully. Switch to Target view to verify.`, suggestVerify: true })
        loadItems(selectedType, viewMode)
      } else {
        setImportStatus({ name, success: false, message: [data.error, data.hint].filter(Boolean).join(' — ') || 'Import failed.' })
      }
    } catch (err: unknown) {
      const aborted = (err as { name?: string }).name === 'AbortError'
      setImportStatus({ name, success: false, message: aborted ? `Import timed out — gateway "${targetGateway}" did not respond within ${EXPORT_TIMEOUT_MS / 1000}s.` : String(err) })
    } finally {
      clearTimeout(timer)
      setImportingRows(prev => { const n = new Set(prev); n.delete(name); return n })
    }
  }

  // ── Bulk import all selected staged entities ──────────────────────────────
  async function handleImportSelected() {
    const names = [...selectedEdited].filter(name => editedItems[name])
    if (names.length === 0) return
    setImportStatus(null)
    setImportingRows(new Set(names))

    const results = await Promise.allSettled(
      names.map(async (name): Promise<{ name: string; ok: boolean }> => {
        const entityData = editedItems[name]
        const ac    = new AbortController()
        const timer = setTimeout(() => ac.abort(), EXPORT_TIMEOUT_MS)
        try {
          const resp = await fetch('/api/entity-import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entityType: selectedType, entityData, gateway: targetGateway }),
            signal: ac.signal,
          })
          const data = await resp.json()
          if (data.success) {
            setEditedItems(prev => { const n = { ...prev }; delete n[name]; return n })
            setSelectedEdited(prev => { const n = new Set(prev); n.delete(name); return n })
          }
          return { name, ok: !!data.success }
        } catch {
          return { name, ok: false }
        } finally {
          clearTimeout(timer)
          setImportingRows(prev => { const n = new Set(prev); n.delete(name); return n })
        }
      })
    )

    const successes = results.filter(r => r.status === 'fulfilled' && (r.value as { ok: boolean }).ok).length
    const total     = results.length
    const failures  = total - successes
    setImportStatus({
      name: '',
      success: successes > 0,
      message: `Bulk import: ${successes} of ${total} item${total > 1 ? 's' : ''} sent to "${targetGateway}" successfully.${failures > 0 ? ` ${failures} failed — check individually.` : ''}`,
      suggestVerify: successes > 0,
    })
    if (successes > 0) loadItems(selectedType, viewMode)
  }

  // ── Filter / paginate ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(item => Object.values(item).some(v => String(v ?? '').toLowerCase().includes(q)))
  }, [items, search])

  const totalPages    = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated     = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const modifiedCount = Object.keys(editedItems).length

  const guardDirty   = formDirty || modifiedCount > 0
  const guardMessage = formDirty
    ? 'You have unsaved edits in the form editor. Leaving this page will discard those changes.'
    : `You have ${modifiedCount} staged edit${modifiedCount > 1 ? 's' : ''} that haven't been imported to the gateway yet. The bundle file retains these changes, but the live gateway won't reflect them until you import.`
  const navBlocker = useDirtyGuard(guardDirty)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
    <NavigationBlocker blocker={navBlocker} description={guardMessage} />
    <div style={{ padding: '28px 32px', maxWidth: '1320px' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .eu-tr:hover td { background: rgba(255,255,255,0.03); }
        .eu-import-btn { opacity: 0; transition: opacity 0.15s; }
        .eu-tr:hover .eu-import-btn { opacity: 1; }
      `}</style>

      {/* Page title */}
      <div style={{ background: 'linear-gradient(135deg, rgba(120,53,15,0.10) 0%, rgba(120,53,15,0.03) 100%)', border: '1px solid rgba(120,53,15,0.20)', borderLeft: '4px solid #78350f', borderRadius: '10px', padding: '20px 24px', marginBottom: '24px', boxShadow: '0 2px 14px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.2px' }}>
          Entity Inspector
          <span style={{ fontWeight: 400, fontSize: '15px', color: 'var(--color-text-secondary)', marginLeft: '12px', letterSpacing: '0' }}>— Browse, Edit and Import Entities</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '6px', marginBottom: 0 }}>
          Browse entities from the source gateway, stage edits, import to target, then verify from target.
        </p>
      </div>

      {/* How It Works */}
      <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          How It Works
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
          {[
            { title: 'Load Gateway Data', desc: 'Export entity data from source and/or target gateways into local snapshots.' },
            { title: 'Browse & Edit',     desc: 'Select an entity type, click any row to open the form editor with live bundle preview.' },
            { title: 'Selective Import',  desc: 'Save stages your edits. Return to the list and click Import to push to the target gateway.' },
          ].map((item, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '9px', padding: '0 14px', borderRight: idx < 2 ? '1px solid var(--color-border)' : 'none' }}>
              <span style={{ flexShrink: 0, width: '18px', height: '18px', borderRadius: '50%', background: PAGE_COLOR, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 800, marginTop: '1px' }}>{idx + 1}</span>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '3px' }}>{item.title}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Workflow stepper */}
      {(() => {
        const stepLabels = ['Load Gateway', 'Select Type', 'Browse & Edit', 'Import']
        const stepDone   = [sourceFileModified !== null, selectedType !== '', items.length > 0, importStatus?.success === true]
        const activeStep = stepDone.findIndex(d => !d) + 1 || stepLabels.length + 1
        return (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', fontSize: '12px', fontWeight: 600 }}>
            {stepLabels.map((label, idx) => {
              const n = idx + 1; const active = n === activeStep; const done = stepDone[idx]
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 11px', borderRadius: '20px', background: active ? `${PAGE_RGBA}0.12)` : done ? 'rgba(34,197,94,0.08)' : 'transparent', color: active ? PAGE_COLOR : done ? '#15803d' : 'var(--color-text-secondary)', border: active ? `1px solid ${PAGE_RGBA}0.25)` : done ? '1px solid rgba(34,197,94,0.20)' : '1px solid transparent' }}>
                    <span style={{ width: '17px', height: '17px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? PAGE_COLOR : done ? '#22c55e' : 'var(--color-border)', color: active || done ? '#fff' : 'var(--color-text-secondary)', fontSize: '9.5px', fontWeight: 800 }}>
                      {done ? '✓' : n}
                    </span>
                    {label}
                  </div>
                  {idx < stepLabels.length - 1 && (
                    <div style={{ width: '18px', height: '1px', background: done ? '#22c55e' : 'var(--color-border)', opacity: done ? 0.55 : 0.35, margin: '0 3px' }} />
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Gateway banner */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', marginBottom: '20px', overflow: 'hidden' }}>
        <GatewayPanel
          label="Source Gateway" role="Source (Read)" gatewayName={sourceGateway} fileModified={sourceFileModified} dotColor="#22c55e"
          viewMode={viewMode} myMode="source" refreshing={refreshingSource} refreshElapsed={refreshingSource ? refreshElapsed : undefined}
          totalEntityTypes={srcStats?.types} totalItems={srcStats?.items}
          onRefresh={() => handleRefresh('source')} onCancel={() => refreshAbortRef.current?.abort()}
          onSwitchView={() => switchView('source')} extraNote="Re-export to get the latest state of the source gateway."
        />
        <div style={{ background: 'var(--color-border)' }} />
        <GatewayPanel
          label="Target Gateway" role="Target (Import)" gatewayName={targetGateway} fileModified={targetFileModified} dotColor="#f59e0b"
          viewMode={viewMode} myMode="target" refreshing={refreshingTarget} refreshElapsed={refreshingTarget ? refreshElapsed : undefined}
          totalEntityTypes={tgtStats?.types} totalItems={tgtStats?.items}
          onRefresh={() => handleRefresh('target')} onCancel={() => refreshAbortRef.current?.abort()}
          onSwitchView={() => switchView('target')} onGatewayChange={setTargetGateway}
          extraNote="After importing, re-export from target and switch to Target view to verify your changes."
        />
      </div>

      {/* Re-export error */}
      {refreshError && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', fontSize: '13px', background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>✕ {refreshError}</span>
          <button onClick={() => setRefreshError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px', opacity: 0.6 }}>×</button>
        </div>
      )}

      {/* Active gateway context bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', marginBottom: '16px', borderRadius: '7px', background: viewMode === 'source' ? 'rgba(34,197,94,0.07)' : 'rgba(245,158,11,0.07)', border: `1px solid ${viewMode === 'source' ? 'rgba(34,197,94,0.22)' : 'rgba(245,158,11,0.22)'}` }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: viewMode === 'source' ? '#22c55e' : '#f59e0b', boxShadow: `0 0 6px ${viewMode === 'source' ? '#22c55e80' : '#f59e0b80'}` }} />
        <span style={{ fontSize: '13px', color: 'var(--color-text-primary)', fontWeight: 500 }}>
          Currently viewing <strong>{viewMode === 'source' ? 'Source Gateway' : 'Target Gateway'}</strong> data
          {' — '}
          <span style={{ fontFamily: 'monospace', color: viewMode === 'source' ? '#86efac' : '#fcd34d', fontWeight: 700 }}>
            {viewMode === 'source' ? (sourceGateway || '…') : (targetGateway || '…')}
          </span>
        </span>
      </div>

      {/* Entity selector */}
      <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '18px 24px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: '7px', padding: '3px', width: 'fit-content' }}>
          {(['source', 'target'] as ViewMode[]).map(mode => (
            <button key={mode} onClick={() => switchView(mode)}
              style={{ padding: '6px 20px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, border: 'none', background: viewMode === mode ? 'var(--color-accent-red)' : 'transparent', color: viewMode === mode ? '#fff' : 'var(--color-text-secondary)', transition: 'background 0.15s' }}>
              {mode === 'source' ? `Source: ${sourceGateway || '…'}` : `Target: ${targetGateway || '…'}`}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 auto' }}>
            <label style={labelSt}>Entity Type</label>
            {loadingTypes
              ? <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', padding: '8px 0' }}>Loading…</div>
              : !bundleExists
                ? <div style={{ fontSize: '13px', color: '#fca5a5' }}>No {viewMode} bundle found. Click <strong>"Re-export from {viewMode === 'source' ? sourceGateway : targetGateway}"</strong> above.</div>
                : (
                  <select value={selectedType} onChange={e => handleTypeChange(e.target.value)}
                    style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', padding: '8px 36px 8px 12px', fontSize: '13px', minWidth: '290px', cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23b8c5d0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
                    <option value="">— Select an entity type —</option>
                    {entityTypes.map(t => <option key={t} value={t}>{humanLabel(t)}  ({counts[t] ?? 0})</option>)}
                  </select>
                )
            }
          </div>
          {selectedType && items.length > 0 && !editingItem && (
            <>
              <div style={{ flex: '1 1 200px' }}>
                <label style={labelSt}>Filter</label>
                <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search across all fields…"
                  style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', padding: '8px 12px', fontSize: '13px', width: '100%' }} />
              </div>
              <div style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '13px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                {filtered.length} / {items.length}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Entity description — hidden while editing */}
      {!editingItem && selectedType && !loadingItems && items.length > 0 && (
        <div style={{ background: 'rgba(204,0,0,0.06)', border: '1px solid rgba(204,0,0,0.2)', borderRadius: '8px', padding: '14px 20px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{humanLabel(selectedType)}</span>
              <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '4px', fontWeight: 600, background: viewMode === 'source' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', color: viewMode === 'source' ? '#86efac' : '#fcd34d', border: `1px solid ${viewMode === 'source' ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
                {viewMode === 'source' ? `Source: ${sourceGateway}` : `Target: ${targetGateway}`}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>{ENTITY_DESCRIPTIONS[selectedType] ?? 'Gateway entity type.'}</div>
          </div>
          <div style={{ display: 'flex', gap: '20px', flexShrink: 0 }}>
            <StatPill label="Total" value={items.length} />
            {modifiedCount > 0 && <StatPill label="Staged" value={modifiedCount} color="#facc15" />}
          </div>
        </div>
      )}

      {/* Import / refresh status */}
      {importStatus && (
        <div style={{ marginBottom: '14px', padding: '12px 16px', borderRadius: '8px', fontSize: '13px', background: importStatus.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: importStatus.success ? '#86efac' : '#fca5a5', border: `1px solid ${importStatus.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ flex: 1 }}>{importStatus.success ? '✓ ' : '✕ '}{importStatus.message}</span>
          {importStatus.suggestVerify && (
            <button onClick={async () => {
              setImportStatus(null)
              await handleRefresh('target')
              switchView('target')
              if (selectedType) loadItems(selectedType, 'target')
            }} style={{ padding: '5px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, background: '#f59e0b', border: 'none', color: '#000', whiteSpace: 'nowrap' }}>
              Re-export & Verify on Target →
            </button>
          )}
          <button onClick={() => setImportStatus(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px', opacity: 0.6 }}>×</button>
        </div>
      )}

      {/* Loading */}
      {loadingItems && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-secondary)', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
          <div style={{ display: 'inline-block', width: '24px', height: '24px', border: '3px solid var(--color-border)', borderTopColor: 'var(--color-accent-red)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginBottom: '12px' }} />
          <div style={{ fontSize: '13px' }}>Loading {humanLabel(selectedType)}…</div>
        </div>
      )}

      {/* Error */}
      {itemsError && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '16px 20px', color: '#fca5a5', fontSize: '13px' }}>{itemsError}</div>}

      {/* ── Inline form editor (shown instead of table) ──────────────────── */}
      {editingItem && (
        <EntityFormEditor
          entityType={selectedType}
          item={editingItem}
          savedEdit={editedItems[getEntityName(editingItem, meta)]}
          isReadOnly={viewMode === 'target'}
          onSave={parsed => handleSave(editingItem, parsed)}
          onBack={() => { setFormDirty(false); setEditingItem(null) }}
          onDirtyChange={setFormDirty}
        />
      )}

      {/* ── Items table (hidden while editing) ──────────────────────────── */}
      {!editingItem && !loadingItems && !itemsError && selectedType && items.length > 0 && (
        <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {humanLabel(selectedType)}
              <span style={{ marginLeft: '10px', fontSize: '12px', fontWeight: 400, color: 'var(--color-text-secondary)' }}>{filtered.length} items</span>
              {modifiedCount > 0 && <span style={{ marginLeft: '10px', fontSize: '12px', fontWeight: 600, color: '#facc15', background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.25)', padding: '1px 8px', borderRadius: '10px' }}>{modifiedCount} staged</span>}
              {viewMode === 'target' && <span style={{ marginLeft: '10px', fontSize: '11px', color: '#fcd34d', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', padding: '1px 8px', borderRadius: '10px' }}>Target snapshot</span>}
            </div>
            {totalPages > 1 && <Pager page={page} total={totalPages} onChange={setPage} />}
          </div>

          {/* Staging bar — visible when staged edits exist */}
          {modifiedCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 18px', borderBottom: '1px solid rgba(245,158,11,0.18)', background: 'rgba(245,158,11,0.06)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#fcd34d' }}>
                {modifiedCount} staged edit{modifiedCount > 1 ? 's' : ''}
              </span>
              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setSelectedEdited(new Set(Object.keys(editedItems)))}
                  style={{ padding: '5px 12px', borderRadius: '5px', border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.1)', color: '#fcd34d', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>
                  Select All
                </button>
                <button
                  onClick={handleImportSelected}
                  disabled={selectedEdited.size === 0 || importingRows.size > 0}
                  style={{ padding: '5px 14px', borderRadius: '5px', border: 'none', background: selectedEdited.size === 0 || importingRows.size > 0 ? 'rgba(204,0,0,0.3)' : 'var(--color-accent-red)', color: '#fff', cursor: selectedEdited.size === 0 || importingRows.size > 0 ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 700, opacity: selectedEdited.size === 0 || importingRows.size > 0 ? 0.6 : 1 }}>
                  {importingRows.size > 0 ? '↑ Importing…' : `↑ Import Selected (${selectedEdited.size})`}
                </button>
                <button
                  onClick={() => { setEditedItems({}); setSelectedEdited(new Set()); setImportStatus(null) }}
                  disabled={importingRows.size > 0}
                  style={{ padding: '5px 12px', borderRadius: '5px', border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)', color: '#fca5a5', cursor: importingRows.size > 0 ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 500, opacity: importingRows.size > 0 ? 0.5 : 1 }}>
                  Clear All
                </button>
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <th style={{ ...thSt, width: '36px', textAlign: 'center' }}>
                    {modifiedCount > 0
                      ? <input type="checkbox" style={{ margin: 0, cursor: 'pointer', accentColor: '#f59e0b' }}
                          checked={selectedEdited.size === modifiedCount}
                          ref={el => { if (el) el.indeterminate = selectedEdited.size > 0 && selectedEdited.size < modifiedCount }}
                          onChange={e => setSelectedEdited(e.target.checked ? new Set(Object.keys(editedItems)) : new Set())}
                          title="Select / deselect all staged edits" />
                      : '#'}
                  </th>
                  {columns.map(col => <th key={col.key} style={thSt}>{col.label}</th>)}
                  <th style={{ ...thSt, width: viewMode === 'source' ? '160px' : '80px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((item, idx) => {
                  const name        = getEntityName(item, meta)
                  const isEdited    = !!editedItems[name]
                  const isImporting = importingRows.has(name)
                  const absIdx      = (page - 1) * PAGE_SIZE + idx + 1
                  const displayItem = isEdited ? editedItems[name] : item
                  return (
                    <tr key={idx} className="eu-tr" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ ...tdSt, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '11px' }}>
                        {isEdited
                          ? <input type="checkbox" style={{ margin: 0, cursor: 'pointer', accentColor: '#f59e0b' }}
                              checked={selectedEdited.has(name)}
                              onChange={e => setSelectedEdited(prev => { const n = new Set(prev); e.target.checked ? n.add(name) : n.delete(name); return n })} />
                          : absIdx}
                      </td>
                      {columns.map((col, ci) => {
                        const val = displayItem[col.key]
                        if (col.badge && val !== undefined && val !== null) {
                          const { text, color } = formatBadge(val)
                          return (
                            <td key={col.key} style={tdSt}>
                              <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, background: color + '20', color, border: `1px solid ${color}40` }}>{text}</span>
                            </td>
                          )
                        }
                        return (
                          <td key={col.key} style={tdSt}>
                            {ci === 0 ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <button onClick={() => setEditingItem(item)}
                                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-accent-red)', fontWeight: 600, fontSize: '13px', textAlign: 'left', textDecoration: 'underline', textDecorationColor: 'rgba(204,0,0,0.4)' }}>
                                  {name}
                                </button>
                                {isEdited && <span style={{ fontSize: '10px', fontWeight: 700, color: '#facc15', background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.3)', padding: '1px 5px', borderRadius: '3px' }}>STAGED</span>}
                              </div>
                            ) : (
                              <span style={{ color: isEdited ? '#facc15' : 'var(--color-text-primary)', fontSize: '13px' }}>{renderCell(val, col)}</span>
                            )}
                          </td>
                        )
                      })}
                      <td style={{ ...tdSt, textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          {viewMode === 'source' && (
                            <button onClick={() => setEditingItem(item)}
                              style={{ padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: '12px', fontWeight: 500 }}>
                              Edit
                            </button>
                          )}
                          {viewMode === 'target' && (
                            <button onClick={() => setEditingItem(item)}
                              style={{ padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: '12px', fontWeight: 500 }}>
                              View
                            </button>
                          )}
                          {isEdited && (
                            <button onClick={() => handleImportRow(item)} disabled={isImporting}
                              className="eu-import-btn"
                              style={{ padding: '4px 10px', borderRadius: '5px', cursor: isImporting ? 'wait' : 'pointer', background: 'var(--color-accent-red)', border: 'none', color: '#fff', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                              {isImporting ? <><Spinner small />Importing…</> : <>↑ Import</>}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'center' }}>
              <Pager page={page} total={totalPages} onChange={setPage} />
            </div>
          )}
        </div>
      )}

      {/* Empty states */}
      {!editingItem && !loadingItems && !itemsError && selectedType && items.length === 0 && !loadingTypes && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-secondary)', fontSize: '13px', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
          No items found for <strong>{selectedType}</strong> in the {viewMode} bundle.
        </div>
      )}
      {!editingItem && !selectedType && bundleExists && !loadingTypes && (
        <div style={{ textAlign: 'center', padding: '60px 32px', color: 'var(--color-text-secondary)', fontSize: '13px', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25, margin: '0 auto 12px', display: 'block' }}>
            <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
          Select an entity type above to browse its items.
        </div>
      )}
    </div>
    </>
  )
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '22px', fontWeight: 700, color: color ?? 'var(--color-text-primary)' }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{label}</div>
    </div>
  )
}

function Spinner({ small }: { small?: boolean }) {
  const s = small ? '10px' : '24px', b = small ? '2px' : '3px'
  return <span style={{ display: 'inline-block', width: s, height: s, border: `${b} solid rgba(255,255,255,0.3)`, borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
}

function RefreshIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
}
function DownloadIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
}
function CheckIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function SaveIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
}

function Pager({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const pages = buildPageList(page, total)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <PBtn label="‹" disabled={page === 1}    onClick={() => onChange(Math.max(1, page - 1))} />
      {pages.map((p, i) => p === null
        ? <span key={`g${i}`} style={{ padding: '4px 6px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>…</span>
        : <PBtn key={p} label={String(p)} active={p === page} onClick={() => onChange(p)} />
      )}
      <PBtn label="›" disabled={page === total} onClick={() => onChange(Math.min(total, page + 1))} />
    </div>
  )
}
function PBtn({ label, active, disabled, onClick }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return <button onClick={onClick} disabled={disabled} style={{ padding: '4px 10px', borderRadius: '4px', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '12px', background: active ? 'var(--color-accent-red)' : 'transparent', border: `1px solid ${active ? 'var(--color-accent-red)' : 'var(--color-border)'}`, color: active ? '#fff' : 'var(--color-text-secondary)', opacity: disabled ? 0.4 : 1 }}>{label}</button>
}
function buildPageList(current: number, total: number): (number | null)[] {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | null)[] = [1]
  if (current > 3) pages.push(null)
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p)
  if (current < total - 2) pages.push(null)
  pages.push(total)
  return pages
}

const labelSt: React.CSSProperties = { fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }
const thSt: React.CSSProperties    = { padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }
const tdSt: React.CSSProperties    = { padding: '10px 14px', verticalAlign: 'middle', fontSize: '13px', color: 'var(--color-text-primary)' }
