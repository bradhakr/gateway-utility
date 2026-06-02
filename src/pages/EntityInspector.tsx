import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

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

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  entityType: string
  item: Record<string, unknown>
  savedEdit?: Record<string, unknown>
  isReadOnly?: boolean
  onSave: (parsed: Record<string, unknown>) => void
  onClose: () => void
}
function EditModal({ entityType, item, savedEdit, isReadOnly, onSave, onClose }: EditModalProps) {
  const initialJson = JSON.stringify(savedEdit ?? item, null, 2)
  const [jsonText, setJsonText] = useState(initialJson)
  const [jsonError, setJsonError] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [copied, setCopied] = useState(false)

  const meta = getMeta(entityType)
  const displayName = getEntityName(item, meta)

  function handleChange(text: string) {
    setJsonText(text); setIsDirty(text !== initialJson)
    try { JSON.parse(text); setJsonError('') } catch (e: unknown) { setJsonError((e as Error).message) }
  }
  function handleCopy() {
    navigator.clipboard.writeText(jsonText).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }
  function handleDownload() {
    let parsed: unknown; try { parsed = JSON.parse(jsonText) } catch { parsed = item }
    const blob = new Blob([JSON.stringify(parsed, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `${entityType}_${displayName.replace(/[^a-z0-9]/gi, '_')}.json`
    a.click(); URL.revokeObjectURL(url)
  }
  function handleSave() {
    if (jsonError) return
    try { onSave(JSON.parse(jsonText) as Record<string, unknown>); onClose() }
    catch { setJsonError('Invalid JSON – fix errors before saving.') }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', display: 'flex', flexDirection: 'column', width: '900px', maxWidth: '96vw', height: '88vh', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: 'var(--color-accent-red)', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>{entityType}</span>
              <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{displayName}</span>
              {isDirty && <span style={{ fontSize: '11px', color: '#facc15', background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.3)', padding: '1px 7px', borderRadius: '4px' }}>Unsaved changes</span>}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
              {isReadOnly
                ? <><span style={{ color: '#f59e0b', fontWeight: 600 }}>Read-only (Target snapshot)</span> — <strong>Copy</strong> or <strong>Download</strong> for reference. Editing is disabled.</>
                : <>Edit JSON below. <strong>Copy</strong> to clipboard. <strong>Save</strong> stages changes. <strong>Download</strong> exports to file.</>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '6px 10px', fontSize: '18px', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {jsonError && <div style={{ padding: '8px 20px', background: 'rgba(239,68,68,0.12)', borderBottom: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: '12px', flexShrink: 0 }}>JSON error: {jsonError}</div>}
          <textarea
            value={jsonText}
            onChange={e => { if (!isReadOnly) handleChange(e.target.value) }}
            readOnly={isReadOnly}
            spellCheck={false}
            style={{ flex: 1, resize: 'none', background: '#0d1117', color: isReadOnly ? '#8b949e' : '#c9d1d9', border: 'none', outline: 'none', fontFamily: 'ui-monospace,"Cascadia Code","Fira Code",monospace', fontSize: '12.5px', lineHeight: '1.6', padding: '16px 20px', overflowY: 'auto', cursor: isReadOnly ? 'default' : 'text' }} />
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>Cancel</button>
          <button onClick={handleCopy} style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.07)', border: `1px solid ${copied ? '#86efac' : 'var(--color-border)'}`, color: copied ? '#16a34a' : 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}>
            {copied
              ? <><CheckIcon /> Copied!</>
              : <><CopyIcon /> Copy JSON</>}
          </button>
          <button onClick={handleDownload} style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', background: 'rgba(255,255,255,0.07)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <DownloadIcon /> Download JSON
          </button>
          <button
            onClick={handleSave}
            disabled={!!jsonError || !!isReadOnly}
            title={isReadOnly ? 'Target snapshot is read-only — switch to Source view to edit' : undefined}
            style={{ padding: '8px 20px', borderRadius: '6px', cursor: (jsonError || isReadOnly) ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600, background: (jsonError || isReadOnly) ? 'rgba(204,0,0,0.4)' : 'var(--color-accent-red)', border: 'none', color: '#fff', opacity: (jsonError || isReadOnly) ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <SaveIcon /> Save Changes
          </button>
        </div>
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
    <div style={{ padding: '18px 24px', position: 'relative' }}>
      {/* Role label */}
      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>{label} — {role}</div>

      {/* Gateway name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: fileModified ? dotColor : '#6b7280', flexShrink: 0 }} />
        {onGatewayChange ? (
          <input value={gatewayName} onChange={e => onGatewayChange(e.target.value)} placeholder="gateway name…"
            style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-text-primary)', background: 'transparent', border: 'none', outline: 'none', borderBottom: '1px dashed var(--color-border)', paddingBottom: '2px', width: '180px' }} />
        ) : (
          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>{gatewayName || '—'}</span>
        )}
      </div>

      {/* Stats row */}
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

      {/* Actions */}
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
          {isActive ? '✓ Viewing this data' : 'View this data'}
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25

export default function EntityInspector() {
  // Gateway / bundle meta
  const [sourceGateway, setSourceGateway]   = useState('')
  const [targetGateway, setTargetGateway]   = useState('')
  const [sourceFileModified, setSrcMod]     = useState<string | null>(null)
  const [targetFileModified, setTgtMod]     = useState<string | null>(null)

  // Per-view stats (loaded fresh when switching view)
  const [srcStats, setSrcStats] = useState<{ types: number; items: number } | null>(null)
  const [tgtStats, setTgtStats] = useState<{ types: number; items: number } | null>(null)

  // Entity list
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

  // Staged edits (keyed by entity identifier)
  const [editedItems, setEditedItems]       = useState<Record<string, Record<string, unknown>>>({})
  const [importingRows, setImportingRows]   = useState<Set<string>>(new Set())
  const [importStatus, setImportStatus]     = useState<{ name: string; success: boolean; message: string; suggestVerify?: boolean } | null>(null)

  // Re-export state
  const [refreshingSource, setRefreshingSrc] = useState(false)
  const [refreshingTarget, setRefreshingTgt] = useState(false)
  const [refreshError, setRefreshError]      = useState<string | null>(null)
  const [refreshElapsed, setRefreshElapsed]  = useState(0)
  const refreshAbortRef = useRef<AbortController | null>(null)

  // Edit modal
  const [editItem, setEditItem]             = useState<Record<string, unknown> | null>(null)

  const meta    = useMemo(() => getMeta(selectedType), [selectedType])
  const columns = useMemo<ColDef[]>(() => meta.columns.length > 0 ? meta.columns : (items[0] ? inferColumns(items[0]) : []), [meta, items])

  // ── Load entity types for current view ──────────────────────────────────────
  const loadEntityTypes = useCallback((mode: ViewMode) => {
    setLoadingTypes(true)
    setBundleExists(true)
    fetch(`/api/entities?from=${mode}`)
      .then(r => r.json())
      .then(data => {
        setBundleExists(data.exists ?? false)
        // trustedCerts, keys, sslKeys are managed in Keys & Certificates page
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

  // Elapsed timer for re-export
  const refreshingAny = refreshingSource || refreshingTarget
  useEffect(() => {
    let t: ReturnType<typeof setInterval>
    if (refreshingAny) { setRefreshElapsed(0); t = setInterval(() => setRefreshElapsed(s => s + 1), 1000) }
    return () => clearInterval(t)
  }, [refreshingAny])

  // ── Switch view mode ──────────────────────────────────────────────────────────
  function switchView(mode: ViewMode) {
    if (mode === viewMode) return
    setViewMode(mode)
    setSelectedType('')
    setItems([])
    setEditedItems({})
    setImportStatus(null)
    setSearch('')
    setPage(1)
  }

  // ── Load items for a type ──────────────────────────────────────────────────
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
    setSelectedType(type); setEditedItems({}); setImportStatus(null); loadItems(type, viewMode)
  }

  // ── Re-export from a gateway ──────────────────────────────────────────────
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
        const msg = [data.error, data.hint].filter(Boolean).join(' — ')
        setRefreshError(msg || 'Export failed.')
      }
    } catch (err: unknown) {
      const aborted = (err as { name?: string }).name === 'AbortError'
      setRefreshError(aborted
        ? `Gateway "${gw}" did not respond within ${EXPORT_TIMEOUT_MS / 1000}s — it may be unreachable. Check network connectivity.`
        : String(err))
    } finally {
      clearTimeout(timer)
      if (outputKey === 'source') setRefreshingSrc(false); else setRefreshingTgt(false)
    }
  }

  // ── Save from modal ───────────────────────────────────────────────────────
  function handleSave(originalItem: Record<string, unknown>, parsed: Record<string, unknown>) {
    const name = getEntityName(originalItem, meta)
    setEditedItems(prev => ({ ...prev, [name]: parsed }))
    setImportStatus(null)
  }

  // ── Import a single staged entity ─────────────────────────────────────────
  async function handleImportRow(originalItem: Record<string, unknown>) {
    const name = getEntityName(originalItem, meta)
    const entityData = editedItems[name]
    if (!entityData) return
    const ac = new AbortController()
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
        setImportStatus({ name, success: true, message: `"${name}" imported to gateway "${targetGateway}" successfully. Switch to Target view to verify.`, suggestVerify: true })
        loadItems(selectedType, viewMode)
      } else {
        const msg = [data.error, data.hint].filter(Boolean).join(' — ')
        setImportStatus({ name, success: false, message: msg || 'Import failed.' })
      }
    } catch (err: unknown) {
      const aborted = (err as { name?: string }).name === 'AbortError'
      setImportStatus({ name, success: false, message: aborted ? `Import timed out — gateway "${targetGateway}" did not respond within ${EXPORT_TIMEOUT_MS / 1000}s.` : String(err) })
    } finally {
      clearTimeout(timer)
      setImportingRows(prev => { const n = new Set(prev); n.delete(name); return n })
    }
  }

  // ── Filter / paginate ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(item => Object.values(item).some(v => String(v ?? '').toLowerCase().includes(q)))
  }, [items, search])

  const totalPages    = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated     = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const modifiedCount = Object.keys(editedItems).length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 32px', maxWidth: '1320px' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .eu-tr:hover td { background: rgba(255,255,255,0.03); }
        .eu-import-btn { opacity: 0; transition: opacity 0.15s; }
        .eu-tr:hover .eu-import-btn { opacity: 1; }
      `}</style>

      {/* Page title */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(120,53,15,0.10) 0%, rgba(120,53,15,0.03) 100%)',
        border: '1px solid rgba(120,53,15,0.20)',
        borderLeft: '4px solid #78350f',
        borderRadius: '10px',
        padding: '20px 24px',
        marginBottom: '24px',
        boxShadow: '0 2px 14px rgba(0,0,0,0.08)',
      }}>
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
            { title: 'Load Gateway Data', desc: 'Export entity data from source and/or target gateways into local snapshots. Either or both can be loaded independently.' },
            { title: 'Browse & Edit',     desc: 'Select any entity type and switch between Source and Target views. In Source view, open the JSON editor to stage changes before import.' },
            { title: 'Selective Import',  desc: 'Import individual staged entities from the source snapshot to the target gateway. Target view is read-only and reflects gateway state.' },
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

      {/* ── Workflow stepper ── */}
      {(() => {
        const stepLabels = ['Load Gateway', 'Select Type', 'Browse & Edit', 'Import']
        const stepDone   = [sourceFileModified !== null, selectedType !== '', items.length > 0, importStatus?.success === true]
        const activeStep = stepDone.findIndex(d => !d) + 1 || stepLabels.length + 1
        return (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', fontSize: '12px', fontWeight: 600 }}>
            {stepLabels.map((label, idx) => {
              const n      = idx + 1
              const active = n === activeStep
              const done   = stepDone[idx]
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

      {/* ── Gateway banner ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', marginBottom: '20px', overflow: 'hidden' }}>
        <GatewayPanel
          label="Source Gateway" role="Source (Read)"
          gatewayName={sourceGateway}
          fileModified={sourceFileModified}
          dotColor="#22c55e"
          viewMode={viewMode} myMode="source"
          refreshing={refreshingSource}
          refreshElapsed={refreshingSource ? refreshElapsed : undefined}
          totalEntityTypes={srcStats?.types}
          totalItems={srcStats?.items}
          onRefresh={() => handleRefresh('source')}
          onCancel={() => refreshAbortRef.current?.abort()}
          onSwitchView={() => switchView('source')}
          extraNote="Re-export to get the latest state of the source gateway."
        />
        <div style={{ background: 'var(--color-border)' }} />
        <GatewayPanel
          label="Target Gateway" role="Target (Import)"
          gatewayName={targetGateway}
          fileModified={targetFileModified}
          dotColor="#f59e0b"
          viewMode={viewMode} myMode="target"
          refreshing={refreshingTarget}
          refreshElapsed={refreshingTarget ? refreshElapsed : undefined}
          totalEntityTypes={tgtStats?.types}
          totalItems={tgtStats?.items}
          onRefresh={() => handleRefresh('target')}
          onCancel={() => refreshAbortRef.current?.abort()}
          onSwitchView={() => switchView('target')}
          onGatewayChange={setTargetGateway}
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

      {/* ── Entity selector ─────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '18px 24px', marginBottom: '16px' }}>
        {/* View mode tab strip */}
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
                ? <div style={{ fontSize: '13px', color: '#fca5a5' }}>
                    No {viewMode} bundle found. Click <strong>"Re-export from {viewMode === 'source' ? sourceGateway : targetGateway}"</strong> above.
                  </div>
                : (
                  <select value={selectedType} onChange={e => handleTypeChange(e.target.value)}
                    style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', padding: '8px 36px 8px 12px', fontSize: '13px', minWidth: '290px', cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23b8c5d0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
                    <option value="">— Select an entity type —</option>
                    {entityTypes.map(t => <option key={t} value={t}>{humanLabel(t)}  ({counts[t] ?? 0})</option>)}
                  </select>
                )
            }
          </div>

          {selectedType && items.length > 0 && (
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

      {/* Entity description panel */}
      {selectedType && !loadingItems && items.length > 0 && (
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

      {/* Import / refresh status banner */}
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

      {/* ── Items table ────────────────────────────────────────────────────── */}
      {!loadingItems && !itemsError && selectedType && items.length > 0 && (
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

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <th style={{ ...thSt, width: '36px' }}>#</th>
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
                      <td style={{ ...tdSt, color: 'var(--color-text-secondary)', fontSize: '11px' }}>{absIdx}</td>
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
                                <button onClick={() => setEditItem(item)}
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
                            <button onClick={() => setEditItem(item)}
                              style={{ padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: '12px', fontWeight: 500 }}>
                              Edit
                            </button>
                          )}
                          {isEdited && (
                            <button onClick={() => handleImportRow(item)} disabled={isImporting}
                              className="eu-import-btn"
                              style={{ padding: '4px 10px', borderRadius: '5px', cursor: isImporting ? 'wait' : 'pointer', background: 'var(--color-accent-red)', border: 'none', color: '#fff', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                              {isImporting ? <><Spinner small />Importing…</> : <>↑ Import</>}
                            </button>
                          )}
                          {viewMode === 'target' && !isEdited && (
                            <span style={{ fontSize: '11px', color: 'rgba(184,197,208,0.3)' }}>Read-only</span>
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
      {!loadingItems && !itemsError && selectedType && items.length === 0 && !loadingTypes && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-secondary)', fontSize: '13px', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
          No items found for <strong>{selectedType}</strong> in the {viewMode} bundle.
        </div>
      )}
      {!selectedType && bundleExists && !loadingTypes && (
        <div style={{ textAlign: 'center', padding: '60px 32px', color: 'var(--color-text-secondary)', fontSize: '13px', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25, margin: '0 auto 12px', display: 'block' }}>
            <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
          </svg>
          Select an entity type above to browse its items.
        </div>
      )}

      {/* Edit modal */}
      {editItem && (
        <EditModal
          entityType={selectedType}
          item={editItem}
          savedEdit={editedItems[getEntityName(editItem, meta)]}
          isReadOnly={viewMode === 'target'}
          onSave={parsed => handleSave(editItem, parsed)}
          onClose={() => setEditItem(null)}
        />
      )}
    </div>
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
function CopyIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
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
