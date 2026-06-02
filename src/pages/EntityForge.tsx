import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────

const API        = '/api'
const PAGE_COLOR = '#0891b2'
const PAGE_RGBA  = 'rgba(8,145,178,'
const FORGE_TIMEOUT_MS = 65_000

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldDef {
  name:        string
  dataType:    string
  isPrimitive: boolean
  isArray:     boolean
  isEnum:      boolean
  enumValues:  string[] | null
  nestedFields: FieldDef[] | null
}

interface TypeSchema {
  typeName:       string
  pluralName:     string
  singularName:   string
  identityFields: string[]
  fields:         FieldDef[]
}

interface SchemaDescribe {
  schemaVersion: string
  entityTypes:   { typeName: string; pluralName: string; singularName: string }[]
  mutations:     string[]
  queries:       string[]
  builtinQueries: string[]
}

type Category = 'entity' | 'mutation' | 'query' | 'builtin'
type Step = 1 | 2 | 3 | 4

interface GatewayEntry {
  name:               string
  address:            string
  host:               string
  username:           string
  allowMutations:     boolean
  rejectUnauthorized: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDefaultValue(field: FieldDef): unknown {
  if (field.isArray)   return []
  if (field.nestedFields) return null
  if (field.dataType === 'Boolean') return false
  if (['Int','PositiveInt','NonNegativeInt','Long'].includes(field.dataType)) return ''
  return ''
}

function buildInitialData(fields: FieldDef[]): Record<string, unknown> {
  const d: Record<string, unknown> = {}
  fields.forEach(f => { d[f.name] = getDefaultValue(f) })
  return d
}

function cleanBundle(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  Object.entries(data).forEach(([k, v]) => {
    if (v === '' || v === null || v === undefined) return
    if (Array.isArray(v) && v.length === 0) return
    if (typeof v === 'object' && !Array.isArray(v) && v !== null) {
      const nested = cleanBundle(v as Record<string, unknown>)
      if (Object.keys(nested).length > 0) out[k] = nested
      return
    }
    out[k] = v
  })
  return out
}

function fmtJson(obj: unknown) { return JSON.stringify(obj, null, 2) }

// ─── Spinner / icons ──────────────────────────────────────────────────────────

function Spin() { return <span className="spinner" style={{ width: '13px', height: '13px', borderWidth: '2px' }} /> }

function CheckIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
}
function XIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}

// ─── Label style ──────────────────────────────────────────────────────────────

const LBL: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.5px',
  color: 'var(--color-text-secondary)', marginBottom: '5px',
}

// ─── Dynamic field input ──────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} style={{
      display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    }}>
      <div style={{
        width: '38px', height: '20px', borderRadius: '10px', position: 'relative', transition: 'background 0.2s',
        background: checked ? PAGE_COLOR : 'rgba(184,197,208,0.25)',
        border: `1px solid ${checked ? PAGE_COLOR : 'rgba(184,197,208,0.3)'}`,
      }}>
        <div style={{
          position: 'absolute', top: '2px', left: checked ? '19px' : '2px', width: '14px', height: '14px',
          borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        }}/>
      </div>
      <span style={{ fontSize: '12px', color: checked ? PAGE_COLOR : 'var(--color-text-secondary)', fontWeight: 500 }}>
        {checked ? 'True' : 'False'}
      </span>
    </button>
  )
}

