import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GatewayItem {
  _key:               string
  name:               string
  address:            string
  username:           string
  password:           string
  rejectUnauthorized: boolean
  keyFilename:        string
  certFilename:       string
  passphrase:         string
  allowMutations:     boolean
}

interface OptionsState {
  log:              string
  schema:           string
  policyCodeFormat: string
  keyFormat:        string
  extensions:       string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiToGateways(raw: Record<string, Record<string, unknown>>): GatewayItem[] {
  return Object.entries(raw).map(([name, gw]) => ({
    _key:               name,
    name,
    address:            (gw.address            as string) ?? '',
    username:           (gw.username           as string) ?? '',
    password:           (gw.password           as string) ?? '',
    rejectUnauthorized: !!(gw.rejectUnauthorized),
    keyFilename:        (gw.keyFilename         as string) ?? '',
    certFilename:       (gw.certFilename        as string) ?? '',
    passphrase:         (gw.passphrase          as string) ?? '',
    allowMutations:     !!(gw.allowMutations),
  }))
}

function gatewaysToApi(items: GatewayItem[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const item of items) {
    result[item.name] = {
      address:            item.address,
      username:           item.username,
      password:           item.password,
      rejectUnauthorized: item.rejectUnauthorized,
      keyFilename:        item.keyFilename  || null,
      certFilename:       item.certFilename || null,
      passphrase:         item.passphrase,
      allowMutations:     item.allowMutations,
    }
  }
  return result
}

function apiToOptions(raw: Record<string, unknown>): OptionsState {
  return {
    log:              (raw.log              as string) ?? 'none',
    schema:           (raw.schema           as string) ?? '',
    policyCodeFormat: (raw.policyCodeFormat as string) ?? 'code',
    keyFormat:        (raw.keyFormat        as string) ?? 'pkcs12',
    extensions:       Array.isArray(raw.extensions) ? (raw.extensions as string[]) : [],
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_COLOR = '#475569'

// Each gateway list row is ~44px tall; cap at 9 rows before scroll kicks in
const GW_LIST_MAX_HEIGHT = 9 * 44

const INPUT_ST = {
  width: '100%', padding: '7px 10px', borderRadius: '6px', fontSize: '12px',
  background: 'var(--color-input-bg)', border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)', outline: 'none', boxSizing: 'border-box' as const,
  fontFamily: 'ui-monospace, monospace',
}

const SELECT_ST = {
  ...INPUT_ST,
  cursor: 'pointer',
}

const LABEL_ST: React.CSSProperties = {
  display: 'block', fontSize: '10px', fontWeight: 700,
  color: 'var(--color-text-secondary)', marginBottom: '4px',
  textTransform: 'uppercase', letterSpacing: '0.5px',
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} style={{
      width: '36px', height: '20px', borderRadius: '10px',
      background: checked ? PAGE_COLOR : 'rgba(255,255,255,0.12)',
      border: 'none', cursor: 'pointer', position: 'relative',
      transition: 'background 0.2s', flexShrink: 0,
    }}>
      <span style={{
        position: 'absolute', top: '2px', left: checked ? '16px' : '2px',
        width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', display: 'block',
      }} />
    </button>
  )
}

// ─── Eye icons ────────────────────────────────────────────────────────────────

function EyeOn() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  )
}
function EyeOff() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

// ─── Option field (compact stacked layout for narrow column) ─────────────────

function OptionField({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={LABEL_ST}>{label}</label>
      {desc && <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginBottom: '4px', opacity: 0.7, lineHeight: '1.4' }}>{desc}</div>}
      {children}
    </div>
  )
}

// ─── Toggle card ──────────────────────────────────────────────────────────────

