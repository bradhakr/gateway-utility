import { useState, useEffect, useCallback, useRef } from 'react'
import type { SearchResultsData, SearchResult, InputDataStats, GatewayConfig, ResultsFile, BundleFile } from '../types'

const API        = '/api'
const PAGE_COLOR = '#cc0000'
const PAGE_RGBA  = 'rgba(204,0,0,'

// ─── Gateway entry (from graphman.configuration) ──────────────────────────────

interface GatewayEntry {
  name:               string
  address:            string
  host:               string
  username:           string
  allowMutations:     boolean
  rejectUnauthorized: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9-_]/g, '_')
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ exists }: { exists: boolean }) {
  return (
    <span className={`badge ${exists ? 'badge-yes' : 'badge-no'}`}>
      {exists ? 'Yes' : 'No'}
    </span>
  )
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`badge ${type === 'Service' ? 'badge-service' : 'badge-policy'}`}>
      {type}
    </span>
  )
}

// ─── JSON Viewer Modal ─────────────────────────────────────────────────────────

interface BundleModalProps {
  name: string
  filename: string
  onClose: () => void
}

function BundleModal({ name, filename, onClose }: BundleModalProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`${API}/bundles/${encodeURIComponent(filename)}`)
      .then(async r => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({ error: r.statusText }))
          throw new Error(d.error || r.statusText)
        }
        return r.text()
      })
      .then(text => {
        try {
          setContent(JSON.stringify(JSON.parse(text), null, 2))
        } catch {
          setContent(text)
        }
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [filename])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleDownload = () => {
    if (!content) return
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,20,35,0.72)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div style={{
        background: '#fff',
        borderRadius: '8px',
        width: '100%',
        maxWidth: '860px',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Modal header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-header-bg)',
          color: '#fff',
          gap: '12px',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px', lineHeight: '1.2' }}>Bundle: {name}</div>
              <div style={{ fontSize: '11px', opacity: 0.6 }}>{filename}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            {content && (
              <button
                className="btn btn-success btn-sm"
                onClick={handleDownload}
                style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: 'none',
                color: '#fff',
                borderRadius: '4px',
                padding: '5px 10px',
                cursor: 'pointer',
                fontSize: '18px',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
              }}
              title="Close (Esc)"
            >
              ×
            </button>
          </div>
        </div>

        {/* Modal body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
              <span className="spinner spinner-dark" style={{ width: '20px', height: '20px' }} />
              <div style={{ marginTop: '10px', fontSize: '13px' }}>Loading bundle…</div>
            </div>
          )}
          {error && (
            <div style={{ padding: '20px' }}>
              <div className="alert alert-error">
                <span>✕</span>
                <div>
                  <strong>Could not load bundle</strong>
                  <div style={{ marginTop: '4px', fontSize: '12px' }}>{error}</div>
                  <div style={{ marginTop: '8px', fontSize: '12px', opacity: 0.8 }}>
                    Make sure you have clicked <strong>Export Bundles</strong> first to generate the bundle file.
                  </div>
                </div>
              </div>
            </div>
          )}
          {!loading && !error && content && (
            <pre style={{
              margin: 0,
              padding: '16px 20px',
              fontSize: '12px',
              fontFamily: "'Monaco', 'Consolas', 'Courier New', monospace",
              lineHeight: '1.65',
              color: '#C9D1D9',
              background: '#0D1117',
              minHeight: '100%',
              overflowX: 'auto',
              whiteSpace: 'pre',
              tabSize: 2,
            }}>
              {content}
            </pre>
          )}
        </div>

        {/* Modal footer */}
        {content && (
          <div style={{
            padding: '10px 20px',
            borderTop: '1px solid var(--color-border)',
            background: '#F8FAFC',
            fontSize: '11px',
            color: 'var(--color-text-secondary)',
            display: 'flex',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <span>{(content.length / 1024).toFixed(1)} KB · {content.split('\n').length} lines</span>
            <span>Click outside or press <kbd style={{ padding: '1px 5px', border: '1px solid #ccc', borderRadius: '3px', background: '#fff' }}>Esc</kbd> to close</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Editable Config ────────────────────────────────────────────────────────────

interface ConfigEditorProps {
  config: GatewayConfig
  onSave: (updated: GatewayConfig) => void
}

function ConfigEditor({ config, onSave }: ConfigEditorProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<GatewayConfig>(config)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setDraft(config) }, [config])

  const fields: { key: keyof GatewayConfig; label: string; placeholder: string }[] = [
    { key: 'sourceGateway',  label: 'Source Gateway',   placeholder: 'e.g. aws' },
    { key: 'targetGateway',  label: 'Target Gateway',   placeholder: 'e.g. aws' },
    { key: 'exportSchema',   label: 'Export Schema',    placeholder: 'e.g. v11.1.3' },
    { key: 'importSchema',   label: 'Import Schema',    placeholder: 'e.g. v11.1.3' },
    { key: 'assertionType',  label: 'Default Assertion', placeholder: 'e.g. EvaluateJsonPathExpressionV2' },
    { key: 'graphmanHome',   label: 'Graphman Home',    placeholder: '../../graphman-client-main' },
  ]

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await res.json()
      if (data.success) {
        onSave(data.config)
        setEditing(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
          </svg>
          <h3 style={{ margin: 0 }}>Configuration</h3>
          {saved && <span style={{ fontSize: '11px', color: 'var(--color-success)', fontWeight: 600 }}>✓ Saved</span>}
        </div>
        <button
          className={`btn btn-sm ${editing ? 'btn-secondary' : 'btn-outline'}`}
          onClick={() => { setEditing(!editing); setDraft(config) }}
        >
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {editing ? (
        <div>
          {fields.map(f => (
            <div key={f.key} className="form-group" style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '11px' }}>{f.label}</label>
              <input
                type="text"
                value={draft[f.key]}
                onChange={e => setDraft({ ...draft, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                style={{ fontSize: '13px' }}
              />
            </div>
          ))}
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving}
            style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}
          >
            {saving ? <><span className="spinner" /> Saving…</> : 'Save Configuration'}
          </button>
        </div>
      ) : (
        <table style={{ width: '100%', fontSize: '12px' }}>
          <tbody>
            {fields.map(f => (
              <tr key={f.key}>
                <td style={{ padding: '5px 0', color: 'var(--color-text-secondary)', width: '45%', verticalAlign: 'top' }}>
                  {f.label}
                </td>
                <td style={{ padding: '5px 0', fontWeight: 600, wordBreak: 'break-all' }} className="font-mono">
                  {config[f.key]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── Import Detail Toggle ──────────────────────────────────────────────────────

function ImportDetailToggle({ detail, ok }: { detail: string; ok: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ marginTop: '8px' }}>
      <button onClick={() => setShow(v => !v)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '11.5px', color: ok ? '#15803d' : '#b91c1c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: show ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="9 18 15 12 9 6"/></svg>
        {show ? 'Hide output' : 'Show output'}
      </button>
      {show && (
        <pre style={{ marginTop: '6px', padding: '8px 10px', borderRadius: '5px', background: 'rgba(0,0,0,0.04)', fontSize: '11px', fontFamily: 'ui-monospace,monospace', color: ok ? '#14532d' : '#7f1d1d', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '160px', overflowY: 'auto', border: `1px solid ${ok ? 'rgba(34,197,94,0.2)' : 'rgba(220,38,38,0.15)'}` }}>
          {detail}
        </pre>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function FindAssertions() {
  const [config, setConfig] = useState<GatewayConfig | null>(null)
  const [inputStats, setInputStats] = useState<InputDataStats | null>(null)
  const [assertionType, setAssertionType] = useState('')
  const [replaceEnabled, setReplaceEnabled] = useState(false)
  const [replaceDone,    setReplaceDone]    = useState(false)
  const [results, setResults] = useState<SearchResultsData | null>(null)
  const [resultFiles, setResultFiles] = useState<ResultsFile[]>([])
  const [bundles, setBundles] = useState<BundleFile[]>([])

  const [loadingSearch, setLoadingSearch] = useState(false)
  const [loadingExport, setLoadingExport] = useState(false)
  const [loadingReplace, setLoadingReplace] = useState(false)
  const [loadingImport, setLoadingImport] = useState(false)
  const [loadingData,   setLoadingData]   = useState(false)
  const [importResult, setImportResult] = useState<{
    ok: boolean; message: string; detail?: string
  } | null>(null)
  const [loadDataElapsed, setLoadDataElapsed] = useState(0)
  const [loadResult, setLoadResult] = useState<{
    ok: boolean
    message: string
    detail?: string
    hint?: string
    sizeKb?: number
    gateway?: string
    timedOut?: boolean
  } | null>(null)
  const [showLoadDetail, setShowLoadDetail] = useState(false)
  const loadAbortRef = useRef<AbortController | null>(null)

  const [searchOutput, setSearchOutput] = useState('')
  const [replaceWith, setReplaceWith] = useState('')
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  // Source gateway selector
  const [gateways, setGateways] = useState<GatewayEntry[]>([])
  const [gatewaysError, setGatewaysError] = useState('')
  const [selectedGatewayName, setSelectedGatewayName] = useState('')
  const [selectedGatewayEntry, setSelectedGatewayEntry] = useState<GatewayEntry | null>(null)

  // Bundle viewer modal
  const [modal, setModal] = useState<{ name: string; filename: string } | null>(null)

  // Filter state
  const [filterType, setFilterType] = useState<'All' | 'Service' | 'Policy'>('All')
  const [filterExists, setFilterExists] = useState<'All' | 'Yes' | 'No'>('All')
  const [filterName, setFilterName] = useState('')

  const loadInitialData = useCallback(async () => {
    try {
      const [cfgRes, statsRes, filesRes, bundlesRes] = await Promise.all([
        fetch(`${API}/config`),
        fetch(`${API}/input-data`),
        fetch(`${API}/results`),
        fetch(`${API}/bundles`),
      ])
      const cfg = await cfgRes.json()
      const stats = await statsRes.json()
      const files = await filesRes.json()
      const buns = await bundlesRes.json()
      setConfig(cfg)
      setAssertionType(prev => prev || cfg.assertionType || '')
      setInputStats(stats)
      setResultFiles(files)
      setBundles(buns)
    } catch {
      setStatusMsg({ type: 'error', text: 'Cannot reach API server. Make sure "npm run server" is running on port 3002.' })
    }
  }, [])

  useEffect(() => { loadInitialData() }, [loadInitialData])

  // Track the last sourceGateway we auto-selected so manual dropdown changes are preserved
  // until the config's sourceGateway itself changes.
  const lastAutoSelectedRef = useRef<string>('')

  // Build the dropdown exclusively from config.json (sourceGateway + targetGateway).
  // Runs whenever config changes, so saving a new gateway in the Configuration panel
  // immediately updates the list — no page reload needed.
  useEffect(() => {
    if (!config) return
    setGatewaysError('')
    const configuredNames = Array.from(
      new Set([config.sourceGateway, config.targetGateway].filter(Boolean) as string[])
    )
    if (configuredNames.length === 0) {
      setGateways([])
      setGatewaysError('No gateways configured. Set sourceGateway / targetGateway in the Configuration panel.')
      return
    }
    // Enrich with address/host details from graphman.configuration (filtered to config names only)
    fetch(`${API}/graphman-config`)
      .then(r => r.json())
      .then(d => {
        const details = d.success ? (d.gateways ?? {}) : {}
        const list: GatewayEntry[] = configuredNames.map(name => {
          const gw = details[name]
          return gw
            ? { name, ...(gw as Omit<GatewayEntry, 'name'>) }
            : { name, address: '', host: name, username: '', allowMutations: false, rejectUnauthorized: false }
        })
        setGateways(list)
        if (!d.success) {
          setGatewaysError('Gateway details unavailable (graphman.configuration not found) — names from config.json shown.')
        }
      })
      .catch(() => {
        setGateways(configuredNames.map(name => ({
          name, address: '', host: name, username: '', allowMutations: false, rejectUnauthorized: false,
        })))
        setGatewaysError('Could not load gateway details — names from config.json shown.')
      })
  }, [config])

  // Auto-select config.sourceGateway whenever it changes (e.g. after saving Configuration).
  // Once auto-selected the user may still manually choose a different gateway in the dropdown.
  useEffect(() => {
    if (!config?.sourceGateway || gateways.length === 0) return
    if (config.sourceGateway === lastAutoSelectedRef.current) return
    lastAutoSelectedRef.current = config.sourceGateway
    const match = gateways.find(g => g.name === config.sourceGateway) ?? null
    setSelectedGatewayName(config.sourceGateway)
    setSelectedGatewayEntry(match)
  }, [config?.sourceGateway, gateways])

  // Elapsed timer while loading gateway data
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>
    if (loadingData) {
      setLoadDataElapsed(0)
      timer = setInterval(() => setLoadDataElapsed(s => s + 1), 1000)
    }
    return () => clearInterval(timer)
  }, [loadingData])

  function handleGatewaySelect(name: string) {
    setStatusMsg(null)
    setLoadResult(null)
    setShowLoadDetail(false)
    if (!name) { setSelectedGatewayName(''); setSelectedGatewayEntry(null); return }
    const entry = gateways.find(g => g.name === name) ?? null
    setSelectedGatewayName(name)
    setSelectedGatewayEntry(entry)
  }

  // 65 s client-side deadline — slightly longer than the 60 s server timeout so the
  // server always gets a chance to respond with a structured error before we give up.
  const LOAD_TIMEOUT_MS = 65_000

  function cancelLoadGatewayData() {
    loadAbortRef.current?.abort()
  }

  async function handleLoadGatewayData() {
    if (!selectedGatewayName) {
      setStatusMsg({ type: 'error', text: 'Select a source gateway before loading data.' })
      return
    }

    const ac = new AbortController()
    loadAbortRef.current = ac
    const timer = setTimeout(() => ac.abort(), LOAD_TIMEOUT_MS)

    setLoadingData(true)
    setLoadResult(null)
    setShowLoadDetail(false)
    setStatusMsg(null)

    // Pick schema that matches the selected gateway's role in config.json
    const isTargetGw = selectedGatewayName === config?.targetGateway
    const gwSchema   = isTargetGw ? (config?.importSchema || config?.exportSchema) : config?.exportSchema

    try {
      const res = await fetch(`${API}/export-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway: selectedGatewayName, schema: gwSchema }),
        signal: ac.signal,
      })
      const data = await res.json()

      if (data.success) {
        const kb = data.sizeBytes ? Math.round(data.sizeBytes / 1024) : undefined
        setLoadResult({ ok: true, message: `Gateway data loaded successfully from "${selectedGatewayName}".`, sizeKb: kb, gateway: selectedGatewayName })
        await loadInitialData()
      } else {
        setLoadResult({
          ok: false,
          timedOut: data.timedOut ?? false,
          message: data.error || 'Failed to load gateway data.',
          detail: data.detail,
          hint:   data.hint,
          gateway: selectedGatewayName,
        })
      }
    } catch (err: unknown) {
      const aborted = (err as { name?: string }).name === 'AbortError'
      setLoadResult({
        ok: false,
        timedOut: true,
        message: aborted
          ? `Request to "${selectedGatewayName}" was cancelled or timed out after ${LOAD_TIMEOUT_MS / 1000}s.`
          : `Could not reach the API server. Make sure "npm run server" is running on port 3002.`,
        hint: aborted
          ? 'Check that the gateway name is correct in graphman.configuration and the host is reachable.'
          : undefined,
        gateway: selectedGatewayName,
      })
    } finally {
      clearTimeout(timer)
      setLoadingData(false)
    }
  }

  const handleSearch = async () => {
    if (!assertionType.trim()) {
      setStatusMsg({ type: 'error', text: 'Please enter an assertion type.' })
      return
    }
    setLoadingSearch(true)
    setStatusMsg(null)
    setResults(null)
    setSearchOutput('')
    try {
      const res = await fetch(`${API}/search-assertions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assertionType: assertionType.trim(), replaceEnabled }),
      })
      const data = await res.json()
      if (data.success) {
        setSearchOutput(data.stdout || '')
        setStatusMsg({ type: 'success', text: `Search complete for "${assertionType.trim()}".` })
        await loadResultFile(assertionType.trim())
        await loadInitialData()
      } else {
        setStatusMsg({ type: 'error', text: data.error || data.stderr || 'Search failed.' })
        setSearchOutput(data.stdout || data.stderr || '')
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Request failed. Is the server running?' })
    } finally {
      setLoadingSearch(false)
    }
  }

  const loadResultFile = async (assertion: string) => {
    const safe = assertion.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
    try {
      const res = await fetch(`${API}/results/${safe}-results.json`)
      if (res.ok) setResults(await res.json())
    } catch { /* ignore */ }
  }

  const handleLoadResultFile = async (filename: string) => {
    try {
      const res = await fetch(`${API}/results/${filename}`)
      if (res.ok) {
        const data = await res.json()
        setResults(data)
        setAssertionType(data.searchAssertion || '')
        setStatusMsg({ type: 'info', text: `Loaded results from ${filename}` })
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Failed to load result file.' })
    }
  }

  const handleExport = async () => {
    if (!results) { setStatusMsg({ type: 'error', text: 'Run a search first before exporting.' }); return }
    setLoadingExport(true)
    setStatusMsg(null)
    try {
      const res = await fetch(`${API}/export-bundles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway: config?.sourceGateway, schema: config?.exportSchema }),
      })
      const data = await res.json()
      if (data.success) {
        setStatusMsg({ type: 'success', text: 'Export complete. Bundle files written to generated/ directory.' })
        const bRes = await fetch(`${API}/bundles`)
        setBundles(await bRes.json())
      } else {
        setStatusMsg({ type: 'error', text: data.error || data.stderr || 'Export failed.' })
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Export request failed.' })
    } finally {
      setLoadingExport(false)
    }
  }

  const handleReplace = async () => {
    if (!replaceWith.trim()) { setStatusMsg({ type: 'error', text: 'Enter the replacement assertion name.' }); return }
    if (!results) { setStatusMsg({ type: 'error', text: 'No results loaded.' }); return }
    setLoadingReplace(true)
    setStatusMsg(null)
    const safe = results.searchAssertion.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
    try {
      const res = await fetch(`${API}/replace-assertions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resultsFile: `../Find-Assertions/response/${safe}-results.json`,
          searchAssertion: results.searchAssertion,
          replaceAssertion: replaceWith.trim(),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setReplaceDone(true)
        setStatusMsg({ type: 'success', text: `Replaced "${results.searchAssertion}" with "${replaceWith.trim()}". Backups created.` })
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Replace failed.' })
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Replace request failed.' })
    } finally {
      setLoadingReplace(false)
    }
  }

  const handleImport = async () => {
    setLoadingImport(true)
    setStatusMsg(null)
    setImportResult(null)
    try {
      const res = await fetch(`${API}/import-bundles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway: config?.targetGateway, schema: config?.importSchema }),
      })
      const data = await res.json()
      if (data.success) {
        setImportResult({
          ok: true,
          message: `All bundles imported to gateway "${config?.targetGateway || 'target'}" successfully.`,
          detail: data.stdout || '',
        })
      } else {
        setImportResult({
          ok: false,
          message: data.error || 'Import failed — check gateway connectivity and credentials.',
          detail: data.stderr || data.stdout || '',
        })
      }
    } catch {
      setImportResult({ ok: false, message: 'Import request failed — is the API server running on port 3002?' })
    } finally {
      setLoadingImport(false)
    }
  }

  const openModal = (r: SearchResult) => {
    const filename = `${sanitizeName(r.name)}.json`
    setModal({ name: r.name, filename })
  }

  // Search is only meaningful once gateway data has been loaded.
  // Warn (but don't block) if data comes from a different gateway than selected.
  const dataReady = !!(inputStats?.exists)

  const filteredResults = results?.results.filter((r: SearchResult) => {
    if (filterType !== 'All' && r.type !== filterType) return false
    if (filterExists === 'Yes' && !r.exists) return false
    if (filterExists === 'No' && r.exists) return false
    if (filterName && !r.name.toLowerCase().includes(filterName.toLowerCase())) return false
    return true
  }) ?? []

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1320px' }}>
      {modal && (
        <BundleModal
          name={modal.name}
          filename={modal.filename}
          onClose={() => setModal(null)}
        />
      )}

      <div style={{
        background: 'linear-gradient(135deg, rgba(204,0,0,0.10) 0%, rgba(204,0,0,0.03) 100%)',
        border: '1px solid rgba(204,0,0,0.20)',
        borderLeft: '4px solid #cc0000',
        borderRadius: '10px',
        padding: '20px 24px',
        marginBottom: '24px',
        boxShadow: '0 2px 14px rgba(0,0,0,0.08)',
      }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.2px' }}>
          Find Assertions
          <span style={{ fontWeight: 400, fontSize: '15px', color: 'var(--color-text-secondary)', marginLeft: '12px', letterSpacing: '0' }}>— Search and Export Policies</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '6px', marginBottom: 0 }}>
          Search Layer7 gateway services and policies for a specific assertion type, export affected bundles, and optionally replace and import them.
        </p>
      </div>

      {/* ── How It Works card ── */}
      <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          How It Works
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
          {[
            { title: 'Discover Assertion Usage',  desc: 'Load all gateway entities, search for a specific assertion type, and export affected services and policies as local JSON bundles.' },
            { title: 'Replace & Validate',         desc: <>Optional — swap the old assertion type for a new one across all exported bundles. Backups are created before any changes are written.</> },
            { title: 'Import to Target Gateway',   desc: <>Optional — push modified bundles to the target gateway. A result panel confirms success or surfaces the exact error.</> },
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
        const importDone = importResult?.ok === true
        const activeStep = !dataReady ? 1 : !results ? 2 : bundles.length === 0 ? 3 : !replaceDone ? 4 : !importDone ? 5 : 6
        const stepLabels = ['Load Data', 'Search', 'Export', 'Replace', 'Import', 'Done']
        const stepDone   = [dataReady, !!results, bundles.length > 0, replaceDone, importDone, importDone]
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

      {/* ── Source Gateway card ── */}
      <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '20px 24px', marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)', marginBottom: '14px' }}>
          Source Gateway
        </div>

        {gatewaysError && (
          <div style={{ padding: '10px 14px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626', fontSize: '13px', marginBottom: '12px' }}>
            ⚠ {gatewaysError}
          </div>
        )}

        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Gateway dropdown */}
          <div style={{ flex: '0 0 auto' }}>
            <label style={gwLabelSt}>Select Gateway</label>
            <select
              value={selectedGatewayName}
              onChange={e => handleGatewaySelect(e.target.value)}
              style={{
                background: 'var(--color-input-bg)',
                border: `1px solid ${selectedGatewayName ? 'rgba(204,0,0,0.45)' : 'var(--color-border)'}`,
                borderRadius: '6px',
                color: selectedGatewayName ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                padding: '9px 36px 9px 14px', fontSize: '13px', minWidth: '280px',
                cursor: 'pointer', appearance: 'none', outline: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23b8c5d0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
              }}
            >
              <option value="">— Select a source gateway —</option>
              {gateways.map(gw => (
                <option key={gw.name} value={gw.name}>{gw.name} — {gw.host}</option>
              ))}
            </select>
          </div>

          {/* Load Data button */}
          <div style={{ flex: '0 0 auto', paddingBottom: '1px' }}>
            <label style={{ ...gwLabelSt, opacity: 0 }}>_</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={handleLoadGatewayData}
                disabled={loadingData || !selectedGatewayName}
                style={{
                  height: '38px', display: 'flex', alignItems: 'center', gap: '7px',
                  padding: '0 18px', borderRadius: '6px', cursor: loadingData || !selectedGatewayName ? 'not-allowed' : 'pointer',
                  background: selectedGatewayName && !loadingData ? '#cc0000' : 'rgba(204,0,0,0.35)',
                  border: 'none', color: '#fff', fontSize: '13px', fontWeight: 700,
                  opacity: !selectedGatewayName ? 0.6 : 1,
                }}
              >
                {loadingData ? (
                  <>
                    <span style={{ display: 'inline-block', width: '13px', height: '13px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    Connecting… {loadDataElapsed > 0 && <span style={{ opacity: 0.85, fontSize: '11px' }}>({loadDataElapsed}s / 65s)</span>}
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                    Load Gateway Data
                  </>
                )}
              </button>

              {loadingData && (
                <button
                  onClick={cancelLoadGatewayData}
                  style={{
                    height: '38px', padding: '0 14px', borderRadius: '6px', cursor: 'pointer',
                    background: 'transparent', border: '1px solid rgba(204,0,0,0.40)',
                    color: '#cc0000', fontSize: '12px', fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Gateway detail panel */}
        {selectedGatewayEntry && (
          <div style={{ marginTop: '16px', padding: '14px 18px', borderRadius: '8px', background: 'rgba(204,0,0,0.04)', border: '1px solid rgba(204,0,0,0.18)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px 24px' }}>
            {([
              { label: 'Address',          value: selectedGatewayEntry.address,  mono: true },
              { label: 'Host',             value: selectedGatewayEntry.host,     mono: true },
              { label: 'Username',         value: selectedGatewayEntry.username, mono: false },
              { label: 'Mutations',        value: selectedGatewayEntry.allowMutations     ? '✓ Allowed'  : '✗ Not allowed',      color: selectedGatewayEntry.allowMutations     ? '#22c55e' : '#f59e0b' },
              { label: 'TLS Verification', value: selectedGatewayEntry.rejectUnauthorized ? 'Strict'     : 'Relaxed (self-signed ok)', color: selectedGatewayEntry.rejectUnauthorized ? '#22c55e' : '#f59e0b' },
            ] as { label: string; value: string; mono?: boolean; color?: string }[]).map(d => (
              <div key={d.label}>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-secondary)', marginBottom: '3px' }}>{d.label}</div>
                <div style={{ fontSize: '12.5px', fontFamily: d.mono ? 'ui-monospace, monospace' : 'inherit', color: d.color ?? 'var(--color-text-primary)', wordBreak: 'break-all' }}>{d.value || '—'}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Load result panel — always visible inside the card ── */}
        {loadResult && (
          <div style={{
            marginTop: '16px',
            borderRadius: '8px',
            border: `1px solid ${loadResult.ok ? 'rgba(34,197,94,0.35)' : 'rgba(220,38,38,0.35)'}`,
            background: loadResult.ok ? 'rgba(34,197,94,0.06)' : 'rgba(220,38,38,0.06)',
            overflow: 'hidden',
          }}>
            {/* Result header */}
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{
                flexShrink: 0, width: '22px', height: '22px', borderRadius: '50%',
                background: loadResult.ok ? '#22c55e' : '#dc2626',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {loadResult.ok
                  ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                }
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: loadResult.ok ? '#15803d' : '#b91c1c', marginBottom: '3px' }}>
                  {loadResult.ok ? 'Data loaded successfully' : (loadResult.timedOut ? 'Gateway unreachable' : 'Load failed')}
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                  {loadResult.message}
                  {loadResult.ok && loadResult.sizeKb && (
                    <span style={{ marginLeft: '8px', padding: '1px 7px', borderRadius: '10px', background: 'rgba(34,197,94,0.12)', color: '#15803d', fontSize: '11px', fontWeight: 600 }}>
                      {loadResult.sizeKb} KB
                    </span>
                  )}
                </div>
                {/* Hint */}
                {!loadResult.ok && loadResult.hint && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#b45309', padding: '6px 10px', borderRadius: '5px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
                    💡 {loadResult.hint}
                  </div>
                )}
                {/* Detail toggle */}
                {!loadResult.ok && loadResult.detail && (
                  <div style={{ marginTop: '8px' }}>
                    <button
                      onClick={() => setShowLoadDetail(v => !v)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '11.5px', color: '#b91c1c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: showLoadDetail ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                      {showLoadDetail ? 'Hide detail' : 'Show detail'}
                    </button>
                    {showLoadDetail && (
                      <pre style={{ marginTop: '6px', padding: '10px 12px', borderRadius: '6px', background: 'rgba(0,0,0,0.04)', fontSize: '11px', fontFamily: 'ui-monospace, monospace', color: '#7f1d1d', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '160px', overflowY: 'auto', border: '1px solid rgba(220,38,38,0.15)' }}>
                        {loadResult.detail}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stale-data warning (no loadResult shown yet or previous result was success) */}
        {!loadResult && inputStats?.exists && selectedGatewayEntry && inputStats.hostname !== selectedGatewayEntry.host && (
          <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '6px', background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)', color: '#b45309', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Loaded data is from <strong style={{ margin: '0 3px' }}>{inputStats.hostname}</strong> but selected gateway is <strong style={{ marginLeft: '3px' }}>{selectedGatewayEntry.host}</strong>. Click <strong style={{ marginLeft: '3px' }}>Load Gateway Data</strong> to refresh.
          </div>
        )}

        {!loadResult && !inputStats?.exists && (
          <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '6px', background: 'rgba(204,0,0,0.06)', border: '1px solid rgba(204,0,0,0.20)', color: '#b91c1c', fontSize: '12px' }}>
            No gateway data loaded yet. Select a gateway and click <strong>Load Gateway Data</strong> to fetch all services and policies before searching.
          </div>
        )}
      </div>

      {statusMsg && (
        <div className={`alert alert-${statusMsg.type}`} style={{ marginBottom: '16px' }}>
          <span>{statusMsg.type === 'error' ? '✕' : statusMsg.type === 'success' ? '✓' : 'ℹ'}</span>
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* ── Bundle Summary Stats ── */}
      {inputStats && (
        <div className="stats-row" style={{ marginBottom: '20px' }}>
          <div className="stat-card">
            <div className="stat-value">{inputStats.exists ? inputStats.services : '—'}</div>
            <div className="stat-label">Services in Bundle</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{inputStats.exists ? inputStats.policies : '—'}</div>
            <div className="stat-label">Policies in Bundle</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{inputStats.exists ? inputStats.total : '—'}</div>
            <div className="stat-label">Total Items</div>
          </div>
          <div className="stat-card" style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Gateway Host</div>
            <div className="font-mono" style={{ fontSize: '12px', fontWeight: 600, wordBreak: 'break-all' }}>
              {inputStats.exists ? inputStats.hostname : 'No bundle data loaded'}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 272px', gap: '20px', alignItems: 'start' }}>

        {/* ── Main Column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Search Card */}
          <div className="card">
            <div className="card-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <h2 style={{ margin: 0 }}>Search Assertions</h2>
            </div>

            {!dataReady && (
              <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '6px', background: 'rgba(204,0,0,0.06)', border: '1px solid rgba(204,0,0,0.20)', color: '#b91c1c', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Step 1 required: select a gateway above and click <strong style={{ marginLeft: '3px' }}>Load Gateway Data</strong> before searching.
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: '1 1 260px', marginBottom: 0 }}>
                <label htmlFor="assertionType">Assertion Type</label>
                <input
                  id="assertionType"
                  type="text"
                  value={assertionType}
                  onChange={e => setAssertionType(e.target.value)}
                  placeholder="e.g. EvaluateJsonPathExpressionV2"
                  onKeyDown={e => { if (e.key === 'Enter' && dataReady) handleSearch() }}
                  disabled={!dataReady}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={handleSearch}
                disabled={loadingSearch || !assertionType.trim() || !dataReady}
                title={!dataReady ? 'Load gateway data first (Step 1)' : ''}
              >
                {loadingSearch ? <><span className="spinner" /> Searching…</> : 'Search'}
              </button>
              <button className="btn btn-success" onClick={handleExport} disabled={loadingExport || !results}>
                {loadingExport ? <><span className="spinner" /> Exporting…</> : 'Export Bundles'}
              </button>
            </div>

            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="replaceEnabled"
                checked={replaceEnabled}
                onChange={e => setReplaceEnabled(e.target.checked)}
                style={{ width: 'auto' }}
              />
              <label htmlFor="replaceEnabled" style={{ cursor: 'pointer', userSelect: 'none', marginBottom: 0 }}>
                Enable Replace &amp; Import controls
              </label>
            </div>

            {replaceEnabled && (
              <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
                <div className="alert alert-warning" style={{ marginBottom: '12px', fontSize: '12px' }}>
                  <span>⚠</span>
                  <span><strong>Caution:</strong> Intended for lower environments only. Ensure proper testing before importing to production.</span>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                    <label htmlFor="replaceWith">Replace Assertion With</label>
                    <input
                      id="replaceWith"
                      type="text"
                      value={replaceWith}
                      onChange={e => setReplaceWith(e.target.value)}
                      placeholder="e.g. EvaluateJsonPathExpressionV3"
                    />
                  </div>
                  <button className="btn btn-danger" onClick={handleReplace} disabled={loadingReplace || !results}>
                    {loadingReplace ? <><span className="spinner" /> Replacing…</> : 'Replace Assertions'}
                  </button>
                  <button className="btn btn-success" onClick={handleImport} disabled={loadingImport}>
                    {loadingImport ? <><span className="spinner" /> Importing…</> : 'Import Bundles'}
                  </button>
                </div>

                {/* Import result panel */}
                {importResult && (
                  <div style={{ marginTop: '14px', borderRadius: '8px', border: `1px solid ${importResult.ok ? 'rgba(34,197,94,0.35)' : 'rgba(220,38,38,0.35)'}`, background: importResult.ok ? 'rgba(34,197,94,0.06)' : 'rgba(220,38,38,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ flexShrink: 0, width: '20px', height: '20px', borderRadius: '50%', background: importResult.ok ? '#22c55e' : '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {importResult.ok
                          ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: importResult.ok ? '#15803d' : '#b91c1c' }}>
                          {importResult.ok ? 'Import successful' : 'Import failed'}
                        </div>
                        <div style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{importResult.message}</div>
                        {importResult.detail && <ImportDetailToggle detail={importResult.detail} ok={importResult.ok} />}
                      </div>
                      <button onClick={() => setImportResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '18px', lineHeight: 1, opacity: 0.5 }}>×</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Results Table */}
          {results && (
            <div className="card">
              {/* Card title row */}
              <div className="card-header" style={{ marginBottom: '12px' }}>
                <h2 style={{ margin: 0 }}>Results</h2>
                <span className="badge badge-service" style={{ marginLeft: '6px' }}>{results.searchAssertion}</span>
                <span className="text-muted text-sm" style={{ marginLeft: 'auto' }}>
                  {new Date(results.timestamp).toLocaleString()}
                </span>
              </div>

              {/* ── Horizontal stats strip ── */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '1px',
                background: 'var(--color-border)',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                overflow: 'hidden',
                marginBottom: '14px',
              }}>
                {[
                  { value: results.totalItems,        label: 'Total Items',   color: 'var(--color-accent-blue)' },
                  { value: results.totalServices,      label: 'Services',      color: 'var(--color-accent-blue)' },
                  { value: results.totalPolicies,      label: 'Policies',      color: 'var(--color-accent-blue)' },
                  { value: results.itemsWithAssertion, label: 'With Assertion',color: results.itemsWithAssertion > 0 ? 'var(--color-success)' : 'var(--color-text-secondary)' },
                ].map(s => (
                  <div key={s.label} style={{
                    background: '#fff',
                    padding: '12px 16px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: s.color, lineHeight: 1.1 }}>
                      {s.value}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '3px' }}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
                Gateway: <strong className="font-mono">{results.hostname}</strong>
                {bundles.length > 0 && (
                  <span style={{ marginLeft: '12px' }}>
                    · <span style={{ color: 'var(--color-accent-blue)', fontWeight: 500 }}>
                      Click a highlighted name to view its bundle JSON
                    </span>
                  </span>
                )}
              </div>

              {/* Filters */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={filterType} onChange={e => setFilterType(e.target.value as typeof filterType)} style={{ width: 'auto' }}>
                  <option value="All">All Types</option>
                  <option value="Service">Service</option>
                  <option value="Policy">Policy</option>
                </select>
                <select value={filterExists} onChange={e => setFilterExists(e.target.value as typeof filterExists)} style={{ width: 'auto' }}>
                  <option value="All">All Results</option>
                  <option value="Yes">Has Assertion</option>
                  <option value="No">No Assertion</option>
                </select>
                <input
                  type="search"
                  value={filterName}
                  onChange={e => setFilterName(e.target.value)}
                  placeholder="Filter by name…"
                  style={{ flex: '1 1 140px', minWidth: '120px' }}
                />
                <span className="text-muted text-sm">
                  {filteredResults.length} / {results.results.length} rows
                </span>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th style={{ width: '80px' }}>Type</th>
                      <th>Name</th>
                      <th>Resolution Path</th>
                      <th>Folder Path</th>
                      <th style={{ width: '110px' }}>Assertion Found</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-secondary)' }}>
                          No items match the current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredResults.map((r, i) => (
                        <tr key={i} className={r.exists ? 'row-yes' : 'row-no'}>
                          <td style={{ color: 'var(--color-text-secondary)' }}>{i + 1}</td>
                          <td><TypeBadge type={r.type} /></td>
                          <td>
                            {r.exists ? (
                              <button
                                onClick={() => openModal(r)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  cursor: 'pointer',
                                  color: 'var(--color-accent-blue)',
                                  fontWeight: 600,
                                  fontSize: 'inherit',
                                  textDecoration: 'underline',
                                  textDecorationStyle: 'dotted',
                                  textUnderlineOffset: '3px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                }}
                                title={`View bundle JSON for ${r.name}`}
                              >
                                {r.name}
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.6 }}>
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                                </svg>
                              </button>
                            ) : (
                              <span style={{ color: 'var(--color-text-secondary)' }}>{r.name}</span>
                            )}
                          </td>
                          <td className="font-mono" style={{ fontSize: '12px' }}>{r.resolutionPath}</td>
                          <td className="font-mono" style={{ fontSize: '12px' }}>{r.folderPath}</td>
                          <td><StatusBadge exists={r.exists} /></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {results.itemsWithAssertion > 0 && bundles.length === 0 && (
                <div className="alert alert-info" style={{ marginTop: '12px', fontSize: '12px' }}>
                  <span>ℹ</span>
                  <span>
                    <strong>{results.itemsWithAssertion} item{results.itemsWithAssertion !== 1 ? 's' : ''} found.</strong>
                    {' '}Click <strong>Export Bundles</strong> above to generate bundle files, then click the service/policy names to view their JSON content.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Script Output */}
          {searchOutput && (
            <div className="card">
              <div className="card-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
                </svg>
                <h3 style={{ margin: 0 }}>Script Output</h3>
              </div>
              <pre style={{
                background: '#0D1117', color: '#C9D1D9',
                padding: '14px', borderRadius: '4px',
                fontSize: '12px', fontFamily: "'Monaco', 'Consolas', monospace",
                overflowX: 'auto', maxHeight: '280px', overflowY: 'auto',
                lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {searchOutput}
              </pre>
            </div>
          )}
        </div>

        {/* ── Right Column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Editable Config */}
          {config && (
            <ConfigEditor
              config={config}
              onSave={updated => setConfig(updated)}
            />
          )}

          {/* Previous Results */}
          {resultFiles.length > 0 && (
            <div className="card">
              <div className="card-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <h3 style={{ margin: 0 }}>Previous Results</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {resultFiles.map(f => (
                  <button
                    key={f.name}
                    className="btn btn-outline btn-sm"
                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                    onClick={() => handleLoadResultFile(f.name)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.name.replace('-results.json', '')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Generated Bundles */}
          {bundles.length > 0 && (
            <div className="card">
              <div className="card-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                </svg>
                <h3 style={{ margin: 0 }}>Exported Bundles</h3>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                {bundles.length} file{bundles.length !== 1 ? 's' : ''} in generated/
              </div>
              <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {bundles.map(b => (
                  <button
                    key={b.name}
                    onClick={() => setModal({ name: b.name.replace('.json', ''), filename: b.name })}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '5px 6px',
                      border: '1px solid transparent',
                      borderRadius: '4px',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: '12px',
                      textAlign: 'left',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#EFF6FF')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span className="font-mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, color: 'var(--color-accent-blue)' }}>
                      {b.name}
                    </span>
                    <span style={{ marginLeft: '8px', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                      {(b.size / 1024).toFixed(1)}KB
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

const gwLabelSt: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--color-text-secondary)',
  marginBottom: '6px',
}