function FieldInput({
  field, value, onChange, required, depth = 0,
}: {
  field: FieldDef; value: unknown; onChange: (v: unknown) => void; required?: boolean; depth?: number
}) {
  const [open, setOpen] = useState(depth === 0)
  const label = field.name.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
  const inputBg: React.CSSProperties = {
    background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: '6px',
    color: 'var(--color-text-primary)', padding: '7px 10px', fontSize: '13px', width: '100%', boxSizing: 'border-box',
    outline: 'none',
  }

  // Boolean toggle
  if (field.dataType === 'Boolean') {
    return (
      <div>
        <label style={LBL}>{label}{required && <span style={{ color: '#ef4444', marginLeft: '3px' }}>*</span>}</label>
        <Toggle checked={value === true} onChange={onChange} />
      </div>
    )
  }

  // Enum single-select
  if (field.isEnum && !field.isArray) {
    return (
      <div>
        <label style={LBL}>{label}{required && <span style={{ color: '#ef4444', marginLeft: '3px' }}>*</span>}</label>
        <select value={String(value ?? '')} onChange={e => onChange(e.target.value || '')} style={{ ...inputBg, appearance: 'none', cursor: 'pointer', minWidth: '200px' }}>
          <option value="">— Select —</option>
          {(field.enumValues ?? []).map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
    )
  }

  // Array of enums → checkboxes
  if (field.isEnum && field.isArray) {
    const arr = Array.isArray(value) ? (value as string[]) : []
    return (
      <div>
        <label style={LBL}>{label}{required && <span style={{ color: '#ef4444', marginLeft: '3px' }}>*</span>}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
          {(field.enumValues ?? []).map(v => {
            const checked = arr.includes(v)
            return (
              <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', padding: '4px 10px', borderRadius: '5px', border: `1px solid ${checked ? PAGE_COLOR : 'var(--color-border)'}`, background: checked ? `${PAGE_RGBA}0.07)` : 'transparent', fontSize: '12px', color: checked ? PAGE_COLOR : 'var(--color-text-secondary)' }}>
                <input type="checkbox" checked={checked} onChange={() => onChange(checked ? arr.filter(x => x !== v) : [...arr, v])} style={{ accentColor: PAGE_COLOR, width: '12px', height: '12px' }} />
                {v}
              </label>
            )
          })}
        </div>
      </div>
    )
  }

  // Array of primitives (strings) → tag input
  if (field.isArray && field.isPrimitive) {
    const arr = Array.isArray(value) ? (value as string[]) : []
    return (
      <div>
        <label style={LBL}>{label}{required && <span style={{ color: '#ef4444', marginLeft: '3px' }}>*</span>}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-input-bg)', minHeight: '36px' }}>
          {arr.map((item, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', background: `${PAGE_RGBA}0.12)`, border: `1px solid ${PAGE_RGBA}0.3)`, fontSize: '12px', color: PAGE_COLOR }}>
              {item}
              <button onClick={() => onChange(arr.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', opacity: 0.7, fontSize: '14px', lineHeight: 1 }}>×</button>
            </span>
          ))}
          <input
            placeholder="Add item, press Enter"
            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '12px', color: 'var(--color-text-primary)', minWidth: '120px', flex: 1 }}
            onKeyDown={e => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                onChange([...arr, e.currentTarget.value.trim()])
                e.currentTarget.value = ''
              }
            }}
          />
        </div>
      </div>
    )
  }

  // Nested object
  if (field.nestedFields) {
    const enabled = value !== null && value !== undefined
    const nestedData = (enabled && typeof value === 'object' && !Array.isArray(value)) ? (value as Record<string, unknown>) : {}
    return (
      <div style={{ border: `1px solid ${open ? `${PAGE_RGBA}0.25)` : 'var(--color-border)'}`, borderRadius: '7px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: open ? `${PAGE_RGBA}0.04)` : 'transparent', cursor: 'pointer' }}
          onClick={() => setOpen(v => !v)}>
          <Toggle checked={enabled} onChange={en => { onChange(en ? buildInitialData(field.nestedFields!) : null); if (en) setOpen(true) }} />
          <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{label}</span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', opacity: 0.6 }}>{field.dataType}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginLeft: 'auto', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', opacity: 0.5 }}><polyline points="9 18 15 12 9 6"/></svg>
        </div>
        {open && enabled && (
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px', borderTop: `1px solid ${PAGE_RGBA}0.15)` }}>
            {field.nestedFields.map(nf => (
              <FieldInput key={nf.name} field={nf} value={nestedData[nf.name] ?? getDefaultValue(nf)}
                onChange={v => onChange({ ...nestedData, [nf.name]: v })} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Number input
  if (['Int','PositiveInt','NonNegativeInt','Long'].includes(field.dataType)) {
    return (
      <div>
        <label style={LBL}>{label}{required && <span style={{ color: '#ef4444', marginLeft: '3px' }}>*</span>}</label>
        <input type="number" value={value === '' ? '' : String(value ?? '')} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          style={{ ...inputBg, maxWidth: '180px' }} />
      </div>
    )
  }

  // Default: text input (String, NonEmptyString, Date, etc.)
  const isMultiLine = ['description', 'comment', 'policyXml', 'policy'].includes(field.name)
  return (
    <div>
      <label style={LBL}>{label}{required && <span style={{ color: '#ef4444', marginLeft: '3px' }}>*</span>}</label>
      {isMultiLine
        ? <textarea rows={4} value={String(value ?? '')} onChange={e => onChange(e.target.value)}
            style={{ ...inputBg, resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: '12px' }} />
        : <input type="text" value={String(value ?? '')} onChange={e => onChange(e.target.value)} style={inputBg} />}
      {required && value === '' && <div style={{ marginTop: '4px', fontSize: '11px', color: '#ef4444' }}>Required field</div>}
    </div>
  )
}

// ─── Result panel (success / error) ──────────────────────────────────────────

function ResultPanel({ ok, message, hint, detail, onDismiss }: {
  ok: boolean; message: string; hint?: string; detail?: string; onDismiss: () => void
}) {
  const [showDetail, setShowDetail] = useState(false)
  const bg    = ok ? 'rgba(34,197,94,0.06)'  : 'rgba(220,38,38,0.06)'
  const bd    = ok ? 'rgba(34,197,94,0.35)'  : 'rgba(220,38,38,0.35)'
  const title = ok ? '#15803d' : '#b91c1c'
  return (
    <div style={{ borderRadius: '8px', border: `1px solid ${bd}`, background: bg, overflow: 'hidden', marginTop: '14px' }}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{ flexShrink: 0, width: '20px', height: '20px', borderRadius: '50%', background: ok ? '#22c55e' : '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          {ok ? <CheckIcon /> : <XIcon />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: title }}>{ok ? 'Import successful' : 'Import failed'}</div>
          <div style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{message}</div>
          {hint && <div style={{ marginTop: '6px', fontSize: '12px', color: '#b45309', padding: '5px 10px', borderRadius: '5px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>💡 {hint}</div>}
          {detail && (
            <div style={{ marginTop: '8px' }}>
              <button onClick={() => setShowDetail(v => !v)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '11.5px', color: title, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: showDetail ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="9 18 15 12 9 6"/></svg>
                {showDetail ? 'Hide output' : 'Show output'}
              </button>
              {showDetail && <pre style={{ marginTop: '6px', padding: '8px 10px', borderRadius: '5px', background: 'rgba(0,0,0,0.04)', fontSize: '11px', fontFamily: 'ui-monospace,monospace', color: ok ? '#14532d' : '#7f1d1d', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '160px', overflowY: 'auto', border: `1px solid ${bd}` }}>{detail}</pre>}
            </div>
          )}
        </div>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '18px', lineHeight: 1, opacity: 0.5 }}>×</button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EntityForge() {
  // All gateways + schema come from graphman.configuration — no config.json dependency.
  const [gwEntries, setGwEntries]         = useState<GatewayEntry[]>([])
  const [graphmanSchema, setGraphmanSchema] = useState('v11.1.00')

  // Step state
  const [step, setStep] = useState<Step>(1)

  // Step 1 — gateway
  const [selectedGateway, setSelectedGateway] = useState('')

  // Step 2 — schema discovery
  const [schemaData, setSchemaData] = useState<SchemaDescribe | null>(null)
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schemaError, setSchemaError] = useState('')
  const [activeCategory, setActiveCategory] = useState<Category>('entity')
  const [typeFilter, setTypeFilter] = useState('')
  const [selectedTypeName, setSelectedTypeName] = useState('')

  // Step 3 — type schema + form
  const [typeSchema, setTypeSchema] = useState<TypeSchema | null>(null)
  const [typeSchemaLoading, setTypeSchemaLoading] = useState(false)
  const [typeSchemaError, setTypeSchemaError] = useState('')
  const [formData, setFormData] = useState<Record<string, unknown>>({})

  // Step 4 — import
  const [importing, setImporting] = useState(false)
  const [importElapsed, setImportElapsed] = useState(0)
  const [importResult, setImportResult] = useState<{ ok: boolean; message: string; hint?: string; detail?: string } | null>(null)
  const importAbortRef = useRef<AbortController | null>(null)

  // Error states for non-loading failures
  const [configError, setConfigError] = useState('')
  const [schemaRetry, setSchemaRetry]   = useState(0)  // increment to force schema reload

  // Gateway connectivity test state (Step 1)
  const [gwTestLoading, setGwTestLoading] = useState(false)
  const [gwTestResult, setGwTestResult]   = useState<{ ok: boolean; message: string; detail?: string } | null>(null)

  // ── Cancel any in-flight import when the component unmounts ──────────────
  useEffect(() => {
    return () => { importAbortRef.current?.abort() }
  }, [])

  // ── Reset test result when gateway changes ─────────────────────────────
  useEffect(() => { setGwTestResult(null) }, [selectedGateway])

  const handleTestGateway = async () => {
    if (!selectedGateway) return
    setGwTestLoading(true); setGwTestResult(null)
    try {
      const res = await fetch(`${API}/gateway-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateway: selectedGateway }),
      })
      const data = await res.json()
      setGwTestResult({ ok: !!data.success, message: data.message || data.error || 'Unknown result.', detail: data.detail })
    } catch {
      setGwTestResult({ ok: false, message: 'Cannot reach the API server on port 3002.' })
    } finally {
      setGwTestLoading(false)
    }
  }

  // ── Load all gateways + schema from graphman.configuration ───────────────
  useEffect(() => {
    setConfigError('')
    fetch(`${API}/graphman-config`)
      .then(async r => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}))
          throw new Error(d.error || `Server returned ${r.status}`)
        }
        return r.json()
      })
      .then(d => {
        if (!d.success) throw new Error(d.error || 'Could not load graphman configuration.')
        const entries: GatewayEntry[] = Object.entries(d.gateways || {}).map(
          ([name, gw]) => ({ name, ...(gw as Omit<GatewayEntry, 'name'>) })
        )
        setGwEntries(entries)
        if (d.options?.schema) setGraphmanSchema(d.options.schema)
        if (entries.length > 0) setSelectedGateway(entries[0].name)
      })
      .catch(e => setConfigError(`Could not load graphman configuration: ${e.message}. Is the API server running on port 3002?`))
  }, [])

  // ── Load schema using graphman.configuration options.schema ──────────────
  useEffect(() => {
    setSchemaLoading(true); setSchemaError('')
    fetch(`${API}/schema/describe?schemaVersion=${encodeURIComponent(graphmanSchema)}`)
      .then(async r => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}))
          throw new Error(d.error || `Server returned ${r.status}`)
        }
        return r.json()
      })
      .then(d => { if (d.success) setSchemaData(d); else setSchemaError(d.error || 'Failed to load schema.') })
      .catch(e => setSchemaError(e.message || 'Cannot reach API server on port 3002.'))
      .finally(() => setSchemaLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaRetry, graphmanSchema])

  // ── Fetch type schema using graphman.configuration options.schema ─────────
  const fetchTypeSchema = useCallback((typeName: string) => {
    if (!typeName) return
    setTypeSchemaLoading(true); setTypeSchemaError(''); setTypeSchema(null)
    fetch(`${API}/schema/type/${encodeURIComponent(typeName)}?schemaVersion=${encodeURIComponent(graphmanSchema)}`)
      .then(async r => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}))
          throw new Error(d.error || `Server returned ${r.status}`)
        }
        return r.json()
      })
      .then(d => {
        if (d.success) {
          setTypeSchema(d)
          setFormData(buildInitialData(d.fields))
        } else {
          setTypeSchemaError(d.error || 'Failed to load type schema.')
        }
      })
      .catch(e => setTypeSchemaError(e.message || 'Cannot reach API server.'))
      .finally(() => setTypeSchemaLoading(false))
  }, [graphmanSchema])

  useEffect(() => { if (selectedTypeName) fetchTypeSchema(selectedTypeName) }, [selectedTypeName, fetchTypeSchema])

  // ── Import elapsed timer ───────────────────────────────────────────────────
  useEffect(() => {
    let t: ReturnType<typeof setInterval>
    if (importing) { setImportElapsed(0); t = setInterval(() => setImportElapsed(s => s + 1), 1000) }
    return () => clearInterval(t)
  }, [importing])

  // ── Import handler ─────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!typeSchema) return
    const ac = new AbortController()
    importAbortRef.current = ac
    const timer = setTimeout(() => ac.abort(), FORGE_TIMEOUT_MS)
    setImporting(true); setImportResult(null)
    try {
      const res = await fetch(`${API}/entity-forge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateway: selectedGateway,
          pluralName: typeSchema.pluralName,
          entityData: cleanBundle(formData),
          schema: graphmanSchema,
        }),
        signal: ac.signal,
      })

      // Parse JSON defensively — a non-JSON body (e.g. HTML error page) throws a SyntaxError
      let data: Record<string, unknown>
      try {
        data = await res.json()
      } catch {
        throw new Error(`Server returned ${res.status} with an unexpected non-JSON response. Is the API server running?`)
      }

      if (!res.ok || !data.success) {
        setImportResult({
          ok: false,
          message: (data.error as string) || `Import failed (HTTP ${res.status}).`,
          hint: data.hint as string | undefined,
          detail: (data.detail as string) || '',
        })
      } else {
        setImportResult({ ok: true, message: `Entity imported to gateway "${selectedGateway}" successfully.`, detail: (data.output as string) || '' })
      }
    } catch (err: unknown) {
      const aborted = (err as { name?: string }).name === 'AbortError'
      setImportResult({
        ok: false,
        message: aborted
          ? `Request to gateway "${selectedGateway}" timed out after ${FORGE_TIMEOUT_MS / 1000}s — the gateway may be unreachable.`
          : (err as Error).message || 'Request failed — is the API server running on port 3002?',
        hint: aborted ? 'Verify the gateway is reachable from this machine.' : undefined,
      })
    } finally {
      clearTimeout(timer)
      setImporting(false)
      importAbortRef.current = null
    }
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const identityFilled = typeSchema?.identityFields.every(f => {
    const v = formData[f]; return v !== '' && v !== null && v !== undefined
  }) ?? false

  const currentBundle = typeSchema ? { [typeSchema.pluralName]: [cleanBundle(formData)] } : null

  // ── Category items ─────────────────────────────────────────────────────────
  const categoryItems: string[] = (() => {
    if (!schemaData) return []
    const q = typeFilter.toLowerCase()
    switch (activeCategory) {
      case 'entity':  return schemaData.entityTypes.map(t => t.typeName).filter(n => !q || n.toLowerCase().includes(q))
      case 'mutation':return schemaData.mutations.filter(n => !q || n.toLowerCase().includes(q))
      case 'query':   return schemaData.queries.filter(n => !q || n.toLowerCase().includes(q))
      case 'builtin': return schemaData.builtinQueries.filter(n => !q || n.toLowerCase().includes(q))
    }
  })()

  const TABS: { id: Category; label: string; count: number }[] = schemaData ? [
    { id: 'entity',  label: 'L7 Entities', count: schemaData.entityTypes.length },
    { id: 'mutation',label: 'Mutations',   count: schemaData.mutations.length },
    { id: 'query',   label: 'Queries',     count: schemaData.queries.length },
    { id: 'builtin', label: 'Built-in',    count: schemaData.builtinQueries.length },
  ] : []

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1320px' }}>

      {/* ── Hero banner ── */}
      <div style={{ background: `linear-gradient(135deg, ${PAGE_RGBA}0.10) 0%, ${PAGE_RGBA}0.03) 100%)`, border: `1px solid ${PAGE_RGBA}0.20)`, borderLeft: `4px solid ${PAGE_COLOR}`, borderRadius: '10px', padding: '20px 24px', marginBottom: '20px', boxShadow: '0 2px 14px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.2px' }}>
          Entity Forge
          <span style={{ fontWeight: 400, fontSize: '15px', color: 'var(--color-text-secondary)', marginLeft: '12px' }}>— Build and Import from Schema</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '6px', marginBottom: 0 }}>
          Browse the live gateway schema, select an entity type, fill a dynamic form, and forge a new bundle ready for import — all without writing JSON manually.
        </p>
      </div>

      {/* ── How It Works card ── */}
      <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          How It Works
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
          {[
            { title: 'Choose Gateway',    desc: 'Select any configured gateway from graphman.configuration. The schema version is auto-resolved from its global options.' },
            { title: 'Browse Schema',     desc: 'Explore entity types, mutations, and queries available in the gateway schema. Filter and select the type you want to create.' },
            { title: 'Build Entity',      desc: 'Fill in a dynamic form generated from the schema. Required identity fields are highlighted. A live JSON preview updates as you type.' },
            { title: 'Import to Gateway', desc: 'Review the final bundle, then push the entity directly to the selected gateway. A result panel shows success or the exact error.' },
          ].map((item, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '9px', padding: '0 14px', borderRight: idx < 3 ? '1px solid var(--color-border)' : 'none' }}>
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
        const stepLabels = ['Select Gateway', 'Select Type', 'Fill Form', 'Review & Import']
        const stepDone   = [step > 1, step > 2, step > 3, importResult?.ok === true]
        const activeIdx  = stepDone.findIndex(d => !d)
        const activeStep = activeIdx === -1 ? stepLabels.length + 1 : activeIdx + 1
        return (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', fontSize: '12px', fontWeight: 600 }}>
            {stepLabels.map((label, idx) => {
              const n      = idx + 1
              const active = n === activeStep
              const done   = stepDone[idx]
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
                  <div onClick={() => { if (done) setStep(n as Step) }} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 11px', borderRadius: '20px', background: active ? `${PAGE_RGBA}0.12)` : done ? 'rgba(34,197,94,0.08)' : 'transparent', color: active ? PAGE_COLOR : done ? '#15803d' : 'var(--color-text-secondary)', border: active ? `1px solid ${PAGE_RGBA}0.25)` : done ? '1px solid rgba(34,197,94,0.20)' : '1px solid transparent', cursor: done ? 'pointer' : 'default' }}>
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

      {/* ═══════════════════════ STEP 1 — Gateway ═══════════════════════════ */}
      {step === 1 && (() => {
        const selectedEntry = gwEntries.find(g => g.name === selectedGateway) || null
        return (
          <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '28px 32px', maxWidth: '560px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '6px' }}>Choose Target Gateway</div>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '24px', lineHeight: 1.6 }}>
              All gateways from <code>graphman.configuration</code> are available. Select a target, optionally test connectivity, then continue to browse the schema.
            </p>

            {/* Config load error */}
            {configError && (
              <div style={{ marginBottom: '18px', padding: '12px 16px', borderRadius: '8px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.30)', fontSize: '12.5px', color: '#b91c1c' }}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>⚠ Configuration unavailable</div>
                {configError}
              </div>
            )}

            {/* Label row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <label style={LBL}>Target Gateway</label>
              {graphmanSchema && (
                <span style={{ fontSize: '10px', background: `${PAGE_RGBA}0.10)`, color: PAGE_COLOR, borderRadius: '10px', padding: '1px 7px', fontWeight: 700 }}>
                  Schema: {graphmanSchema}
                </span>
              )}
            </div>

            {/* Dropdown + Test Connection inline */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px' }}>
              <select
                value={selectedGateway}
                onChange={e => setSelectedGateway(e.target.value)}
                style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: `1px solid ${selectedGateway ? PAGE_COLOR : 'var(--color-border)'}`, background: 'var(--color-input-bg)', color: 'var(--color-text-primary)', fontSize: '13.5px', fontWeight: selectedGateway ? 600 : 400, outline: 'none', cursor: 'pointer', appearance: 'auto' }}>
                <option value="">— Select a gateway —</option>
                {gwEntries.map(entry => (
                  <option key={entry.name} value={entry.name}>{entry.name}</option>
                ))}
              </select>
              <button
                onClick={handleTestGateway}
                disabled={!selectedGateway || gwTestLoading}
                title="Test connectivity to the selected gateway"
                style={{ flexShrink: 0, padding: '9px 14px', borderRadius: '8px', cursor: (!selectedGateway || gwTestLoading) ? 'not-allowed' : 'pointer', background: 'transparent', border: `1px solid ${PAGE_RGBA}0.40)`, color: PAGE_COLOR, fontSize: '12.5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px', opacity: (!selectedGateway || gwTestLoading) ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                {gwTestLoading
                  ? <><Spin /> Testing…</>
                  : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> Test</>}
              </button>
            </div>

            {/* Test result badge */}
            {gwTestResult && (
              <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', borderRadius: '7px', background: gwTestResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(220,38,38,0.08)', border: `1px solid ${gwTestResult.ok ? 'rgba(34,197,94,0.3)' : 'rgba(220,38,38,0.3)'}`, fontSize: '12.5px' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: gwTestResult.ok ? '#22c55e' : '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {gwTestResult.ok ? <CheckIcon /> : <XIcon />}
                  </div>
                  <span style={{ color: gwTestResult.ok ? '#15803d' : '#b91c1c', fontWeight: 600 }}>{gwTestResult.message}</span>
                </div>
                {!gwTestResult.ok && (
                  <div style={{ padding: '7px 12px', borderRadius: '6px', background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.18)', fontSize: '11.5px', color: '#b91c1c' }}>
                    You can still continue, but the import in Step 4 will fail until the gateway is reachable.
                  </div>
                )}
              </div>
            )}

            {/* Selected gateway detail card */}
            {selectedEntry && (
              <div style={{ marginBottom: '20px', padding: '14px 16px', borderRadius: '8px', background: `${PAGE_RGBA}0.04)`, border: `1px solid ${PAGE_RGBA}0.15)` }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: PAGE_COLOR, marginBottom: '10px' }}>Gateway Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
                  {[
                    { label: 'Host', value: selectedEntry.host || selectedEntry.address || '—' },
                    { label: 'Username', value: selectedEntry.username || '—' },
                    { label: 'Allow Mutations', value: selectedEntry.allowMutations ? 'Yes' : 'No' },
                    { label: 'Reject Unauthorized', value: selectedEntry.rejectUnauthorized ? 'Yes' : 'No' },
                  ].map(row => (
                    <div key={row.label}>
                      <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--color-text-secondary)', marginBottom: '1px' }}>{row.label}</div>
                      <div style={{ fontSize: '12.5px', color: 'var(--color-text-primary)', fontFamily: row.label === 'Host' ? 'ui-monospace, monospace' : 'inherit', wordBreak: 'break-all' }}>{row.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No gateways warning */}
            {gwEntries.length === 0 && !configError && (
              <div style={{ marginBottom: '20px', padding: '14px 16px', borderRadius: '8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', fontSize: '13px', color: '#b45309' }}>
                No gateways found in <code>graphman.configuration</code>. Check the Graphman Configuration page.
              </div>
            )}

            <button className="btn btn-primary" onClick={() => setStep(2)} disabled={!selectedGateway} style={{ background: PAGE_COLOR, borderColor: PAGE_COLOR, fontSize: '14px', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Continue
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        )
      })()}

      {/* ═══════════════════════ STEP 2 — Type Selection ════════════════════ */}
      {step === 2 && (
        <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>Select Entity Type</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                {schemaData ? `Schema ${schemaData.schemaVersion} — ${schemaData.entityTypes.length} entity types available` : 'Loading schema…'}
              </div>
            </div>
            {/* Search */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: '7px', padding: '6px 12px' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.4 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={typeFilter} onChange={e => setTypeFilter(e.target.value)} placeholder="Filter types…" style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: 'var(--color-text-primary)', width: '180px' }} />
              {typeFilter && <button onClick={() => setTypeFilter('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '14px', padding: 0 }}>×</button>}
            </div>
          </div>

          {/* Category tabs — only L7 Entities is active; others are disabled pending future work */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', padding: '0 24px', gap: '2px' }}>
            {TABS.map(tab => {
              const isDisabled = tab.id !== 'entity'
              const isActive   = activeCategory === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => { if (!isDisabled) { setActiveCategory(tab.id); setTypeFilter(''); setSelectedTypeName('') } }}
                  disabled={isDisabled}
                  title={isDisabled ? 'Coming soon' : undefined}
                  style={{
                    padding: '10px 16px', background: 'none', border: 'none',
                    borderBottom: `2px solid ${isActive ? PAGE_COLOR : 'transparent'}`,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    fontSize: '13px', fontWeight: isActive ? 700 : 500,
                    color: isDisabled ? 'var(--color-text-secondary)' : isActive ? PAGE_COLOR : 'var(--color-text-secondary)',
                    opacity: isDisabled ? 0.35 : 1,
                    transition: 'all 0.15s',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                  {tab.label}
                  {isDisabled
                    ? <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '8px', background: 'rgba(184,197,208,0.12)', color: 'var(--color-text-secondary)', fontWeight: 600, letterSpacing: '0.2px' }}>soon</span>
                    : <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: isActive ? `${PAGE_RGBA}0.12)` : 'rgba(184,197,208,0.12)', color: isActive ? PAGE_COLOR : 'var(--color-text-secondary)' }}>{tab.count}</span>
                  }
                </button>
              )
            })}
          </div>

          {/* List */}
          {schemaLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}><Spin /> Loading schema…</div>
          ) : schemaError ? (
            <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <div style={{ flex: 1, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.30)', borderRadius: '8px', padding: '12px 16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#b91c1c', marginBottom: '4px' }}>⚠ Failed to load schema</div>
                <div style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)' }}>{schemaError}</div>
              </div>
              <button onClick={() => setSchemaRetry(n => n + 1)}
                style={{ flexShrink: 0, padding: '8px 16px', borderRadius: '7px', cursor: 'pointer', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg>
                Retry
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px', padding: '16px 24px', maxHeight: '380px', overflowY: 'auto' }}>
              {categoryItems.length === 0 && (
                <div style={{ gridColumn: '1/-1', fontSize: '13px', color: 'var(--color-text-secondary)', opacity: 0.6, padding: '20px 0' }}>No matches</div>
              )}
              {categoryItems.map(name => {
                const sel = selectedTypeName === name
                return (
                  <button key={name} onClick={() => setSelectedTypeName(name)} style={{ padding: '10px 14px', borderRadius: '7px', cursor: 'pointer', textAlign: 'left', background: sel ? `${PAGE_RGBA}0.10)` : 'transparent', border: `1px solid ${sel ? PAGE_COLOR : 'var(--color-border)'}`, color: sel ? PAGE_COLOR : 'var(--color-text-primary)', fontSize: '13px', fontWeight: sel ? 600 : 400, transition: 'all 0.12s', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {sel && <CheckIcon />}
                    {name}
                  </button>
                )
              })}
            </div>
          )}

          {/* Type schema loading */}
          {typeSchemaLoading && (
            <div style={{ padding: '12px 24px', borderTop: '1px solid var(--color-border)', fontSize: '13px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Spin /> Loading schema for <strong>{selectedTypeName}</strong>…
            </div>
          )}
          {typeSchemaError && (
            <div style={{ padding: '12px 24px', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '7px', padding: '8px 12px', fontSize: '12.5px', color: '#b91c1c' }}>
                ⚠ {typeSchemaError}
              </div>
              <button onClick={() => fetchTypeSchema(selectedTypeName)}
                style={{ flexShrink: 0, padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg>
                Retry
              </button>
            </div>
          )}
          {typeSchema && !typeSchemaLoading && (
            <div style={{ padding: '12px 24px', borderTop: `1px solid ${PAGE_RGBA}0.20)`, background: `${PAGE_RGBA}0.04)`, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '12.5px', color: PAGE_COLOR, fontWeight: 600 }}>
                ✓ {typeSchema.typeName}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                {typeSchema.fields.length} fields · bundle key: <code style={{ color: 'var(--color-text-primary)' }}>{typeSchema.pluralName}</code>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '10px' }}>
            <button className="btn btn-outline" onClick={() => setStep(1)}>← Back</button>
            <button className="btn btn-primary" onClick={() => setStep(3)} disabled={!typeSchema || typeSchemaLoading}
              style={{ background: PAGE_COLOR, borderColor: PAGE_COLOR }}>
              Continue — Fill Form →
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════ STEP 3 — Form + Preview ════════════════════ */}
      {step === 3 && typeSchema && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '20px', alignItems: 'start' }}>

            {/* Form column */}
            <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{typeSchema.typeName}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                    Bundle key: <code>{typeSchema.pluralName}</code> · Target: <strong>{selectedGateway}</strong>
                  </div>
                </div>
                <button onClick={() => { setFormData(buildInitialData(typeSchema.fields)) }}
                  style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: '11px' }}>
                  Reset
                </button>
              </div>

              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '560px', overflowY: 'auto' }}>
                {/* Identity fields first */}
                {typeSchema.fields
                  .filter(f => typeSchema.identityFields.includes(f.name))
                  .map(field => (
                    <FieldInput key={field.name} field={field} value={formData[field.name] ?? getDefaultValue(field)}
                      onChange={v => setFormData(d => ({ ...d, [field.name]: v }))} required />
                  ))}
                {/* Divider */}
                {typeSchema.identityFields.length > 0 && typeSchema.fields.some(f => !typeSchema.identityFields.includes(f.name)) && (
                  <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '4px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-secondary)', opacity: 0.6 }}>Optional fields</div>
                  </div>
                )}
                {/* Remaining fields */}
                {typeSchema.fields
                  .filter(f => !typeSchema.identityFields.includes(f.name))
                  .map(field => (
                    <FieldInput key={field.name} field={field} value={formData[field.name] ?? getDefaultValue(field)}
                      onChange={v => setFormData(d => ({ ...d, [field.name]: v }))} />
                  ))}
              </div>

              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button className="btn btn-outline" onClick={() => setStep(2)}>← Back</button>
                <button className="btn btn-primary" onClick={() => setStep(4)} disabled={!identityFilled}
                  style={{ background: PAGE_COLOR, borderColor: PAGE_COLOR }}>
                  Review & Import →
                </button>
                {!identityFilled && (
                  <span style={{ fontSize: '12px', color: '#f59e0b' }}>
                    Fill in required fields: {typeSchema.identityFields.join(', ')}
                  </span>
                )}
              </div>
            </div>

            {/* Live JSON preview column */}
            <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden', position: 'sticky', top: '72px' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: PAGE_COLOR, animation: 'pulse 2s infinite' }} />
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Live Bundle Preview</span>
              </div>
              <pre style={{ margin: 0, padding: '14px 16px', fontSize: '11.5px', fontFamily: 'ui-monospace, monospace', color: '#e6edf3', background: '#0D1117', maxHeight: '540px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.65 }}>
                {currentBundle ? fmtJson(currentBundle) : '{}'}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ STEP 4 — Review & Import ═══════════════════ */}
      {step === 4 && typeSchema && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '20px', alignItems: 'start' }}>

          {/* Import panel */}
          <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ background: 'var(--color-header-bg)', color: '#fff', padding: '18px 24px', borderBottom: `3px solid ${PAGE_COLOR}` }}>
              <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Ready to Import</div>
              <div style={{ fontSize: '12px', opacity: 0.7 }}>
                Forging <strong>{typeSchema.typeName}</strong> entity into gateway <strong>{selectedGateway}</strong>
              </div>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {/* Summary row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', marginBottom: '20px', padding: '12px 14px', background: 'var(--color-input-bg)', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '12px', opacity: importResult?.ok ? 0.55 : 1, transition: 'opacity 0.3s' }}>
                <div><span style={{ color: 'var(--color-text-secondary)' }}>Entity Type: </span><strong>{typeSchema.typeName}</strong></div>
                <div><span style={{ color: 'var(--color-text-secondary)' }}>Bundle key: </span><code>{typeSchema.pluralName}</code></div>
                <div><span style={{ color: 'var(--color-text-secondary)' }}>Target gateway: </span><strong className="font-mono">{selectedGateway}</strong></div>
                <div><span style={{ color: 'var(--color-text-secondary)' }}>Fields included: </span><strong>{Object.keys(cleanBundle(formData)).length}</strong></div>
              </div>

              {/* ── SUCCESS state — locked action row ─────────────────────────── */}
              {importResult?.ok ? (
                <div>
                  {/* Completion banner */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', borderRadius: '8px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.30)', marginBottom: '16px' }}>
                    <div style={{ flexShrink: 0, width: '32px', height: '32px', borderRadius: '50%', background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#15803d' }}>Entity imported successfully</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        <strong>{typeSchema.typeName}</strong> was pushed to <strong>{selectedGateway}</strong>. The action buttons below are now locked to prevent duplicate imports.
                      </div>
                    </div>
                  </div>

                  {/* Post-success actions */}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Primary — reset everything, go to Step 1 */}
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        setStep(1); setImportResult(null)
                        setFormData({}); setSelectedTypeName(''); setTypeSchema(null)
                        setGwTestResult(null)
                        if (gwEntries.length > 0) setSelectedGateway(gwEntries[0].name)
                      }}
                      style={{ background: PAGE_COLOR, borderColor: PAGE_COLOR, display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg>
                      Forge Another Entity
                    </button>

                    {/* Secondary — keep gateway + type, reset form only */}
                    <button
                      className="btn btn-outline"
                      onClick={() => {
                        setStep(3); setImportResult(null)
                        setFormData(buildInitialData(typeSchema.fields))
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      New {typeSchema.typeName} (same gateway)
                    </button>

                    {/* Download — stays available */}
                    <button className="btn btn-outline" onClick={() => {
                      const blob = new Blob([fmtJson(currentBundle)], { type: 'application/json' })
                      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
                      a.download = `${typeSchema.pluralName}_forge_${Date.now()}.json`; a.click()
                      URL.revokeObjectURL(a.href)
                    }} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="21" x2="12" y2="3"/></svg>
                      Download JSON
                    </button>
                  </div>
                </div>
              ) : (
                /* ── PRE-IMPORT / FAILURE state ─────────────────────────── */
                <div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Back to edit — hidden while importing */}
                    {!importing && (
                      <button className="btn btn-outline" onClick={() => setStep(3)}>← Edit Form</button>
                    )}

                    {/* Download bundle */}
                    <button className="btn btn-outline" onClick={() => {
                      const blob = new Blob([fmtJson(currentBundle)], { type: 'application/json' })
                      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
                      a.download = `${typeSchema.pluralName}_forge_${Date.now()}.json`; a.click()
                      URL.revokeObjectURL(a.href)
                    }} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="21" x2="12" y2="3"/></svg>
                      Download JSON
                    </button>

                    {/* Import */}
                    <button className="btn btn-primary" onClick={handleImport} disabled={importing}
                      style={{ background: PAGE_COLOR, borderColor: PAGE_COLOR, display: 'flex', alignItems: 'center', gap: '7px' }}>
                      {importing
                        ? <><Spin />Importing… {importElapsed > 0 && <span style={{ opacity: 0.8, fontSize: '12px' }}>({importElapsed}s / 65s)</span>}</>
                        : importResult && !importResult.ok
                          ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4"/></svg>Retry Import</>
                          : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="21" x2="12" y2="3"/></svg>Import to Gateway</>}
                    </button>

                    {importing && (
                      <button onClick={() => importAbortRef.current?.abort()}
                        style={{ padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', background: 'transparent', border: `1px solid ${PAGE_RGBA}0.4)`, color: PAGE_COLOR, fontSize: '13px', fontWeight: 600 }}>
                        Cancel
                      </button>
                    )}
                  </div>

                  {/* Error result card + recovery actions */}
                  {importResult && !importResult.ok && (
                    <div>
                      <ResultPanel {...importResult} onDismiss={() => setImportResult(null)} />
                      {/* Recovery guidance */}
                      <div style={{ marginTop: '12px', padding: '12px 16px', borderRadius: '8px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.22)' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#92400e', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recovery Options</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '10px', lineHeight: 1.6 }}>
                          Use <strong>Retry Import</strong> for transient errors. If the entity data is wrong, go back to <strong>Edit Form</strong>. If the gateway is unreachable or incorrect, use <strong>Change Gateway</strong>.
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button className="btn btn-outline"
                            onClick={() => setStep(3)}
                            style={{ fontSize: '12px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            Edit Entity Data
                          </button>
                          <button className="btn btn-outline"
                            onClick={() => { setStep(1); setImportResult(null); setGwTestResult(null) }}
                            style={{ fontSize: '12px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                            Change Gateway
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Final bundle preview */}
          <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden', position: 'sticky', top: '72px' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Final Bundle</span>
              <button onClick={() => navigator.clipboard?.writeText(fmtJson(currentBundle))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--color-text-secondary)', padding: '2px 8px', borderRadius: '4px' }}>
                Copy
              </button>
            </div>
            <pre style={{ margin: 0, padding: '14px 16px', fontSize: '11.5px', fontFamily: 'ui-monospace, monospace', color: '#e6edf3', background: '#0D1117', maxHeight: '560px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.65 }}>
              {currentBundle ? fmtJson(currentBundle) : '{}'}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