function ToggleCard({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: '7px' }}>
      <div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{label}</div>
        <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>{desc}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GraphmanConfig() {
  const navigate = useNavigate()

  const [loading,       setLoading]       = useState(true)
  const [loadError,     setLoadError]     = useState<string | null>(null)
  const [filePath,      setFilePath]      = useState('')

  const [gateways,      setGateways]      = useState<GatewayItem[]>([])
  const [options,       setOptions]       = useState<OptionsState>({ log: 'none', schema: '', policyCodeFormat: 'code', keyFormat: 'pkcs12', extensions: [] })
  const [originalJson,  setOriginalJson]  = useState('')

  const [selectedKey,   setSelectedKey]   = useState<string | null>(null)
  const [showPwd,       setShowPwd]       = useState(false)
  const [showPass,      setShowPass]      = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [extInput,      setExtInput]      = useState('')

  const [saving,        setSaving]        = useState(false)
  const [saveResult,    setSaveResult]    = useState<{ success: boolean; message: string } | null>(null)

  const [schemaVersions, setSchemaVersions] = useState<string[]>([])
  const [schemaDir, setSchemaDir] = useState('')

  // ─── Load ──────────────────────────────────────────────────────────────────

  function loadConfig() {
    setLoading(true); setLoadError(null)
    fetch('/api/graphman-config-full')
      .then(r => r.json())
      .then((d: { success: boolean; data?: { gateways?: Record<string, Record<string, unknown>>; options?: Record<string, unknown> }; filePath?: string; error?: string }) => {
        if (!d.success) { setLoadError(d.error ?? 'Load failed'); return }
        const gws  = apiToGateways(d.data?.gateways ?? {})
        const opts = apiToOptions(d.data?.options   ?? {})
        setGateways(gws)
        setOptions(opts)
        setFilePath(d.filePath ?? '')
        setOriginalJson(JSON.stringify({ gateways: gatewaysToApi(gws), options: opts }))
        setSelectedKey(prev => {
          const stillExists = gws.some(g => g._key === prev)
          return stillExists ? prev : (gws.length > 0 ? gws[0]._key : null)
        })
      })
      .catch((err: unknown) => setLoadError(String(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadConfig() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch available schema versions from graphmanHome/schema/
  useEffect(() => {
    fetch('/api/schema/versions')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setSchemaVersions(d.versions || [])
          setSchemaDir(d.schemaDir || '')
        }
      })
      .catch(() => {})
  }, [])

  const selected = gateways.find(g => g._key === selectedKey) ?? null
  const isDirty  = !!originalJson && originalJson !== JSON.stringify({ gateways: gatewaysToApi(gateways), options })

  // ─── Gateway mutations ────────────────────────────────────────────────────

  function updateGateway(key: string, patch: Partial<GatewayItem>) {
    setGateways(prev => prev.map(g => g._key === key ? { ...g, ...patch } : g))
    setSaveResult(null)
  }

  function selectGateway(key: string) {
    setSelectedKey(key); setDeleteConfirm(false); setShowPwd(false); setShowPass(false)
  }

  function addGateway() {
    const tempKey = `__new__${Date.now()}`
    setGateways(prev => [...prev, {
      _key: tempKey, name: 'new-gateway', address: '', username: 'admin',
      password: '', rejectUnauthorized: false, keyFilename: '', certFilename: '',
      passphrase: '', allowMutations: true,
    }])
    selectGateway(tempKey)
    setSaveResult(null)
  }

  function deleteGateway(key: string) {
    const remaining = gateways.filter(g => g._key !== key)
    setGateways(remaining)
    setSelectedKey(remaining.length > 0 ? remaining[0]._key : null)
    setDeleteConfirm(false); setSaveResult(null)
  }

  // ─── Options mutations ────────────────────────────────────────────────────

  function updateOptions(patch: Partial<OptionsState>) {
    setOptions(prev => ({ ...prev, ...patch })); setSaveResult(null)
  }

  function addExtension(tag: string) {
    const t = tag.trim()
    if (!t || options.extensions.includes(t)) return
    updateOptions({ extensions: [...options.extensions, t] }); setExtInput('')
  }

  // ─── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    const names = gateways.map(g => g.name.trim())
    if (names.some(n => !n)) { setSaveResult({ success: false, message: 'Gateway name cannot be empty.' }); return }
    if (names.some((n, i) => names.indexOf(n) !== i)) { setSaveResult({ success: false, message: 'Duplicate gateway names — each must be unique.' }); return }
    setSaving(true); setSaveResult(null)
    try {
      const data = { gateways: gatewaysToApi(gateways), options }
      const resp = await fetch('/api/graphman-config-save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }),
      })
      const result = await resp.json() as { success: boolean; filePath?: string; error?: string }
      if (result.success) {
        setOriginalJson(JSON.stringify(data))
        setSaveResult({ success: true, message: `Saved to ${result.filePath}` })
      } else {
        setSaveResult({ success: false, message: result.error ?? 'Save failed.' })
      }
    } catch (err) {
      setSaveResult({ success: false, message: String(err) })
    } finally { setSaving(false) }
  }

  // ─── Loading / error states ───────────────────────────────────────────────

  if (loading) return (
    <div style={{ padding: '28px 32px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
      Loading graphman.configuration…
    </div>
  )

  if (loadError) return (
    <div style={{ padding: '28px 32px', maxWidth: '680px' }}>
      <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '20px 24px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#fca5a5', marginBottom: '8px' }}>Failed to load graphman.configuration</div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '14px' }}>{loadError}</div>
        <button onClick={loadConfig} style={{ padding: '7px 16px', borderRadius: '6px', background: PAGE_COLOR, color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Retry</button>
      </div>
    </div>
  )

  const saveBtnDisabled = !isDirty || saving

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1200px' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .ext-input::placeholder { color: rgba(184,197,208,0.45); }
      `}</style>

      {/* ── Page header ── */}
      <div style={{
        background: `linear-gradient(135deg, rgba(71,85,105,0.12) 0%, rgba(71,85,105,0.04) 100%)`,
        border: `1px solid rgba(71,85,105,0.22)`, borderLeft: `4px solid ${PAGE_COLOR}`,
        borderRadius: '10px', padding: '16px 20px', marginBottom: '16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            Graphman Configuration
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px', marginBottom: 0 }}>
            Manage gateway connections and runtime options in{' '}
            <code style={{ fontFamily: 'monospace', fontSize: '11px', background: 'rgba(0,0,0,0.08)', padding: '1px 5px', borderRadius: '3px' }}>graphman.configuration</code>
            {filePath && <span style={{ marginLeft: '8px', opacity: 0.5 }}>{filePath}</span>}
          </p>
        </div>
        <button onClick={() => navigate('/dashboard')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '7px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          Back to Home
        </button>
      </div>

      {/* ═══ Outer editing card ═══ */}
      <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Section labels row */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ width: '190px', flexShrink: 0, padding: '8px 14px', background: 'var(--color-sidebar-bg)', borderRight: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#B8C5D0' }}>Gateways</span>
          </div>
          <div style={{ flex: 1, padding: '8px 20px', borderRight: '1px solid var(--color-border)' }}>
            {selected
              ? <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Editing: <strong style={{ color: 'var(--color-text-primary)' }}>{selected.name || 'unnamed'}</strong></span>
              : <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', opacity: 0.6 }}>Select or add a gateway</span>
            }
          </div>
          <div style={{ width: '320px', flexShrink: 0, padding: '8px 18px' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--color-text-primary)' }}>Options</span>
          </div>
        </div>

        {/* Three-column body */}
        <div style={{ display: 'flex', minHeight: '420px' }}>

          {/* ── Col 1: Gateway list ── */}
          <div style={{ width: '190px', flexShrink: 0, borderRight: '1px solid var(--color-border)', background: 'var(--color-sidebar-bg)', display: 'flex', flexDirection: 'column' }}>
            {/* Add button */}
            <div style={{ padding: '10px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
              <button onClick={addGateway} style={{
                width: '100%', padding: '6px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
                background: PAGE_COLOR, color: '#fff', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Gateway
              </button>
            </div>
            {/* Scrollable list — max 9 entries */}
            <div style={{ overflowY: 'auto', maxHeight: `${GW_LIST_MAX_HEIGHT}px`, flex: 1 }}>
              {gateways.length === 0 ? (
                <div style={{ padding: '18px 12px', fontSize: '12px', color: 'var(--color-text-secondary)', textAlign: 'center', opacity: 0.7 }}>
                  No gateways configured
                </div>
              ) : gateways.map(gw => {
                const isSelected = gw._key === selectedKey
                let host = gw.address
                try { host = new URL(gw.address).hostname } catch { /* ok */ }
                return (
                  <button key={gw._key} onClick={() => selectGateway(gw._key)} style={{
                    width: '100%', padding: '10px 14px', textAlign: 'left',
                    background: isSelected ? 'rgba(14,165,233,0.18)' : 'transparent',
                    border: 'none', borderLeft: isSelected ? '3px solid #0ea5e9' : '3px solid transparent',
                    cursor: 'pointer', transition: 'background 0.12s',
                  }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: isSelected ? '#ffffff' : 'var(--color-sidebar-text)', lineHeight: 1.2 }}>
                      {gw.name || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>unnamed</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: isSelected ? '#0ea5e9' : 'var(--color-sidebar-text)', opacity: isSelected ? 0.9 : 0.65, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {host || <span style={{ opacity: 0.5 }}>no address</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Col 2: Gateway form ── */}
          <div style={{ flex: 1, padding: '18px 22px', overflowY: 'auto', borderRight: '1px solid var(--color-border)' }}>
            {!selected ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', fontSize: '13px', textAlign: 'center', opacity: 0.7 }}>
                Select a gateway from the list<br />or click <strong>Add Gateway</strong> to create one.
              </div>
            ) : (
              <GatewayForm
                gw={selected}
                showPwd={showPwd} showPass={showPass}
                onShowPwd={setShowPwd} onShowPass={setShowPass}
                deleteConfirm={deleteConfirm} onDeleteConfirm={setDeleteConfirm}
                onChange={patch => updateGateway(selected._key, patch)}
                onDelete={() => deleteGateway(selected._key)}
              />
            )}
          </div>

          {/* ── Col 3: Options ── */}
          <div style={{ width: '320px', flexShrink: 0, padding: '18px', overflowY: 'auto' }}>

            <OptionField label="Log Level" desc="Verbosity of Graphman output.">
              <select value={options.log} onChange={e => updateOptions({ log: e.target.value })} style={SELECT_ST}>
                {['none','debug','info','warn','error'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </OptionField>

            <OptionField label="Schema Version" desc="e.g. v11.1.3 — used for export/import.">
              {/* Label row with current-value badge */}
              {options.schema && (
                <div style={{ marginBottom: '6px' }}>
                  <span style={{ fontSize: '10px', background: 'rgba(8,145,178,0.12)', color: '#0891b2', borderRadius: '10px', padding: '1px 7px', fontWeight: 700 }}>
                    {options.schema}
                  </span>
                </div>
              )}

              {/* Dropdown — colored border when a version is selected */}
              <select
                value={schemaVersions.includes(options.schema) ? options.schema : ''}
                onChange={e => updateOptions({ schema: e.target.value })}
                style={{
                  ...SELECT_ST,
                  border: `1px solid ${options.schema && schemaVersions.includes(options.schema) ? '#0891b2' : 'var(--color-border)'}`,
                  fontWeight: options.schema ? 600 : 400,
                  appearance: 'auto',
                }}
              >
                <option value="">
                  {schemaVersions.length === 0 ? '— No schemas found —' : '— Select version —'}
                </option>
                {[...schemaVersions].reverse().map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>

              {/* Detail card — appears when a version is selected */}
              {options.schema && (
                <div style={{
                  marginTop: '8px', padding: '9px 11px', borderRadius: '7px',
                  background: 'rgba(8,145,178,0.05)', border: '1px solid rgba(8,145,178,0.18)',
                }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#0891b2', marginBottom: '6px' }}>
                    Schema Details
                  </div>
                  {[
                    { label: 'Version', value: options.schema },
                    { label: 'Status',  value: schemaVersions.includes(options.schema) ? '✓ Available on disk' : '⚠ Not found on disk' },
                    { label: 'Path',    value: schemaDir ? `…/schema/${options.schema}` : `graphmanHome/schema/${options.schema}` },
                  ].map(row => (
                    <div key={row.label} style={{ marginBottom: '4px' }}>
                      <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{row.label}: </span>
                      <span style={{
                        fontSize: '11px',
                        color: row.label === 'Status'
                          ? (schemaVersions.includes(options.schema) ? '#15803d' : '#b45309')
                          : 'var(--color-text-primary)',
                        fontFamily: row.label !== 'Status' ? 'ui-monospace, monospace' : 'inherit',
                        wordBreak: 'break-all',
                      }}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Manual text input — only when version is not on disk */}
              {(!schemaVersions.includes(options.schema) || schemaVersions.length === 0) && (
                <input
                  value={options.schema}
                  onChange={e => updateOptions({ schema: e.target.value })}
                  placeholder={schemaVersions.length ? 'Or type manually…' : 'v11.1.3'}
                  style={{ ...INPUT_ST, marginTop: '6px', fontSize: '11px' }}
                />
              )}
            </OptionField>

            <OptionField label="Policy Code Format" desc="Format for policy XML in bundles.">
              <select value={options.policyCodeFormat} onChange={e => updateOptions({ policyCodeFormat: e.target.value })} style={SELECT_ST}>
                {['xml','code','json'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </OptionField>

            <OptionField label="Key Format" desc="Format used for private key exports.">
              <select value={options.keyFormat} onChange={e => updateOptions({ keyFormat: e.target.value })} style={SELECT_ST}>
                {['pkcs12','pem'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </OptionField>

            <OptionField label="Extensions" desc="Custom extension module names.">
              {/* Single-row darker sub-card: chips + input + Add */}
              <div style={{ background: '#1e2d3d', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '7px', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {options.extensions.map(tag => (
                  <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: 'rgba(71,85,105,0.35)', border: '1px solid rgba(71,85,105,0.5)', borderRadius: '4px', fontSize: '11px', color: '#B8C5D0', flexShrink: 0 }}>
                    {tag}
                    <button onClick={() => updateOptions({ extensions: options.extensions.filter(e => e !== tag) })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(184,197,208,0.6)', padding: 0, lineHeight: 1, fontSize: '13px' }}>×</button>
                  </span>
                ))}
                <input value={extInput} onChange={e => setExtInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtension(extInput) } }}
                  placeholder={options.extensions.length ? 'Add more…' : 'Type and press Enter'}
                  className="ext-input"
                  style={{ ...INPUT_ST, flex: 1, minWidth: '80px', padding: '5px 8px', fontSize: '11px', background: 'rgba(255,255,255,0.08)', color: '#B8C5D0', border: '1px solid rgba(255,255,255,0.12)' }} />
                <button onClick={() => addExtension(extInput)} disabled={!extInput.trim()}
                  style={{ padding: '5px 9px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, background: '#0ea5e9', color: '#fff', border: 'none', cursor: extInput.trim() ? 'pointer' : 'not-allowed', opacity: extInput.trim() ? 1 : 0.4, flexShrink: 0 }}>
                  Add
                </button>
              </div>
            </OptionField>
          </div>
        </div>

        {/* ── Action bar (inside card) ── */}
        <div style={{ borderTop: '1px solid var(--color-border)', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', background: 'var(--color-sidebar-bg)' }}>
          {isDirty && (
            <span style={{ fontSize: '11px', color: '#facc15', background: 'rgba(250,204,21,0.1)', border: '1px solid rgba(250,204,21,0.25)', padding: '3px 8px', borderRadius: '4px' }}>
              Unsaved changes
            </span>
          )}
          {saveResult && (
            <div style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '4px', background: saveResult.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: saveResult.success ? '#86efac' : '#fca5a5', border: `1px solid ${saveResult.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
              {saveResult.success ? '✓ ' : '✕ '}{saveResult.message}
            </div>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={loadConfig} disabled={saving}
            style={{ padding: '7px 15px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, background: 'transparent', border: '1px solid rgba(184,197,208,0.3)', color: '#B8C5D0', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1 }}>
            Reset
          </button>
          <button onClick={handleSave} disabled={saveBtnDisabled}
            style={{ padding: '7px 20px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, background: saveBtnDisabled ? 'rgba(71,85,105,0.35)' : PAGE_COLOR, border: 'none', color: '#fff', cursor: saveBtnDisabled ? 'not-allowed' : 'pointer', opacity: saveBtnDisabled ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '7px' }}>
            {saving
              ? <><span style={{ display: 'inline-block', width: '11px', height: '11px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Saving…</>
              : 'Save All to File'
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Gateway form (middle column) ─────────────────────────────────────────────

interface GatewayFormProps {
  gw:              GatewayItem
  showPwd:         boolean
  showPass:        boolean
  onShowPwd:       (v: boolean | ((p: boolean) => boolean)) => void
  onShowPass:      (v: boolean | ((p: boolean) => boolean)) => void
  deleteConfirm:   boolean
  onDeleteConfirm: (v: boolean) => void
  onChange:        (patch: Partial<GatewayItem>) => void
  onDelete:        () => void
}

function GatewayForm({ gw, showPwd, showPass, onShowPwd, onShowPass, deleteConfirm, onDeleteConfirm, onChange, onDelete }: GatewayFormProps) {
  const row = { marginBottom: '12px' }
  return (
    <div>
      {/* Name */}
      <div style={row}>
        <label style={LABEL_ST}>Gateway Name (key)</label>
        <input value={gw.name} onChange={e => onChange({ name: e.target.value })} placeholder="e.g. vks"
          style={{ ...INPUT_ST, borderColor: !gw.name.trim() ? 'rgba(239,68,68,0.6)' : 'var(--color-border)' }} />
        <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '3px' }}>
          Must match the key used in config.json for sourceGateway / targetGateway.
        </div>
      </div>

      {/* Address */}
      <div style={row}>
        <label style={LABEL_ST}>Address (URL)</label>
        <input value={gw.address} onChange={e => onChange({ address: e.target.value })}
          placeholder="https://host:9443/graphman" style={INPUT_ST} />
      </div>

      {/* Username + Password */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div>
          <label style={LABEL_ST}>Username</label>
          <input value={gw.username} onChange={e => onChange({ username: e.target.value })} placeholder="admin" style={INPUT_ST} />
        </div>
        <div>
          <label style={LABEL_ST}>Password</label>
          <div style={{ position: 'relative' }}>
            <input type={showPwd ? 'text' : 'password'} value={gw.password}
              onChange={e => onChange({ password: e.target.value })}
              placeholder="••••••" style={{ ...INPUT_ST, paddingRight: '34px' }} />
            <button type="button" onClick={() => onShowPwd(p => !p)}
              style={{ position: 'absolute', right: '7px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 0, display: 'flex' }}>
              {showPwd ? <EyeOff /> : <EyeOn />}
            </button>
          </div>
        </div>
      </div>

      {/* Key + Cert filenames */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div>
          <label style={LABEL_ST}>Key Filename</label>
          <input value={gw.keyFilename} onChange={e => onChange({ keyFilename: e.target.value })} placeholder="(optional)" style={INPUT_ST} />
        </div>
        <div>
          <label style={LABEL_ST}>Cert Filename</label>
          <input value={gw.certFilename} onChange={e => onChange({ certFilename: e.target.value })} placeholder="(optional)" style={INPUT_ST} />
        </div>
      </div>

      {/* Passphrase */}
      <div style={row}>
        <label style={LABEL_ST}>Key Passphrase</label>
        <div style={{ position: 'relative' }}>
          <input type={showPass ? 'text' : 'password'} value={gw.passphrase}
            onChange={e => onChange({ passphrase: e.target.value })}
            placeholder="(optional)" style={{ ...INPUT_ST, paddingRight: '34px' }} />
          <button type="button" onClick={() => onShowPass(p => !p)}
            style={{ position: 'absolute', right: '7px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 0, display: 'flex' }}>
            {showPass ? <EyeOff /> : <EyeOn />}
          </button>
        </div>
      </div>

      {/* Toggles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        <ToggleCard label="Reject Unauthorized" desc="Enforce TLS cert validation"
          checked={gw.rejectUnauthorized} onChange={v => onChange({ rejectUnauthorized: v })} />
        <ToggleCard label="Allow Mutations" desc="Permit write/import operations"
          checked={gw.allowMutations} onChange={v => onChange({ allowMutations: v })} />
      </div>

      {/* Delete */}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
        {deleteConfirm ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: '#fca5a5' }}>Delete <strong>"{gw.name || 'this entry'}"</strong>?</span>
            <button onClick={() => onDeleteConfirm(false)}
              style={{ padding: '4px 11px', borderRadius: '5px', fontSize: '12px', fontWeight: 600, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={onDelete}
              style={{ padding: '4px 11px', borderRadius: '5px', fontSize: '12px', fontWeight: 700, background: 'rgba(239,68,68,0.85)', border: 'none', color: '#fff', cursor: 'pointer' }}>
              Delete
            </button>
          </div>
        ) : (
          <button onClick={() => onDeleteConfirm(true)}
            style={{ padding: '5px 13px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, background: 'rgba(204,0,0,0.1)', border: '1px solid rgba(204,0,0,0.55)', color: '#CC0000', cursor: 'pointer' }}>
            Delete "{gw.name || 'this gateway'}"
          </button>
        )}
      </div>
    </div>
  )
}
