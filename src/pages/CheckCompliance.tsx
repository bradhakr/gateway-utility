import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  EncassConfig,
  EncassConfigsResponse,
  EncassComplianceReport,
  ComplianceRow,
  GatewayConfig,
} from '../types'

const API = '/api'
const PAGE_COLOR = '#1d4ed8'
const PAGE_RGBA  = 'rgba(29,78,216,'

// ─── Gateway entry (from graphman.configuration) ──────────────────────────────

interface GatewayEntry {
  name:               string
  address:            string
  host:               string
  username:           string
  allowMutations:     boolean
  rejectUnauthorized: boolean
}

function GatewayDetail({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-secondary)', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '12.5px', fontFamily: mono ? 'ui-monospace, monospace' : 'inherit', color: color ?? 'var(--color-text-primary)', wordBreak: 'break-all' }}>{value || '—'}</div>
    </div>
  )
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function ComplianceBadge({ compliant }: { compliant: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: '20px',
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '0.3px',
      background: compliant ? '#D1FAE5' : '#FEE2E2',
      color: compliant ? '#065F46' : '#991B1B',
      border: `1px solid ${compliant ? '#6EE7B7' : '#FECACA'}`,
    }}>
      {compliant ? 'Compliant' : 'Not Compliant'}
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

// ─── Inline Export Panel ───────────────────────────────────────────────────────

interface ExportPanelProps {
  gatewayName: string
  config: GatewayConfig | null
  graphmanSchema?: string
  onSuccess: () => void
}

interface ExportResult {
  success: boolean
  message: string
  detail?: string
  hint?: string
}

const EXPORT_TIMEOUT_MS = 65_000

