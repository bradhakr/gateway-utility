import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

const PAGE_COLOR = '#065f46'
const PAGE_RGBA  = 'rgba(6,95,70,'

// ─── Types ────────────────────────────────────────────────────────────────────

type EntityType = 'trustedCerts' | 'keys' | ''
type ViewMode   = 'source' | 'target'

interface CertItem extends Record<string, unknown> {
  name?:          string
  alias?:         string
  subjectDn?:     string
  issuerDn?:      string
  notBefore?:     string
  notAfter?:      string
  thumbprintSha1?: string
  keyType?:       string
  keystoreId?:    string
  trustedForSsl?: boolean
  verifyHostname?: boolean
  certBase64?:    string
}

interface ExpiryStatus {
  type:   'valid' | 'expiring' | 'expired' | 'unknown'
  label:  string
  color:  string
  bg:     string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getExpiryStatus(notAfter?: string): ExpiryStatus {
  if (!notAfter) return { type: 'unknown', label: 'No Date', color: '#6b7280', bg: 'rgba(107,114,128,0.15)' }
  const exp  = new Date(notAfter)
  const now  = new Date()
  const days = (exp.getTime() - now.getTime()) / 86_400_000
  if (days < 0)    return { type: 'expired',  label: `Expired ${Math.abs(Math.floor(days))}d ago`, color: '#ef4444', bg: 'rgba(239,68,68,0.15)' }
  if (days <= 30)  return { type: 'expiring', label: `Expiring in ${Math.ceil(days)}d`,            color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' }
  return               { type: 'valid',    label: 'Valid',                                      color: '#22c55e', bg: 'rgba(34,197,94,0.15)'  }
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return iso }
}

function fmtDateTime(iso?: string) {
  if (!iso) return 'Not fetched'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function getItemId(item: CertItem): string {
  return String(item.name ?? item.alias ?? 'Unknown')
}

function truncate(s: string | undefined, n = 55) {
  if (!s) return '—'
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  entityType: EntityType
  item: CertItem
  savedEdit?: CertItem
  onSave:  (parsed: CertItem) => void
  onClose: () => void
}

function EditModal({ entityType, item, savedEdit, onSave, onClose }: EditModalProps) {
  const initialJson = JSON.stringify(savedEdit ?? item, null, 2)
  const [jsonText, setJsonText] = useState(initialJson)
  const [jsonError, setJsonError] = useState('')
  const [isDirty, setIsDirty]   = useState(false)
  const [copied, setCopied]     = useState(false)

  const id = getItemId(item)

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
    const blob = new Blob([JSON.stringify({ [entityType]: [parsed] }, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = `${entityType}_${id.replace(/[^a-z0-9]/gi, '_')}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  function handleSave() {
    if (jsonError) return
    try { onSave(JSON.parse(jsonText) as CertItem); onClose() }
    catch { setJsonError('Invalid JSON – fix errors before saving.') }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
         onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', display: 'flex', flexDirection: 'column', width: '900px', maxWidth: '96vw', height: '88vh', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>

        {/* Modal header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: 'var(--color-accent-red)', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                {entityType === 'trustedCerts' ? 'Trusted Cert' : 'Private Key'}
              </span>
              <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{id}</span>
              {isDirty && <span style={{ fontSize: '11px', color: '#facc15', background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.3)', padding: '1px 7px', borderRadius: '4px' }}>Unsaved changes</span>}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
              Edit the JSON. <strong>Copy</strong> to clipboard. <strong>Save</strong> stages changes. <strong>Import</strong> in the table pushes to gateway. <strong>Download</strong> saves to file.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '6px 10px', fontSize: '18px', lineHeight: 1 }}>×</button>
        </div>

        {/* Editor */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {jsonError && (
            <div style={{ padding: '8px 20px', background: 'rgba(239,68,68,0.12)', borderBottom: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5', fontSize: '12px', flexShrink: 0 }}>
              JSON error: {jsonError}
            </div>
          )}
          <textarea value={jsonText} onChange={e => handleChange(e.target.value)} spellCheck={false}
            style={{ flex: 1, resize: 'none', background: '#0d1117', color: '#c9d1d9', border: 'none', outline: 'none', fontFamily: 'ui-monospace,"Cascadia Code","Fira Code",monospace', fontSize: '12.5px', lineHeight: '1.6', padding: '16px 20px', overflowY: 'auto' }} />
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>Cancel</button>
          <button onClick={handleCopy} style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.07)', border: `1px solid ${copied ? '#86efac' : 'var(--color-border)'}`, color: copied ? '#16a34a' : 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}>
            {copied ? <><KCCheckIcon /> Copied!</> : <><KCCopyIcon /> Copy JSON</>}
          </button>
          <button onClick={handleDownload} style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', background: 'rgba(255,255,255,0.07)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <DownloadIcon size={13} /> Download JSON
          </button>
          <button onClick={handleSave} disabled={!!jsonError}
            style={{ padding: '8px 20px', borderRadius: '6px', cursor: jsonError ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600, background: jsonError ? 'rgba(204,0,0,0.4)' : 'var(--color-accent-red)', border: 'none', color: '#fff', opacity: jsonError ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <SaveIcon /> Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Summary stat strip ───────────────────────────────────────────────────────

interface CertStats { total: number; valid: number; expiring: number; expired: number; unknown: number }

function StatsStrip({ stats }: { stats: CertStats }) {
  const cards = [
    { label: 'Total',        value: stats.total,    color: 'var(--color-text-primary)', bg: 'rgba(255,255,255,0.04)' },
    { label: 'Valid',        value: stats.valid,    color: '#22c55e', bg: 'rgba(34,197,94,0.08)'  },
    { label: 'Expiring ≤30d',value: stats.expiring, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
    { label: 'Expired',      value: stats.expired,  color: '#ef4444', bg: 'rgba(239,68,68,0.08)'  },
    { label: 'No Date',      value: stats.unknown,  color: '#6b7280', bg: 'rgba(107,114,128,0.06)' },
  ]
  return (
    <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
      {cards.map(c => (
        <div key={c.label} style={{ flex: '1 1 100px', padding: '14px 18px', background: 'var(--color-card-bg)', border: `1px solid var(--color-border)`, borderRadius: '8px', borderTop: `3px solid ${c.color}` }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: c.color }}>{c.value}</div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{c.label}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Gateway panel ────────────────────────────────────────────────────────────

const EXPORT_TIMEOUT_MS = 65_000

interface GwPanelProps {
  role: string; gatewayName: string; fileModified?: string | null
  dotColor: string; isActive: boolean; refreshing: boolean; refreshElapsed?: number
  onRefresh: () => void; onCancel?: () => void; onActivate: () => void
  onNameChange?: (v: string) => void; note?: string
}
function GwPanel({ role, gatewayName, fileModified, dotColor, isActive, refreshing, refreshElapsed, onRefresh, onCancel, onActivate, onNameChange, note }: GwPanelProps) {
  return (
    <div style={{ padding: '18px 24px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>{role}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: fileModified ? dotColor : '#6b7280', flexShrink: 0 }} />
        {onNameChange
          ? <input value={gatewayName} onChange={e => onNameChange(e.target.value)} placeholder="gateway…"
              style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-text-primary)', background: 'transparent', border: 'none', outline: 'none', borderBottom: '1px dashed var(--color-border)', width: '180px' }} />
          : <span style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>{gatewayName || '—'}</span>
        }
      </div>
      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>Last fetched: {fmtDateTime(fileModified ?? undefined)}</div>
      {note && <div style={{ fontSize: '11px', color: 'rgba(184,197,208,0.45)', lineHeight: 1.5, marginBottom: '12px' }}>{note}</div>}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={onRefresh} disabled={refreshing}
          style={{ padding: '6px 14px', borderRadius: '6px', cursor: refreshing ? 'wait' : 'pointer', fontSize: '12px', fontWeight: 500, background: 'rgba(255,255,255,0.07)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px', opacity: refreshing ? 0.6 : 1 }}>
          {refreshing
            ? <><Spinner small /> Exporting… {(refreshElapsed ?? 0) > 0 && <span style={{ fontSize: '11px', opacity: 0.75 }}>({refreshElapsed}s / 65s)</span>}</>
            : <><RefreshIcon /> Re-export from {gatewayName || 'gateway'}</>}
        </button>
        {refreshing && onCancel && (
          <button onClick={onCancel}
            style={{ padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, background: 'transparent', border: '1px solid rgba(239,68,68,0.5)', color: '#fca5a5' }}>
            Cancel
          </button>
        )}
        <button onClick={onActivate}
          style={{ padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, background: isActive ? 'var(--color-accent-red)' : 'transparent', border: `1px solid ${isActive ? 'var(--color-accent-red)' : 'var(--color-border)'}`, color: isActive ? '#fff' : 'var(--color-text-secondary)' }}>
          {isActive ? '✓ Viewing this data' : 'View this data'}
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 30
const ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'trustedCerts', label: 'Trusted Certificates' },
  { value: 'keys',         label: 'Private Keys' },
]

export default function KeysCertificates() {
  // Gateway meta
  const [sourceGateway, setSrcGw]   = useState('')
  const [targetGateway, setTgtGw]   = useState('')
  const [srcModified, setSrcMod]    = useState<string | null>(null)
  const [tgtModified, setTgtMod]    = useState<string | null>(null)
  const [refreshingSrc, setRefSrc]  = useState(false)
  const [refreshingTgt, setRefTgt]  = useState(false)
  const [refreshError, setRefErr]   = useState<string | null>(null)
  const [refreshElapsed, setRefElapsed] = useState(0)
  const refreshAbortRef = useRef<AbortController | null>(null)

  // Entity/view state
  const [viewMode, setViewMode]             = useState<ViewMode>('source')
  const [entityType, setEntityType]         = useState<EntityType>('')
  const [items, setItems]                   = useState<CertItem[]>([])
  const [loadingItems, setLoadingItems]     = useState(false)
  const [itemsError, setItemsError]         = useState('')
  const [bundleExists, setBundleExists]     = useState(true)

  // Search / filter
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'valid' | 'expiring' | 'expired' | 'unknown'>('all')
  const [page, setPage]                 = useState(1)

  // Staged edits (keyed by name/alias)
  const [editedItems, setEditedItems]   = useState<Record<string, CertItem>>({})
  const [importingRows, setImportingRows] = useState<Set<string>>(new Set())
  const [importStatus, setImportStatus] = useState<{ id: string; success: boolean; message: string; suggestVerify?: boolean } | null>(null)

  // Edit modal
  const [editItem, setEditItem] = useState<CertItem | null>(null)

  // ── Load gateway config ────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/entities')
      .then(r => r.json())
      .then(d => {
        setSrcGw(d.sourceGateway ?? '')
        setTgtGw(d.targetGateway ?? '')
        setSrcMod(d.sourceFileModified ?? null)
        setTgtMod(d.targetFileModified ?? null)
        setBundleExists(d.exists ?? false)
      })
      .catch(() => {})
  }, [])

  // ── Load items ─────────────────────────────────────────────────────────────
  const loadItems = useCallback((type: EntityType, mode: ViewMode) => {
    if (!type) return
    setLoadingItems(true); setItemsError(''); setItems([]); setPage(1); setSearch(''); setFilterStatus('all')
    fetch(`/api/keys-certs/${type}?from=${mode}`)
      .then(r => r.json())
      .then(d => { if (d.success) setItems(d.items ?? []); else setItemsError(d.error ?? 'Failed to load.') })
      .catch(err => setItemsError(String(err)))
      .finally(() => setLoadingItems(false))
  }, [])

  // Elapsed timer for re-export
  const refreshingAny = refreshingSrc || refreshingTgt
  useEffect(() => {
    let t: ReturnType<typeof setInterval>
    if (refreshingAny) { setRefElapsed(0); t = setInterval(() => setRefElapsed(s => s + 1), 1000) }
    return () => clearInterval(t)
  }, [refreshingAny])

  function handleTypeChange(type: EntityType) {
    setEntityType(type); setEditedItems({}); setImportStatus(null)
    if (type) loadItems(type, viewMode)
    else { setItems([]); setItemsError('') }
  }

  function switchView(mode: ViewMode) {
    if (mode === viewMode) return
    setViewMode(mode); setItems([]); setEditedItems({}); setImportStatus(null); setSearch(''); setPage(1)
    if (entityType) loadItems(entityType, mode)
  }

  // ── Re-export ──────────────────────────────────────────────────────────────
  async function handleRefresh(outputKey: 'source' | 'target') {
    const gw = outputKey === 'target' ? targetGateway : sourceGateway
    const ac = new AbortController()
    refreshAbortRef.current = ac
    const timer = setTimeout(() => ac.abort(), EXPORT_TIMEOUT_MS)
    if (outputKey === 'source') setRefSrc(true); else setRefTgt(true)
    setRefErr(null)
    try {
      const resp = await fetch('/api/export-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway: gw, outputKey }),
        signal: ac.signal,
      })
      const d = await resp.json()
      if (d.success) {
        if (outputKey === 'source') setSrcMod(new Date().toISOString())
        else setTgtMod(new Date().toISOString())
        if (outputKey === viewMode && entityType) loadItems(entityType, viewMode)
      } else {
        setRefErr([d.error, d.hint].filter(Boolean).join(' — ') || 'Export failed.')
      }
    } catch (err: unknown) {
      const aborted = (err as { name?: string }).name === 'AbortError'
      setRefErr(aborted
        ? `Gateway "${gw}" did not respond within ${EXPORT_TIMEOUT_MS / 1000}s — it may be unreachable. Check network connectivity.`
        : String(err))
    } finally {
      clearTimeout(timer)
      if (outputKey === 'source') setRefSrc(false); else setRefTgt(false)
    }
  }

  // ── Save from modal ────────────────────────────────────────────────────────
  function handleSave(originalItem: CertItem, parsed: CertItem) {
    const id = getItemId(originalItem)
    setEditedItems(prev => ({ ...prev, [id]: parsed }))
    setImportStatus(null)
  }

  // ── Import row ─────────────────────────────────────────────────────────────
  async function handleImportRow(originalItem: CertItem) {
    const id = getItemId(originalItem)
    const entityData = editedItems[id]
    if (!entityData) return
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), EXPORT_TIMEOUT_MS)
    setImportingRows(prev => new Set(prev).add(id)); setImportStatus(null)
    try {
      const resp = await fetch('/api/entity-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityData, gateway: targetGateway }),
        signal: ac.signal,
      })
      const d = await resp.json()
      if (d.success) {
        setEditedItems(prev => { const n = { ...prev }; delete n[id]; return n })
        setImportStatus({ id, success: true, message: `"${id}" imported to "${targetGateway}" successfully. Re-export from Target to verify.`, suggestVerify: true })
        loadItems(entityType, viewMode)
      } else {
        setImportStatus({ id, success: false, message: [d.error, d.hint].filter(Boolean).join(' — ') || 'Import failed.' })
      }
    } catch (err: unknown) {
      const aborted = (err as { name?: string }).name === 'AbortError'
      setImportStatus({ id, success: false, message: aborted ? `Import timed out — gateway "${targetGateway}" did not respond within ${EXPORT_TIMEOUT_MS / 1000}s.` : String(err) })
    } finally {
      clearTimeout(timer)
      setImportingRows(prev => { const n = new Set(prev); n.delete(id); return n })
    }
  }

  // ── Export current list ────────────────────────────────────────────────────
  function handleExportAll() {
    const payload = { [entityType]: filtered }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = `${entityType}_${viewMode}_${new Date().toISOString().slice(0, 10)}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  // ── Filter / paginate ──────────────────────────────────────────────────────
  const withStatus = useMemo(() => items.map(item => ({ item, status: getExpiryStatus(item.notAfter) })), [items])

  const filtered = useMemo(() => {
    let rows = withStatus
    if (filterStatus !== 'all') rows = rows.filter(r => r.status.type === filterStatus)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(r => Object.values(r.item).some(v => String(v ?? '').toLowerCase().includes(q)))
    }
    return rows
  }, [withStatus, filterStatus, search])

  const stats = useMemo<CertStats>(() => {
    const s = { total: items.length, valid: 0, expiring: 0, expired: 0, unknown: 0 }
    withStatus.forEach(({ status }) => { (s as Record<string, number>)[status.type]++ })
    return s
  }, [items, withStatus])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const modifiedCount = Object.keys(editedItems).length

  const isKeyType = entityType === 'keys'

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 32px', maxWidth: '1400px' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .kc-tr:hover td { background: rgba(255,255,255,0.03); }
        .kc-import-btn { opacity: 0; transition: opacity 0.15s; }
        .kc-tr:hover .kc-import-btn { opacity: 1; }
      `}</style>

      {/* Title */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(6,95,70,0.10) 0%, rgba(6,95,70,0.03) 100%)',
        border: '1px solid rgba(6,95,70,0.20)',
        borderLeft: '4px solid #065f46',
        borderRadius: '10px',
        padding: '20px 24px',
        marginBottom: '24px',
        boxShadow: '0 2px 14px rgba(0,0,0,0.08)',
      }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.2px' }}>
          Keys &amp; Certificates
          <span style={{ fontWeight: 400, fontSize: '15px', color: 'var(--color-text-secondary)', marginLeft: '12px', letterSpacing: '0' }}>— Manage Certs and Private Keys</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '6px', marginBottom: 0 }}>
          Audit expiry, edit, and import trusted certificates and private keys across gateways.
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
            { title: 'Load Gateway Data',  desc: 'Export trusted certificates and private keys from the source and/or target gateway into local snapshots for side-by-side review.' },
            { title: 'Audit & Compare',    desc: 'Switch between Source and Target views. Expiry badges flag certificates expiring within 30 days. Stage JSON edits for any cert or key.' },
            { title: 'Import to Target',   desc: 'Push individual certificates or keys from the source snapshot to the target gateway. A result panel confirms success or surfaces the error.' },
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
        const stepLabels = ['Load Gateway', 'Select Type', 'Audit & Compare', 'Import']
        const stepDone   = [srcModified !== null, entityType !== '', items.length > 0, importStatus?.success === true]
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

      {/* Gateway banner */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', marginBottom: '20px', overflow: 'hidden' }}>
        <GwPanel role="Source Gateway (Read)" gatewayName={sourceGateway} fileModified={srcModified}
          dotColor="#22c55e" isActive={viewMode === 'source'} refreshing={refreshingSrc}
          refreshElapsed={refreshingSrc ? refreshElapsed : undefined}
          onRefresh={() => handleRefresh('source')} onCancel={() => refreshAbortRef.current?.abort()} onActivate={() => switchView('source')}
          note="Re-export to get the latest certificate state from the source gateway." />
        <div style={{ background: 'var(--color-border)' }} />
        <GwPanel role="Target Gateway (Import)" gatewayName={targetGateway} fileModified={tgtModified}
          dotColor="#f59e0b" isActive={viewMode === 'target'} refreshing={refreshingTgt}
          refreshElapsed={refreshingTgt ? refreshElapsed : undefined}
          onRefresh={() => handleRefresh('target')} onCancel={() => refreshAbortRef.current?.abort()} onActivate={() => switchView('target')}
          onNameChange={setTgtGw}
          note="After importing, re-export from target then switch to Target view to verify." />
      </div>

      {/* Re-export error */}
      {refreshError && (
        <div style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', fontSize: '13px', background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✕ {refreshError}</span>
          <button onClick={() => setRefErr(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px', opacity: 0.6 }}>×</button>
        </div>
      )}

      {/* Controls */}
      <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '18px 24px', marginBottom: '16px' }}>
        {/* Source / Target tab strip */}
        <div style={{ display: 'flex', gap: 0, marginBottom: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: '7px', padding: '3px', width: 'fit-content' }}>
          {(['source', 'target'] as ViewMode[]).map(m => (
            <button key={m} onClick={() => switchView(m)}
              style={{ padding: '6px 20px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, border: 'none', background: viewMode === m ? 'var(--color-accent-red)' : 'transparent', color: viewMode === m ? '#fff' : 'var(--color-text-secondary)' }}>
              {m === 'source' ? `Source: ${sourceGateway || '…'}` : `Target: ${targetGateway || '…'}`}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px', flexWrap: 'wrap' }}>
          {/* Entity type */}
          <div>
            <label style={labelSt}>Entity Type</label>
            <select value={entityType} onChange={e => handleTypeChange(e.target.value as EntityType)}
              style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', padding: '8px 36px 8px 12px', fontSize: '13px', minWidth: '220px', cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23b8c5d0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
              <option value="">— Select type —</option>
              {ENTITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Status filter */}
          {items.length > 0 && (
            <div>
              <label style={labelSt}>Status Filter</label>
              <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value as typeof filterStatus); setPage(1) }}
                style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', padding: '8px 36px 8px 12px', fontSize: '13px', minWidth: '160px', cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23b8c5d0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
                <option value="all">All Statuses</option>
                <option value="valid">Valid</option>
                <option value="expiring">Expiring ≤30 days</option>
                <option value="expired">Expired</option>
                <option value="unknown">No Date</option>
              </select>
            </div>
          )}

          {/* Search */}
          {items.length > 0 && (
            <div style={{ flex: '1 1 180px' }}>
              <label style={labelSt}>Search</label>
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Filter by name, DN, thumbprint…"
                style={{ background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-primary)', padding: '8px 12px', fontSize: '13px', width: '100%' }} />
            </div>
          )}

          {/* Export all */}
          {filtered.length > 0 && (
            <button onClick={handleExportAll}
              style={{ padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', background: 'rgba(255,255,255,0.07)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginBottom: '0' }}>
              <DownloadIcon size={13} /> Export {filtered.length > 0 && filtered.length < items.length ? 'Filtered' : 'All'}
            </button>
          )}
        </div>

        {/* No-bundle notice */}
        {!bundleExists && entityType && (
          <div style={{ marginTop: '12px', fontSize: '13px', color: '#fca5a5' }}>
            No bundle found for {viewMode} gateway. Click <strong>"Re-export"</strong> in the {viewMode} panel above.
          </div>
        )}
      </div>

      {/* Stats strip */}
      {items.length > 0 && <StatsStrip stats={stats} />}

      {/* Import status banner */}
      {importStatus && (
        <div style={{ marginBottom: '14px', padding: '12px 16px', borderRadius: '8px', fontSize: '13px', background: importStatus.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: importStatus.success ? '#86efac' : '#fca5a5', border: `1px solid ${importStatus.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ flex: 1 }}>{importStatus.success ? '✓ ' : '✕ '}{importStatus.message}</span>
          {importStatus.suggestVerify && (
            <button onClick={async () => { setImportStatus(null); await handleRefresh('target'); switchView('target') }}
              style={{ padding: '5px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, background: '#f59e0b', border: 'none', color: '#000', whiteSpace: 'nowrap' }}>
              Re-export &amp; Verify on Target →
            </button>
          )}
          <button onClick={() => setImportStatus(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px', opacity: 0.6 }}>×</button>
        </div>
      )}

      {/* Loading */}
      {loadingItems && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-secondary)', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
          <Spinner /> <div style={{ marginTop: '12px', fontSize: '13px' }}>Loading…</div>
        </div>
      )}

      {/* Error */}
      {itemsError && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '16px 20px', color: '#fca5a5', fontSize: '13px' }}>{itemsError}</div>}

      {/* Table */}
      {!loadingItems && !itemsError && items.length > 0 && (
        <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {entityType === 'trustedCerts' ? 'Trusted Certificates' : 'Private Keys'}
              <span style={{ marginLeft: '10px', fontSize: '12px', fontWeight: 400, color: 'var(--color-text-secondary)' }}>{filtered.length} items</span>
              {modifiedCount > 0 && <span style={{ marginLeft: '10px', fontSize: '12px', fontWeight: 600, color: '#facc15', background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.25)', padding: '1px 8px', borderRadius: '10px' }}>{modifiedCount} staged</span>}
              {viewMode === 'target' && <span style={{ marginLeft: '10px', fontSize: '11px', color: '#fcd34d', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 8px', borderRadius: '10px' }}>Target snapshot</span>}
            </div>
            {totalPages > 1 && <Pager page={page} total={totalPages} onChange={setPage} />}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <th style={{ ...thSt, width: '32px' }}>#</th>
                  <th style={{ ...thSt, width: '130px' }}>Status</th>
                  <th style={thSt}>{isKeyType ? 'Alias' : 'Name'}</th>
                  {!isKeyType && <th style={{ ...thSt, width: '80px' }}>SSL</th>}
                  {isKeyType && <th style={{ ...thSt, width: '90px' }}>Key Type</th>}
                  <th style={thSt}>Subject DN</th>
                  <th style={thSt}>Issuer DN</th>
                  {!isKeyType && <th style={{ ...thSt, width: '130px' }}>SHA1 Thumbprint</th>}
                  {isKeyType && <th style={{ ...thSt, width: '130px' }}>Keystore ID</th>}
                  <th style={{ ...thSt, width: '110px' }}>Not Before</th>
                  <th style={{ ...thSt, width: '110px' }}>Not After</th>
                  <th style={{ ...thSt, width: '150px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(({ item: rawItem, status }, idx) => {
                  const id       = getItemId(rawItem)
                  const isEdited = !!editedItems[id]
                  const isImporting = importingRows.has(id)
                  const item     = isEdited ? { ...rawItem, ...editedItems[id] } as CertItem : rawItem
                  const absIdx   = (page - 1) * PAGE_SIZE + idx + 1
                  const displayStatus = isEdited ? getExpiryStatus(item.notAfter) : status

                  return (
                    <tr key={idx} className="kc-tr" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ ...tdSt, color: 'var(--color-text-secondary)', fontSize: '11px' }}>{absIdx}</td>

                      {/* Status badge */}
                      <td style={tdSt}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, background: displayStatus.bg, color: displayStatus.color, border: `1px solid ${displayStatus.color}30`, whiteSpace: 'nowrap' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: displayStatus.color, flexShrink: 0 }} />
                          {displayStatus.label}
                        </span>
                      </td>

                      {/* Name / Alias */}
                      <td style={tdSt}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button onClick={() => setEditItem(rawItem)}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-accent-red)', fontWeight: 600, fontSize: '13px', textAlign: 'left', textDecoration: 'underline', textDecorationColor: 'rgba(204,0,0,0.4)' }}>
                            {id}
                          </button>
                          {isEdited && <span style={{ fontSize: '10px', fontWeight: 700, color: '#facc15', background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.3)', padding: '1px 5px', borderRadius: '3px' }}>STAGED</span>}
                        </div>
                      </td>

                      {/* SSL trusted / Key type */}
                      {!isKeyType && (
                        <td style={tdSt}>
                          {item.trustedForSsl !== undefined ? (
                            <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', background: item.trustedForSsl ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.15)', color: item.trustedForSsl ? '#22c55e' : '#9ca3af', border: `1px solid ${item.trustedForSsl ? '#22c55e' : '#9ca3af'}30` }}>
                              {item.trustedForSsl ? 'Yes' : 'No'}
                            </span>
                          ) : <span style={{ color: 'var(--color-text-secondary)' }}>—</span>}
                        </td>
                      )}
                      {isKeyType && (
                        <td style={tdSt}>
                          {item.keyType ? <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', background: 'rgba(204,0,0,0.15)', color: 'var(--color-accent-red)', border: '1px solid rgba(204,0,0,0.25)' }}>{String(item.keyType)}</span> : <span style={{ color: 'var(--color-text-secondary)' }}>—</span>}
                        </td>
                      )}

                      {/* Subject DN */}
                      <td style={{ ...tdSt, fontSize: '12px', maxWidth: '220px' }} title={item.subjectDn}>{truncate(item.subjectDn, 45)}</td>

                      {/* Issuer DN */}
                      <td style={{ ...tdSt, fontSize: '12px', maxWidth: '200px' }} title={item.issuerDn}>{truncate(item.issuerDn, 40)}</td>

                      {/* SHA1 / Keystore ID */}
                      {!isKeyType && <td style={{ ...tdSt, fontSize: '11px', fontFamily: 'monospace', color: 'var(--color-text-secondary)' }} title={item.thumbprintSha1}>{truncate(item.thumbprintSha1, 22)}</td>}
                      {isKeyType  && <td style={{ ...tdSt, fontSize: '12px', color: 'var(--color-text-secondary)' }}>{truncate(String(item.keystoreId ?? ''), 22)}</td>}

                      {/* Not Before */}
                      <td style={{ ...tdSt, fontSize: '12px', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>{fmtDate(item.notBefore)}</td>

                      {/* Not After */}
                      <td style={{ ...tdSt, fontSize: '12px', whiteSpace: 'nowrap', color: displayStatus.color, fontWeight: displayStatus.type !== 'valid' && displayStatus.type !== 'unknown' ? 600 : 400 }}>
                        {fmtDate(item.notAfter)}
                      </td>

                      {/* Actions */}
                      <td style={{ ...tdSt, textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          {viewMode === 'source' && (
                            <button onClick={() => setEditItem(rawItem)}
                              style={{ padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: '12px', fontWeight: 500 }}>
                              Edit
                            </button>
                          )}
                          {isEdited && (
                            <button onClick={() => handleImportRow(rawItem)} disabled={isImporting}
                              className="kc-import-btn"
                              style={{ padding: '4px 10px', borderRadius: '5px', cursor: isImporting ? 'wait' : 'pointer', background: 'var(--color-accent-red)', border: 'none', color: '#fff', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                              {isImporting ? <><Spinner small />…</> : <>↑ Import</>}
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
      {!loadingItems && !itemsError && entityType && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-secondary)', fontSize: '13px', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
          No items found for <strong>{entityType}</strong> in the {viewMode} bundle.
        </div>
      )}
      {!entityType && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-secondary)', fontSize: '13px', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25, margin: '0 auto 12px', display: 'block' }}>
            <path d="M12 22s-8-4.5-8-11.8V5l8-3 8 3v5.2c0 7.3-8 11.8-8 11.8z"/><polyline points="9 12 11 14 15 10"/>
          </svg>
          Select <strong>Trusted Certificates</strong> or <strong>Private Keys</strong> to begin.
        </div>
      )}

      {/* Edit modal */}
      {editItem && (
        <EditModal entityType={entityType} item={editItem} savedEdit={editedItems[getItemId(editItem)]}
          onSave={parsed => handleSave(editItem, parsed)} onClose={() => setEditItem(null)} />
      )}
    </div>
  )
}

// ─── Shared helpers & micro-components ───────────────────────────────────────

function Spinner({ small }: { small?: boolean }) {
  const s = small ? '10px' : '24px', b = small ? '2px' : '3px'
  return <span style={{ display: 'inline-block', width: s, height: s, border: `${b} solid rgba(255,255,255,0.3)`, borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
}
function RefreshIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
}
function DownloadIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
}
function SaveIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
}
function KCCopyIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
}
function KCCheckIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
}

function Pager({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const list = buildPageList(page, total)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <PBtn label="‹" disabled={page === 1}    onClick={() => onChange(Math.max(1, page - 1))} />
      {list.map((p, i) => p === null
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
function buildPageList(cur: number, total: number): (number | null)[] {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1)
  const p: (number | null)[] = [1]
  if (cur > 3) p.push(null)
  for (let x = Math.max(2, cur - 1); x <= Math.min(total - 1, cur + 1); x++) p.push(x)
  if (cur < total - 2) p.push(null)
  p.push(total)
  return p
}

const labelSt: React.CSSProperties = { fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }
const thSt: React.CSSProperties    = { padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }
const tdSt: React.CSSProperties    = { padding: '10px 14px', verticalAlign: 'middle', fontSize: '13px', color: 'var(--color-text-primary)' }
