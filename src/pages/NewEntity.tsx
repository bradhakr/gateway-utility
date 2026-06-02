import { useState, useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Validation {
  valid:        boolean
  error?:       string
  entityTypes?: string[]
  entityCount?: number
}

interface ImportResult {
  success:      boolean
  message:      string
  detail?:      string
}

interface GatewayEntry {
  name:               string
  address:            string
  host:               string
  username:           string
  allowMutations:     boolean
  rejectUnauthorized: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_COLOR  = '#7c3aed'
const PAGE_RGBA   = 'rgba(124,58,237,'

const PLACEHOLDER = `{
  "webApiServices": [
    {
      "name": "My API Service",
      "resolutionPath": "/my/path",
      "enabled": true,
      "policy": { ... }
    }
  ],
  "policyFragments": [
    {
      "name": "My Policy Fragment",
      "policyType": "Include",
      "policy": { ... }
    }
  ]
}`

// ─── Toolbar button style ─────────────────────────────────────────────────────

const toolBtn = (extra?: React.CSSProperties): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: '5px',
  padding: '5px 12px', borderRadius: '5px', cursor: 'pointer',
  fontSize: '12px', fontWeight: 600, background: 'transparent',
  border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)',
  ...extra,
})


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewEntity() {
  const [gateways, setGateways]           = useState<GatewayEntry[]>([])
  const [gatewaysError, setGatewaysError] = useState('')
  const [selectedEntry, setSelectedEntry] = useState<GatewayEntry | null>(null)
  // gatewayName is what's sent to graphman — editable, pre-filled from selection
  const [gatewayName, setGatewayName]     = useState('')

  const [bundleText, setBundleText]   = useState('')
  const [validation, setValidation]   = useState<Validation | null>(null)
  const [importing, setImporting]     = useState(false)
  const [result, setResult]           = useState<ImportResult | null>(null)
  const [pasting, setPasting]         = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Load all gateways from graphman.configuration ──────────────────────────
  useEffect(() => {
    fetch('/api/graphman-config')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.gateways) {
          const list: GatewayEntry[] = Object.entries(d.gateways).map(
            ([name, gw]) => ({ name, ...(gw as Omit<GatewayEntry, 'name'>) })
          )
          setGateways(list)
        } else {
          setGatewaysError(d.error ?? 'Could not load gateway configuration.')
        }
      })
      .catch(() => setGatewaysError('Could not reach the API server. Is it running?'))
  }, [])

  // ── Debounced JSON validation ────────────────────────────────────────────────
  useEffect(() => {
    if (!bundleText.trim()) { setValidation(null); return }
    const t = setTimeout(() => {
      try {
        const parsed = JSON.parse(bundleText)
        if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
          setValidation({ valid: false, error: 'Bundle must be a JSON object (not an array or scalar).' })
          return
        }
        const entityTypes = Object.keys(parsed).filter(k => Array.isArray(parsed[k]))
        const entityCount = entityTypes.reduce((s: number, k) => s + (parsed[k] as unknown[]).length, 0)
        setValidation({ valid: true, entityTypes, entityCount })
      } catch (e: unknown) {
        setValidation({ valid: false, error: String(e) })
      }
    }, 350)
    return () => clearTimeout(t)
  }, [bundleText])

  // ── Helpers ──────────────────────────────────────────────────────────────────
  async function handlePaste() {
    setPasting(true)
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim()) { setBundleText(text); setResult(null) }
    } catch { /* clipboard permission denied — do nothing */ }
    finally { setPasting(false) }
  }

  function handleFormat() {
    try { setBundleText(JSON.stringify(JSON.parse(bundleText), null, 2)) } catch { /* invalid — leave as-is */ }
  }

  function handleClear() { setBundleText(''); setValidation(null); setResult(null) }

  function handleLoadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { setBundleText((ev.target?.result as string) ?? ''); setResult(null) }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleImport() {
    const gw = gatewayName.trim()
    if (!gw || !validation?.valid) return
    setImporting(true); setResult(null)
    try {
      const resp = await fetch('/api/bundle-import-raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway: gw, bundleJson: bundleText }),
      })

      // Guard against the server returning HTML (e.g. 413 Payload Too Large)
      const contentType = resp.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        setResult({
          success: false,
          message: `Server returned HTTP ${resp.status} with a non-JSON response.`,
          detail: resp.status === 413
            ? 'The bundle payload exceeded the server body size limit. Restart the server — the limit has been raised to 20 MB.'
            : `Content-Type: ${contentType || '(none)'}. Check that the API server is running on port 3002.`,
        })
        return
      }

      const data = await resp.json()
      if (data.success) {
        setResult({
          success: true,
          message: `Imported ${data.entityCount ?? '?'} item(s) across ${data.entityTypes?.length ?? '?'} type(s) into "${gw}".`,
          detail: data.output,
        })
      } else {
        setResult({ success: false, message: data.error ?? 'Import failed.', detail: [data.detail, data.hint].filter(Boolean).join('\n') })
      }
    } catch (e: unknown) {
      setResult({ success: false, message: `Request failed: ${String(e)}` })
    } finally {
      setImporting(false)
    }
  }

  // ── Dropdown change handler ───────────────────────────────────────────────
  function handleDropdownChange(name: string) {
    setResult(null)
    if (!name) { setSelectedEntry(null); setGatewayName(''); return }
    const entry = gateways.find(g => g.name === name) ?? null
    setSelectedEntry(entry)
    setGatewayName(name)
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  // Import is enabled as soon as there's a non-empty gateway name AND valid JSON
  const canImport = !!gatewayName.trim() && !!validation?.valid && !importing
  const lines     = bundleText ? bundleText.split('\n').length : 0
  const chars     = bundleText.length

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 32px', maxWidth: '1100px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Hero banner ─────────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${PAGE_RGBA}0.10) 0%, ${PAGE_RGBA}0.03) 100%)`,
        border: `1px solid ${PAGE_RGBA}0.20)`,
        borderLeft: `4px solid ${PAGE_COLOR}`,
        borderRadius: '10px',
        padding: '20px 24px',
        marginBottom: '24px',
        boxShadow: '0 2px 14px rgba(0,0,0,0.08)',
      }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.2px' }}>
          Bundle Import
          <span style={{ fontWeight: 400, fontSize: '15px', color: 'var(--color-text-secondary)', marginLeft: '12px', letterSpacing: '0' }}>— Upload &amp; Import a Graphman Bundle</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '6px', marginBottom: 0 }}>
          Upload or paste a Graphman JSON bundle — select the target gateway and click Import to apply.
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
            { title: 'Compose Your Bundle', desc: 'Paste a Graphman JSON bundle directly or load it from a file. Any valid bundle containing one or more entity types is accepted.' },
            { title: 'Auto-Validate',       desc: 'The bundle is validated automatically. Entity types and item counts are listed so you can confirm the content before pushing.' },
            { title: 'Import to Gateway',   desc: 'Select a target gateway from graphman.configuration and click Import. A result panel reports success or shows the exact gateway error.' },
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
        const stepLabels = ['Select Gateway', 'Compose Bundle', 'Validate', 'Import']
        const stepDone   = [!!gatewayName.trim(), !!bundleText.trim(), validation?.valid === true, result?.success === true]
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

      {/* ── Gateway selector ─────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '20px 24px', marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)', marginBottom: '14px' }}>
          Target Gateway
        </div>

        {gatewaysError && (
          <div style={{ padding: '10px 14px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#dc2626', fontSize: '13px', marginBottom: '12px' }}>
            ⚠ {gatewaysError}
          </div>
        )}

        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Dropdown — all gateways from graphman.configuration */}
          <div style={{ flex: '0 0 auto' }}>
            <label style={labelSt}>Select Gateway</label>
            <select
              value={gatewayName}
              onChange={e => handleDropdownChange(e.target.value)}
              style={{ background: 'var(--color-input-bg)', border: `1px solid ${gatewayName ? 'rgba(124,58,237,0.45)' : 'var(--color-border)'}`, borderRadius: '6px', color: gatewayName ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', padding: '9px 36px 9px 14px', fontSize: '13px', minWidth: '260px', cursor: 'pointer', appearance: 'none', outline: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23b8c5d0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
            >
              <option value="">— Select gateway to import into —</option>
              {gateways.map(gw => (
                <option key={gw.name} value={gw.name}>{gw.name} — {gw.host}</option>
              ))}
            </select>
          </div>

          {/* Editable name override */}
          <div style={{ flex: '0 0 auto', minWidth: '160px' }}>
            <label style={labelSt}>
              Gateway Key
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: '5px', opacity: 0.65 }}>(must match graphman config)</span>
            </label>
            <input
              type="text"
              value={gatewayName}
              onChange={e => { setGatewayName(e.target.value); setSelectedEntry(null); setResult(null) }}
              placeholder="e.g. vks"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', fontSize: '13px', fontFamily: 'ui-monospace, monospace', background: 'var(--color-input-bg)', border: `1px solid ${gatewayName.trim() ? 'rgba(124,58,237,0.45)' : 'var(--color-border)'}`, color: 'var(--color-text-primary)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* Gateway detail card — shown when an entry is selected */}
        {selectedEntry && (
          <div style={{ marginTop: '16px', padding: '14px 18px', borderRadius: '8px', background: `${PAGE_RGBA}0.05)`, border: `1px solid ${PAGE_RGBA}0.20)`, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px 24px' }}>
            <Detail label="Address" value={selectedEntry.address} mono />
            <Detail label="Host" value={selectedEntry.host} mono />
            <Detail label="Username" value={selectedEntry.username} />
            <Detail label="Mutations Allowed" value={selectedEntry.allowMutations ? '✓ Yes' : '✗ No'} color={selectedEntry.allowMutations ? '#22c55e' : '#f59e0b'} />
            <Detail label="TLS Verification" value={selectedEntry.rejectUnauthorized ? 'Strict' : 'Relaxed (self-signed ok)'} color={selectedEntry.rejectUnauthorized ? '#22c55e' : '#f59e0b'} />
          </div>
        )}
      </div>

      {/* ── Bundle editor ───────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderBottom: '1px solid var(--color-border)', background: '#f8fafc', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)', marginRight: '4px' }}>
            Bundle JSON
          </span>

          <div style={{ display: 'flex', gap: '6px', flex: 1, flexWrap: 'wrap' }}>
            {/* Load file */}
            <button onClick={() => fileInputRef.current?.click()} style={toolBtn()}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Load File
            </button>
            <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleLoadFile} />

            {/* Paste from clipboard */}
            <button onClick={handlePaste} disabled={pasting} style={toolBtn({ color: '#7c3aed', borderColor: 'rgba(124,58,237,0.35)', background: 'rgba(124,58,237,0.06)', opacity: pasting ? 0.6 : 1 })}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
              </svg>
              {pasting ? 'Pasting…' : 'Paste from Clipboard'}
            </button>

            {/* Format */}
            <button onClick={handleFormat} disabled={!bundleText} style={toolBtn({ opacity: bundleText ? 1 : 0.4 })}>
              <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 800 }}>{'{}'}</span>
              Format JSON
            </button>

            {/* Clear */}
            <button onClick={handleClear} disabled={!bundleText} style={toolBtn({ opacity: bundleText ? 1 : 0.4, color: '#ef4444', borderColor: 'rgba(239,68,68,0.35)' })}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              Clear
            </button>
          </div>

          {/* Validation badge */}
          {validation && (
            <div style={{
              fontSize: '12px', fontWeight: 600, padding: '3px 11px', borderRadius: '20px', whiteSpace: 'nowrap',
              background: validation.valid ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              color:      validation.valid ? '#16a34a'              : '#dc2626',
              border:     `1px solid ${validation.valid ? '#86efac' : '#fca5a5'}`,
            }}>
              {validation.valid
                ? `✓ Valid · ${validation.entityCount} item(s) in ${validation.entityTypes?.length} type(s)`
                : '✕ Invalid JSON'}
            </div>
          )}
        </div>

        {/* Textarea */}
        <textarea
          value={bundleText}
          onChange={e => { setBundleText(e.target.value); setResult(null) }}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          style={{
            width: '100%', minHeight: '440px', padding: '16px',
            fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace',
            fontSize: '12.5px', lineHeight: '1.65',
            color: 'var(--color-text-primary)', background: 'transparent',
            border: 'none', outline: 'none', resize: 'vertical',
            boxSizing: 'border-box', display: 'block',
          }}
        />

        {/* Footer stats */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 16px', borderTop: '1px solid var(--color-border)', background: '#f8fafc', fontSize: '11px', color: 'var(--color-text-secondary)', gap: '12px' }}>
          <span>{lines.toLocaleString()} lines · {chars.toLocaleString()} chars</span>
          {validation?.valid && validation.entityTypes && validation.entityTypes.length > 0 && (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
              Types: {validation.entityTypes.join(', ')}
            </span>
          )}
          {validation && !validation.valid && validation.error && (
            <span style={{ color: '#dc2626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }} title={validation.error}>
              {validation.error}
            </span>
          )}
        </div>
      </div>

      {/* ── Import result ────────────────────────────────────────────────────── */}
      {result && (
        <div style={{
          marginBottom: '20px', padding: '14px 18px', borderRadius: '8px',
          background: result.success ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${result.success ? '#86efac' : '#fca5a5'}`,
        }}>
          <div style={{ fontWeight: 700, fontSize: '13px', color: result.success ? '#16a34a' : '#dc2626', marginBottom: result.detail ? '8px' : 0 }}>
            {result.success ? '✓ ' : '✕ '}{result.message}
          </div>
          {result.detail && (
            <pre style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-secondary)', fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap', lineHeight: '1.55', maxHeight: '200px', overflowY: 'auto' }}>
              {result.detail}
            </pre>
          )}
        </div>
      )}

      {/* ── Action bar ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', paddingTop: '4px' }}>
        {!gatewayName.trim() && (
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Enter a gateway name above to enable import.
          </span>
        )}
        {gatewayName.trim() && !validation?.valid && bundleText && (
          <span style={{ fontSize: '12px', color: '#dc2626' }}>
            Fix JSON errors before importing.
          </span>
        )}
        {gatewayName.trim() && !bundleText && (
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Paste or load a bundle JSON to continue.
          </span>
        )}
        <button
          onClick={handleImport}
          disabled={!canImport}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 28px', borderRadius: '7px', border: 'none',
            fontSize: '14px', fontWeight: 700, color: '#fff',
            cursor: canImport ? 'pointer' : 'not-allowed',
            background: canImport ? PAGE_COLOR : `${PAGE_RGBA}0.35)`,
            opacity: canImport ? 1 : 0.75,
            transition: 'background 0.15s',
          }}
        >
          {importing ? (
            <>
              <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Importing…
            </>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {gatewayName.trim() ? `Import to "${gatewayName.trim()}"` : 'Import to Gateway'}
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Detail({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-secondary)', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '12.5px', fontFamily: mono ? 'ui-monospace, monospace' : 'inherit', color: color ?? 'var(--color-text-primary)', wordBreak: 'break-all' }}>{value || '—'}</div>
    </div>
  )
}

const labelSt: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.4px', color: 'var(--color-text-secondary)', marginBottom: '6px',
}