function ExportPanel({ gatewayName, config, graphmanSchema, onSuccess }: ExportPanelProps) {
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [output, setOutput] = useState<ExportResult | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const effectiveGateway = gatewayName || config?.sourceGateway || ''

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>
    if (loading) { setElapsed(0); timer = setInterval(() => setElapsed(s => s + 1), 1000) }
    return () => clearInterval(timer)
  }, [loading])

  const handleExport = async () => {
    if (!effectiveGateway) return
    const ac = new AbortController()
    abortRef.current = ac
    const timer = setTimeout(() => ac.abort(), EXPORT_TIMEOUT_MS)
    setLoading(true); setOutput(null); setShowDetail(false)
    try {
      const res = await fetch(`${API}/export-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway: effectiveGateway, schema: graphmanSchema || config?.exportSchema }),
        signal: ac.signal,
      })
      const data = await res.json()
      if (data.success) {
        const kb = data.sizeBytes ? ` (${(data.sizeBytes / 1024).toFixed(0)} KB)` : ''
        setOutput({ success: true, message: `Gateway data loaded successfully${kb}.` })
        setTimeout(onSuccess, 800)
      } else {
        setOutput({ success: false, message: data.error || 'Export failed.', detail: data.detail || '', hint: data.hint || '' })
      }
    } catch (err: unknown) {
      const aborted = (err as { name?: string }).name === 'AbortError'
      setOutput({
        success: false,
        message: aborted
          ? `Gateway "${effectiveGateway}" did not respond within ${EXPORT_TIMEOUT_MS / 1000}s — it may be unreachable.`
          : 'Request failed — is the API server running on port 3002?',
        hint: aborted ? 'Verify the gateway name in graphman.configuration and check network connectivity.' : undefined,
      })
    } finally {
      clearTimeout(timer); setLoading(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--color-card-bg)' }}>
      <div style={{ background: 'var(--color-header-bg)', color: '#fff', padding: '20px 24px', borderBottom: `3px solid ${PAGE_COLOR}` }}>
        <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Gateway data not loaded</div>
        <div style={{ fontSize: '12px', opacity: 0.7 }}>
          <code>spFolderSVCFull.json</code> was not found. Select a gateway above and load its data to begin compliance checking.
        </div>
      </div>

      <div style={{ padding: '20px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', fontSize: '12px', marginBottom: '16px', padding: '12px 14px', background: '#F8FAFC', borderRadius: '5px', border: '1px solid var(--color-border)' }}>
          <div><span style={{ color: 'var(--color-text-secondary)' }}>Gateway: </span><strong className="font-mono">{effectiveGateway || '—'}</strong></div>
          <div><span style={{ color: 'var(--color-text-secondary)' }}>Schema: </span><strong className="font-mono">{graphmanSchema || config?.exportSchema || '—'}</strong></div>
          <div style={{ gridColumn: '1 / -1' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>Command: </span>
            <code style={{ fontSize: '11px' }}>graphman.sh export --gateway {effectiveGateway || '<select gateway>'} --using all</code>
          </div>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '16px', lineHeight: '1.7' }}>
          This will export <strong>all</strong> services, policies, encass configs, and other gateway entities into a local bundle file. Timeout: 65 s.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleExport} disabled={loading || !effectiveGateway} style={{ fontSize: '14px', padding: '10px 22px' }}>
            {loading
              ? <><span className="spinner" />Connecting… {elapsed > 0 && <span style={{ opacity: 0.8, fontSize: '12px' }}>({elapsed}s / 65s)</span>}</>
              : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="21" x2="12" y2="3"/></svg>Load Gateway Data</>}
          </button>
          {loading && (
            <button onClick={() => abortRef.current?.abort()}
              style={{ padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', background: 'transparent', border: `1px solid ${PAGE_RGBA}0.4)`, color: PAGE_COLOR, fontSize: '13px', fontWeight: 600 }}>
              Cancel
            </button>
          )}
          {!effectiveGateway && <span style={{ fontSize: '12px', color: '#f59e0b' }}>Select a gateway above to enable loading.</span>}
        </div>

        {output && (
          <div style={{ marginTop: '14px', borderRadius: '8px', border: `1px solid ${output.success ? 'rgba(34,197,94,0.35)' : 'rgba(220,38,38,0.35)'}`, background: output.success ? 'rgba(34,197,94,0.06)' : 'rgba(220,38,38,0.06)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ flexShrink: 0, width: '20px', height: '20px', borderRadius: '50%', background: output.success ? '#22c55e' : '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {output.success
                  ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: output.success ? '#15803d' : '#b91c1c' }}>{output.success ? 'Data loaded' : 'Load failed'}</div>
                <div style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{output.message}</div>
                {output.hint && <div style={{ marginTop: '6px', fontSize: '12px', color: '#b45309', padding: '5px 10px', borderRadius: '5px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>💡 {output.hint}</div>}
                {output.detail && (
                  <div style={{ marginTop: '8px' }}>
                    <button onClick={() => setShowDetail(v => !v)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '11.5px', color: '#b91c1c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: showDetail ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="9 18 15 12 9 6"/></svg>
                      {showDetail ? 'Hide detail' : 'Show detail'}
                    </button>
                    {showDetail && <pre style={{ marginTop: '6px', padding: '8px 10px', borderRadius: '5px', background: 'rgba(0,0,0,0.04)', fontSize: '11px', fontFamily: 'ui-monospace,monospace', color: '#7f1d1d', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '140px', overflowY: 'auto', border: '1px solid rgba(220,38,38,0.15)' }}>{output.detail}</pre>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CheckCompliance() {
  const [config, setConfig] = useState<GatewayConfig | null>(null)
  const [encassConfigs, setEncassConfigs] = useState<EncassConfig[]>([])
  const [hostname, setHostname] = useState<string>('N/A')
  const [dataExists, setDataExists] = useState<boolean | null>(null)

  const [selectedEncass, setSelectedEncass] = useState<string>('')
  const [selectedMeta, setSelectedMeta] = useState<EncassConfig | null>(null)

  const [running, setRunning] = useState(false)
  const [refreshingData, setRefreshingData] = useState(false)
  const [refreshElapsed, setRefreshElapsed] = useState(0)
  const [report, setReport] = useState<EncassComplianceReport | null>(null)
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [refreshResult, setRefreshResult] = useState<{ ok: boolean; message: string; hint?: string; detail?: string } | null>(null)
  const [showRefreshDetail, setShowRefreshDetail] = useState(false)
  const refreshAbortRef = useRef<AbortController | null>(null)

  // Schema from graphman.configuration — authoritative source for this page
  const [graphmanSchema, setGraphmanSchema] = useState('')

  // Gateway selector state
  const [gateways, setGateways] = useState<GatewayEntry[]>([])
  const [gatewaysError, setGatewaysError] = useState('')
  const [selectedGatewayName, setSelectedGatewayName] = useState('')
  const [selectedGatewayEntry, setSelectedGatewayEntry] = useState<GatewayEntry | null>(null)

  // Filter state
  const [filterType, setFilterType] = useState<'All' | 'Service' | 'Policy'>('All')
  const [filterCompliance, setFilterCompliance] = useState<'All' | 'Compliant' | 'Not Compliant'>('All')
  const [filterName, setFilterName] = useState('')

  const loadEncassConfigs = useCallback(async () => {
    try {
      const [cfgRes, encassRes] = await Promise.all([
        fetch(`${API}/config`),
        fetch(`${API}/encass-configs`),
      ])
      const cfg = await cfgRes.json()
      const d: EncassConfigsResponse = await encassRes.json()
      setConfig(cfg)
      setDataExists(d.exists)
      if (d.exists) {
        setEncassConfigs(d.configs)
        setHostname(d.hostname)
        if (d.configs.length > 0 && !selectedEncass) {
          setSelectedEncass(d.configs[0].name)
          setSelectedMeta(d.configs[0])
        }
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Cannot reach API server on port 3002.' })
    }
  }, [selectedEncass])

  // Load gateways + schema from graphman.configuration
  useEffect(() => {
    fetch('/api/graphman-config')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.gateways) {
          const list: GatewayEntry[] = Object.entries(d.gateways).map(
            ([name, gw]) => ({ name, ...(gw as Omit<GatewayEntry, 'name'>) })
          )
          setGateways(list)
          if (d.options?.schema) setGraphmanSchema(d.options.schema)
        } else {
          setGatewaysError(d.error ?? 'Could not load gateway configuration.')
        }
      })
      .catch(() => setGatewaysError('Could not reach the API server.'))
  }, [])

  // Pre-select gateway from config once both are loaded
  useEffect(() => {
    if (config?.sourceGateway && gateways.length > 0 && !selectedGatewayName) {
      const match = gateways.find(g => g.name === config.sourceGateway)
      if (match) { setSelectedGatewayName(match.name); setSelectedGatewayEntry(match) }
    }
  }, [config, gateways, selectedGatewayName])

  useEffect(() => { loadEncassConfigs() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Elapsed timer for Refresh Data
  useEffect(() => {
    let t: ReturnType<typeof setInterval>
    if (refreshingData) { setRefreshElapsed(0); t = setInterval(() => setRefreshElapsed(s => s + 1), 1000) }
    return () => clearInterval(t)
  }, [refreshingData])

  function handleGatewaySelect(name: string) {
    setReport(null)
    setStatusMsg(null)
    setRefreshResult(null)
    if (!name) { setSelectedGatewayName(''); setSelectedGatewayEntry(null); return }
    const entry = gateways.find(g => g.name === name) ?? null
    setSelectedGatewayName(name)
    setSelectedGatewayEntry(entry)
  }

  const handleSelectChange = (name: string) => {
    setSelectedEncass(name)
    setSelectedMeta(encassConfigs.find(e => e.name === name) ?? null)
    setReport(null)
    setStatusMsg(null)
  }

  const handleRun = async () => {
    if (!selectedEncass) {
      setStatusMsg({ type: 'error', text: 'Select an Encapsulated Assertion to check.' })
      return
    }
    setRunning(true)
    setReport(null)
    setStatusMsg(null)
    setFilterName('')
    setFilterType('All')
    setFilterCompliance('All')

    try {
      const res = await fetch(`${API}/encass-compliance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encassName: selectedEncass }),
      })
      const data: EncassComplianceReport = await res.json()
      if (data.success) {
        setReport(data)
        setStatusMsg({
          type: data.compliantCount > 0 ? 'success' : 'info',
          text: `${data.compliantCount} of ${data.totalItems} items use "${selectedEncass}" — ${data.nonCompliantCount} not compliant.`,
        })
      } else {
        setStatusMsg({ type: 'error', text: (data as { error?: string }).error || 'Compliance check failed.' })
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Request failed. Is the server running?' })
    } finally {
      setRunning(false)
    }
  }

  const handleRefreshData = async () => {
    const gateway = selectedGatewayName || config?.sourceGateway || ''
    if (!gateway) {
      setRefreshResult({ ok: false, message: 'Select a gateway before refreshing data.' })
      return
    }
    const ac = new AbortController()
    refreshAbortRef.current = ac
    const timer = setTimeout(() => ac.abort(), EXPORT_TIMEOUT_MS)
    setRefreshingData(true); setReport(null); setStatusMsg(null); setRefreshResult(null); setShowRefreshDetail(false)
    try {
      const res = await fetch(`${API}/export-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway, schema: graphmanSchema || config?.exportSchema }),
        signal: ac.signal,
      })
      const data = await res.json()
      if (data.success) {
        const kb = data.sizeBytes ? ` (${(data.sizeBytes / 1024).toFixed(0)} KB)` : ''
        setRefreshResult({ ok: true, message: `Gateway data refreshed successfully${kb}.` })
        await loadEncassConfigs()
      } else {
        setRefreshResult({ ok: false, message: data.error || 'Refresh failed.', hint: data.hint || '', detail: data.detail || '' })
      }
    } catch (err: unknown) {
      const aborted = (err as { name?: string }).name === 'AbortError'
      setRefreshResult({
        ok: false,
        message: aborted
          ? `Gateway "${gateway}" did not respond within ${EXPORT_TIMEOUT_MS / 1000}s — it may be unreachable or overloaded.`
          : 'Refresh failed — is the API server running on port 3002?',
        hint: aborted ? 'Verify the gateway name in config.json and check network connectivity.' : undefined,
      })
    } finally {
      clearTimeout(timer); setRefreshingData(false)
    }
  }

  const filtered = report?.results.filter((r: ComplianceRow) => {
    if (filterType !== 'All' && r.type !== filterType) return false
    if (filterCompliance === 'Compliant' && !r.compliant) return false
    if (filterCompliance === 'Not Compliant' && r.compliant) return false
    if (filterName && !r.name.toLowerCase().includes(filterName.toLowerCase())) return false
    return true
  }) ?? []

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1320px' }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(29,78,216,0.10) 0%, rgba(29,78,216,0.03) 100%)',
        border: '1px solid rgba(29,78,216,0.20)',
        borderLeft: '4px solid #1d4ed8',
        borderRadius: '10px',
        padding: '20px 24px',
        marginBottom: '24px',
        boxShadow: '0 2px 14px rgba(0,0,0,0.08)',
      }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.2px' }}>
          Check Compliance
          <span style={{ fontWeight: 400, fontSize: '15px', color: 'var(--color-text-secondary)', marginLeft: '12px', letterSpacing: '0' }}>— Audit Encapsulated Assertion Usage</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '6px', marginBottom: 0 }}>
          Verify which services and policies invoke a selected Encapsulated Assertion.
          Items that use it are <strong style={{ color: '#065F46' }}>Compliant</strong>; those that don't are <strong style={{ color: '#991B1B' }}>Not Compliant</strong>.
        </p>
      </div>

      {/* ── How It Works — horizontal card ── */}
      <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          How It Works
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
          {[
            { title: 'Select & Load Gateway',        desc: 'Choose a gateway from the dropdown and load its services, policies, and encass configs into a local snapshot.' },
            { title: 'Select Encapsulated Assertion', desc: 'Pick an Encass from the list. The tool scans every service and policy to check whether it invokes that Encass.' },
            { title: 'Review Compliance Results',     desc: <>Items that invoke the Encass are <strong style={{ color: '#065F46' }}>Compliant</strong>; those that don't are <strong style={{ color: '#991B1B' }}>Not Compliant</strong>. Filter, sort, and export the report.</> },
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
        const stepLabels = ['Select Gateway', 'Load Data', 'Select Encass', 'View Results']
        const stepDone   = [!!selectedGatewayName, dataExists === true, !!selectedEncass, !!report]
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

      {/* ── Gateway selector card ── */}
      <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '20px 24px', marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)', marginBottom: '14px' }}>
          Select a Gateway for Compliance Check
        </div>

        {gatewaysError && (
          <div style={{ padding: '10px 14px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626', fontSize: '13px', marginBottom: '12px' }}>
            ⚠ {gatewaysError}
          </div>
        )}

        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '0 0 auto' }}>
            <label style={labelSt}>Select Gateway</label>
            <select
              value={selectedGatewayName}
              onChange={e => handleGatewaySelect(e.target.value)}
              style={{
                background: 'var(--color-input-bg)',
                border: `1px solid ${selectedGatewayName ? `${PAGE_RGBA}0.45)` : 'var(--color-border)'}`,
                borderRadius: '6px',
                color: selectedGatewayName ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                padding: '9px 36px 9px 14px', fontSize: '13px', minWidth: '280px',
                cursor: 'pointer', appearance: 'none', outline: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23b8c5d0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
              }}
            >
              <option value="">— Select a gateway to load data from —</option>
              {gateways.map(gw => (
                <option key={gw.name} value={gw.name}>{gw.name} — {gw.host}</option>
              ))}
            </select>
          </div>

          {/* Refresh Data button inline with the selector */}
          {dataExists === true && (
            <div style={{ flex: '0 0 auto', paddingBottom: '1px', display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
              <div>
                <label style={{ ...labelSt, opacity: 0 }}>_</label>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={handleRefreshData}
                  disabled={refreshingData || !selectedGatewayName}
                  style={{ height: '38px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {refreshingData
                    ? <><span className="spinner spinner-dark" style={{ width: '11px', height: '11px', borderWidth: '1.5px' }} />Refreshing… {refreshElapsed > 0 && <span style={{ fontSize: '11px', opacity: 0.75 }}>({refreshElapsed}s / 65s)</span>}</>
                    : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Refresh Data</>}
                </button>
              </div>
              {refreshingData && (
                <button onClick={() => refreshAbortRef.current?.abort()}
                  style={{ height: '38px', padding: '0 14px', borderRadius: '6px', cursor: 'pointer', background: 'transparent', border: `1px solid ${PAGE_RGBA}0.4)`, color: PAGE_COLOR, fontSize: '12px', fontWeight: 600 }}>
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>

        {/* Gateway detail panel */}
        {selectedGatewayEntry && (
          <div style={{ marginTop: '16px', padding: '14px 18px', borderRadius: '8px', background: `${PAGE_RGBA}0.05)`, border: `1px solid ${PAGE_RGBA}0.20)`, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px 24px' }}>
            <GatewayDetail label="Address"        value={selectedGatewayEntry.address}  mono />
            <GatewayDetail label="Host"           value={selectedGatewayEntry.host}     mono />
            <GatewayDetail label="Username"       value={selectedGatewayEntry.username} />
            <GatewayDetail label="Mutations"      value={selectedGatewayEntry.allowMutations     ? '✓ Allowed' : '✗ Not allowed'} color={selectedGatewayEntry.allowMutations     ? '#22c55e' : '#f59e0b'} />
            <GatewayDetail label="TLS Verification" value={selectedGatewayEntry.rejectUnauthorized ? 'Strict'    : 'Relaxed (self-signed ok)'} color={selectedGatewayEntry.rejectUnauthorized ? '#22c55e' : '#f59e0b'} />
          </div>
        )}

        {/* Inline result panel for Refresh Data */}
        {refreshResult && (
          <div style={{ marginTop: '14px', borderRadius: '8px', border: `1px solid ${refreshResult.ok ? 'rgba(34,197,94,0.35)' : 'rgba(220,38,38,0.35)'}`, background: refreshResult.ok ? 'rgba(34,197,94,0.06)' : 'rgba(220,38,38,0.06)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ flexShrink: 0, width: '20px', height: '20px', borderRadius: '50%', background: refreshResult.ok ? '#22c55e' : '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {refreshResult.ok
                  ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: refreshResult.ok ? '#15803d' : '#b91c1c' }}>{refreshResult.ok ? 'Data refreshed' : 'Refresh failed'}</div>
                <div style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{refreshResult.message}</div>
                {refreshResult.hint && <div style={{ marginTop: '6px', fontSize: '12px', color: '#b45309', padding: '5px 10px', borderRadius: '5px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>💡 {refreshResult.hint}</div>}
                {refreshResult.detail && (
                  <div style={{ marginTop: '8px' }}>
                    <button onClick={() => setShowRefreshDetail(v => !v)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '11.5px', color: '#b91c1c', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: showRefreshDetail ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="9 18 15 12 9 6"/></svg>
                      {showRefreshDetail ? 'Hide detail' : 'Show detail'}
                    </button>
                    {showRefreshDetail && <pre style={{ marginTop: '6px', padding: '8px 10px', borderRadius: '5px', background: 'rgba(0,0,0,0.04)', fontSize: '11px', fontFamily: 'ui-monospace,monospace', color: '#7f1d1d', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '140px', overflowY: 'auto', border: '1px solid rgba(220,38,38,0.15)' }}>{refreshResult.detail}</pre>}
                  </div>
                )}
              </div>
              <button onClick={() => setRefreshResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '18px', lineHeight: 1, opacity: 0.5, padding: '0 2px' }}>×</button>
            </div>
          </div>
        )}
      </div>

      {statusMsg && (
        <div className={`alert alert-${statusMsg.type}`} style={{ marginBottom: '16px' }}>
          <span>{statusMsg.type === 'error' ? '✕' : statusMsg.type === 'success' ? '✓' : 'ℹ'}</span>
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* ── Loading state ── */}
      {dataExists === null && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-text-secondary)' }}>
          <span className="spinner spinner-dark" style={{ width: '24px', height: '24px' }} />
          <div style={{ marginTop: '14px', fontSize: '13px' }}>Checking gateway data…</div>
        </div>
      )}

      {/* ── No data — show export panel ── */}
      {dataExists === false && (
        <ExportPanel
          gatewayName={selectedGatewayName}
          config={config}
          graphmanSchema={graphmanSchema}
          onSuccess={() => {
            setDataExists(null)
            loadEncassConfigs()
          }}
        />
      )}

      {/* ── Data available — show compliance UI ── */}
      {dataExists === true && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 272px', gap: '20px', alignItems: 'start' }}>

          {/* ── Main Column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Selection Card */}
            <div className="card">
              <div className="card-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <polyline points="9 12 11 14 15 10"/>
                </svg>
                <h2 style={{ margin: 0 }}>Encapsulated Assertion</h2>
              </div>

              {encassConfigs.length === 0 ? (
                <div className="alert alert-info">
                  <span>ℹ</span>
                  <span>No <code>encassConfigs</code> found in the bundle. The gateway may not have any Encapsulated Assertions defined.</span>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ flex: '1 1 260px', marginBottom: 0 }}>
                      <label htmlFor="encassSelect">Select Encapsulated Assertion</label>
                      <select
                        id="encassSelect"
                        value={selectedEncass}
                        onChange={e => handleSelectChange(e.target.value)}
                      >
                        <option value="">— Choose an Encapsulated Assertion —</option>
                        {encassConfigs.map(e => (
                          <option key={e.name} value={e.name}>
                            {e.name}{e.description ? ` — ${e.description}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={handleRun}
                      disabled={running || !selectedEncass}
                    >
                      {running
                        ? <><span className="spinner" /> Running…</>
                        : 'Run Compliance Check'}
                    </button>
                  </div>

                  {/* Encass metadata */}
                  {selectedMeta && (
                    <div style={{
                      marginTop: '12px',
                      padding: '12px 14px',
                      background: '#F8FAFC',
                      border: '1px solid var(--color-border)',
                      borderRadius: '5px',
                      fontSize: '12px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '5px 20px',
                    }}>
                      <div>
                        <span style={{ color: 'var(--color-text-secondary)' }}>Name: </span>
                        <strong className="font-mono">{selectedMeta.name}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-secondary)' }}>Backed by Policy: </span>
                        <strong>{selectedMeta.policyName || 'N/A'}</strong>
                      </div>
                      {selectedMeta.description && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <span style={{ color: 'var(--color-text-secondary)' }}>Description: </span>
                          {selectedMeta.description}
                        </div>
                      )}
                      {selectedMeta.guid && (
                        <div style={{ gridColumn: '1 / -1' }}>
                          <span style={{ color: 'var(--color-text-secondary)' }}>GUID: </span>
                          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                            {selectedMeta.guid}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Results */}
            {report && (
              <div className="card">
                <div className="card-header" style={{ marginBottom: '12px' }}>
                  <h2 style={{ margin: 0 }}>Compliance Results</h2>
                  <span className="badge badge-policy" style={{ marginLeft: '8px' }}>
                    {report.encassName}
                  </span>
                  <span className="text-muted text-sm" style={{ marginLeft: 'auto' }}>
                    {new Date(report.timestamp).toLocaleString()}
                  </span>
                </div>

                {/* Horizontal stats strip */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: '1px',
                  background: 'var(--color-border)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  marginBottom: '14px',
                }}>
                  {[
                    { value: report.totalItems,        label: 'Total Items',    color: 'var(--color-accent-blue)' },
                    { value: report.totalServices,      label: 'Services',       color: 'var(--color-accent-blue)' },
                    { value: report.totalPolicies,      label: 'Policies',       color: 'var(--color-accent-blue)' },
                    { value: report.compliantCount,     label: 'Compliant',      color: '#065F46' },
                    { value: report.nonCompliantCount,  label: 'Not Compliant',  color: '#991B1B' },
                  ].map(s => (
                    <div key={s.label} style={{ background: '#fff', padding: '12px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.7rem', fontWeight: 700, color: s.color, lineHeight: 1.1 }}>
                        {s.value}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '3px' }}>
                        {s.label}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
                  Gateway: <strong className="font-mono">{report.hostname}</strong>
                  {' · '}Checking usage of <code>{report.encassName}</code> across all services &amp; policies
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <select value={filterType} onChange={e => setFilterType(e.target.value as typeof filterType)} style={{ width: 'auto' }}>
                    <option value="All">All Types</option>
                    <option value="Service">Service</option>
                    <option value="Policy">Policy</option>
                  </select>
                  <select value={filterCompliance} onChange={e => setFilterCompliance(e.target.value as typeof filterCompliance)} style={{ width: 'auto' }}>
                    <option value="All">All Status</option>
                    <option value="Compliant">Compliant Only</option>
                    <option value="Not Compliant">Not Compliant Only</option>
                  </select>
                  <input
                    type="search"
                    value={filterName}
                    onChange={e => setFilterName(e.target.value)}
                    placeholder="Filter by name…"
                    style={{ flex: '1 1 140px', minWidth: '120px' }}
                  />
                  <span className="text-muted text-sm">
                    {filtered.length} / {report.results.length} rows
                  </span>
                </div>

                {/* Table */}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>#</th>
                        <th style={{ width: '82px' }}>Type</th>
                        <th>Name</th>
                        <th>Resolution Path</th>
                        <th>Folder Path</th>
                        <th style={{ width: '130px' }}>Compliance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-secondary)' }}>
                            No items match the current filters.
                          </td>
                        </tr>
                      ) : (
                        filtered.map((r, i) => (
                          <tr
                            key={i}
                            style={{
                              background: r.compliant ? '#F0FDF4' : '#FEF2F2',
                              borderLeft: `3px solid ${r.compliant ? '#6EE7B7' : '#FECACA'}`,
                            }}
                          >
                            <td style={{ color: 'var(--color-text-secondary)' }}>{i + 1}</td>
                            <td><TypeBadge type={r.type} /></td>
                            <td style={{ fontWeight: r.compliant ? 600 : 400 }}>{r.name}</td>
                            <td className="font-mono" style={{ fontSize: '12px' }}>{r.resolutionPath}</td>
                            <td className="font-mono" style={{ fontSize: '12px' }}>{r.folderPath}</td>
                            <td><ComplianceBadge compliant={r.compliant} /></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {report.compliantCount === 0 && (
                  <div className="alert alert-info" style={{ marginTop: '12px', fontSize: '12px' }}>
                    <span>ℹ</span>
                    <span>
                      No items invoke <strong>{report.encassName}</strong>. The encass may be defined but not yet deployed, or called under a different name.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right Column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Gateway info */}
            <div className="card">
              <div className="card-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                <h3 style={{ margin: 0 }}>Gateway</h3>
              </div>
              <div style={{ fontSize: '12px' }}>
                <div style={{ marginBottom: '6px' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Selected: </span>
                  <strong className="font-mono">{selectedGatewayName || '—'}</strong>
                </div>
                <div style={{ marginBottom: '6px' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Loaded from: </span>
                  <strong className="font-mono">{hostname}</strong>
                </div>
                <div style={{ marginBottom: '6px' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Encass Configs: </span>
                  <strong>{encassConfigs.length}</strong>
                </div>
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--color-border)', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                  Use <strong>Refresh Data</strong> in the gateway card above to re-export when services or policies have changed.
                </div>
              </div>
            </div>

            {/* Encass list */}
            {encassConfigs.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="9" y1="21" x2="9" y2="9"/>
                  </svg>
                  <h3 style={{ margin: 0 }}>Encass Configs ({encassConfigs.length})</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '300px', overflowY: 'auto' }}>
                  {encassConfigs.map(e => (
                    <button
                      key={e.name}
                      onClick={() => handleSelectChange(e.name)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        padding: '8px 10px',
                        border: `1px solid ${selectedEncass === e.name ? 'var(--color-accent-blue)' : 'var(--color-border)'}`,
                        borderRadius: '5px',
                        background: selectedEncass === e.name ? '#EFF6FF' : 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.12s, border-color 0.12s',
                      }}
                    >
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: selectedEncass === e.name ? 'var(--color-accent-blue)' : 'var(--color-text-primary)',
                      }}>
                        {e.name}
                      </span>
                      {e.policyName && (
                        <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                          {e.policyName}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}

const labelSt: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.4px', color: 'var(--color-text-secondary)', marginBottom: '6px',
}
