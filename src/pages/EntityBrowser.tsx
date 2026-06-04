import { useState, useEffect } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────

const API        = '/api'
const PAGE_COLOR = '#7c3aed'
const PAGE_RGBA  = 'rgba(124,58,237,'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GatewayEntry {
  name:               string
  address:            string
  host:               string
  username:           string
  allowMutations:     boolean
  rejectUnauthorized: boolean
}

interface ConditionType { value: string; label: string }
interface EntityField   { name: string; dataType: string }

interface FilterCondition {
  id:            string
  field:         string
  conditionType: string
  value:         string
}

interface QueryMeta {
  filterArgName:  string
  filterArgDecl:  string
  filterTypeName: string
  returnTypeName: string
  conditionTypes: ConditionType[]
  entityFields:   EntityField[]
  gqlQueryTemplate: string
}

type Step = 1 | 2 | 3 | 4

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Spin() {
  return (
    <span style={{
      display: 'inline-block', width: '13px', height: '13px', flexShrink: 0,
      border: '2px solid rgba(124,58,237,0.25)', borderTopColor: PAGE_COLOR,
      borderRadius: '50%', animation: 'spin 0.7s linear infinite',
    }} />
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

const LBL: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.5px',
  color: 'var(--color-text-secondary)', marginBottom: '5px',
}

function camelToWords(s: string): string {
  return s.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())
}

function uid() { return Math.random().toString(36).slice(2, 9) }

// ─── Build variables object from conditions ───────────────────────────────────

function buildVariables(conditions: FilterCondition[], argName: string) {
  const filterArray = conditions
    .filter(c => c.field && c.conditionType && (c.value !== '' || c.conditionType === 'has'))
    .map(c => {
      let cond: Record<string, unknown>
      if (c.conditionType === 'in') {
        cond = { in: c.value.split(',').map(s => s.trim()).filter(Boolean) }
      } else if (['gt','lt','gte','lte'].includes(c.conditionType)) {
        const n = Number(c.value)
        cond = isNaN(n) ? { [c.conditionType]: c.value } : { [c.conditionType]: n }
      } else {
        cond = { [c.conditionType]: c.value }
      }
      return { field: c.field, condition: cond }
    })
  return { [argName]: filterArray }
}

function buildInlineQuery(variables: Record<string, unknown>) {
  return JSON.stringify(variables, null, 2)
}

// ─── Cell formatter ───────────────────────────────────────────────────────────

function formatCell(v: unknown): React.ReactNode {
  if (v === null || v === undefined)
    return <span style={{ color: 'var(--color-text-secondary)', opacity: 0.35 }}>—</span>
  if (typeof v === 'boolean')
    return (
      <span style={{
        display: 'inline-block', padding: '1px 8px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700,
        background: v ? 'rgba(34,197,94,0.10)' : 'rgba(148,163,184,0.15)',
        color: v ? '#15803d' : 'var(--color-text-secondary)',
      }}>{String(v)}</span>
    )
  if (Array.isArray(v))
    return <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>{v.length} items</span>
  if (typeof v === 'object')
    return <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>object</span>
  const s = String(v)
  if (s.length > 72) return <span title={s}>{s.slice(0, 70)}…</span>
  return s
}

// ─── Results table ────────────────────────────────────────────────────────────

function ResultsTable({ data }: { data: Record<string, unknown>[] }) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const PRIORITY = ['name', 'resolutionPath', 'folderPath', 'path', 'humanReadableName', 'tag', 'enabled', 'description', 'checksum']
  const allKeys  = Array.from(new Set(data.flatMap(r => Object.keys(r)))).filter(k => k !== '__typename')
  const columns  = [...PRIORITY.filter(k => allKeys.includes(k)), ...allKeys.filter(k => !PRIORITY.includes(k))]

  return (
    <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ background: 'var(--color-input-bg)', borderBottom: '2px solid var(--color-border)' }}>
            {columns.map(col => (
              <th key={col} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                {camelToWords(col)}
              </th>
            ))}
            <th style={{ padding: '9px 10px', width: '28px' }} />
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <>
              <tr
                key={i}
                onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                style={{ borderBottom: `1px solid ${expandedRow === i ? 'transparent' : 'var(--color-border)'}`, background: expandedRow === i ? `${PAGE_RGBA}0.04)` : undefined, cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => { if (expandedRow !== i) (e.currentTarget as HTMLElement).style.background = 'var(--color-input-bg)' }}
                onMouseLeave={e => { if (expandedRow !== i) (e.currentTarget as HTMLElement).style.background = '' }}
              >
                {columns.map(col => (
                  <td key={col} style={{ padding: '9px 14px', verticalAlign: 'middle', color: 'var(--color-text-primary)', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: ['name','resolutionPath','path','checksum','goid'].includes(col) ? 'ui-monospace, monospace' : 'inherit', fontSize: ['name','resolutionPath','path','checksum','goid'].includes(col) ? '12px' : '13px' }}>
                    {formatCell(row[col])}
                  </td>
                ))}
                <td style={{ padding: '9px 10px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '14px', opacity: 0.5 }}>
                  {expandedRow === i ? '▲' : '▼'}
                </td>
              </tr>
              {expandedRow === i && (
                <tr key={`exp-${i}`} style={{ borderBottom: '1px solid var(--color-border)', background: `${PAGE_RGBA}0.03)` }}>
                  <td colSpan={columns.length + 1} style={{ padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: PAGE_COLOR, marginTop: '2px', flexShrink: 0 }}>Detail</div>
                      <pre style={{ margin: 0, padding: '14px 16px', borderRadius: '7px', flex: 1, background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', fontSize: '12px', lineHeight: 1.6, color: 'var(--color-text-primary)', overflowX: 'auto', maxHeight: '360px', overflowY: 'auto', fontFamily: 'ui-monospace, monospace' }}>
                        {JSON.stringify(row, null, 2)}
                      </pre>
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EntityBrowser() {
  const [step, setStep] = useState<Step>(1)

  // ── Step 1: gateway ───────────────────────────────────────────────────────
  const [gwEntries, setGwEntries]             = useState<GatewayEntry[]>([])
  const [graphmanSchema, setGraphmanSchema]   = useState('')
  const [selectedGateway, setSelectedGateway] = useState('')
  const [configError, setConfigError]         = useState('')
  const [gwTestLoading, setGwTestLoading]     = useState(false)
  const [gwTestResult, setGwTestResult]       = useState<{ ok: boolean; message: string } | null>(null)

  // ── Step 2: query selection ───────────────────────────────────────────────
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schemaError, setSchemaError]     = useState('')
  const [filterQueries, setFilterQueries] = useState<string[]>([])
  const [selectedQuery, setSelectedQuery] = useState('')
  const [queryFilter, setQueryFilter]     = useState('')
  const [fieldsLoading, setFieldsLoading] = useState(false)
  const [fieldsError, setFieldsError]     = useState('')

  // ── Step 3: filter condition builder ─────────────────────────────────────
  const [queryMeta, setQueryMeta]         = useState<QueryMeta | null>(null)
  const [conditions, setConditions]       = useState<FilterCondition[]>([])
  const [fetching, setFetching]           = useState(false)
  const [fetchError, setFetchError]       = useState('')
  const [previewTab, setPreviewTab]       = useState<'query' | 'variables'>('query')

  // ── Step 4: results ───────────────────────────────────────────────────────
  const [results, setResults]       = useState<Record<string, unknown>[]>([])
  const [fetchedQuery, setFetchedQuery] = useState('')

  // ── Load gateways on mount ────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/graphman-config`)
      .then(async r => {
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `HTTP ${r.status}`) }
        return r.json()
      })
      .then(d => {
        if (!d.success) throw new Error(d.error || 'Could not load graphman configuration.')
        const entries: GatewayEntry[] = Object.entries(d.gateways || {}).map(
          ([name, gw]) => ({ name, ...(gw as Omit<GatewayEntry, 'name'>) })
        )
        setGwEntries(entries)
        if (!d.options?.schema) throw new Error('options.schema is not set in graphman.configuration. Open App Config and add it.')
        setGraphmanSchema(d.options.schema)
        if (entries.length > 0) setSelectedGateway(entries[0].name)
      })
      .catch(e => setConfigError(`Could not load configuration: ${e.message}`))
  }, [])

  useEffect(() => { setGwTestResult(null) }, [selectedGateway])

  // ── Gateway connectivity test ─────────────────────────────────────────────
  const handleTestGateway = async () => {
    if (!selectedGateway) return
    setGwTestLoading(true); setGwTestResult(null)
    try {
      const res = await fetch(`${API}/gateway-test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gateway: selectedGateway }) })
      const data = await res.json()
      setGwTestResult({ ok: !!data.success, message: data.message || data.error || 'Unknown result.' })
    } catch {
      setGwTestResult({ ok: false, message: 'Cannot reach the API server on port 3002.' })
    } finally { setGwTestLoading(false) }
  }

  // ── Step 1 → 2 ───────────────────────────────────────────────────────────
  const handleContinueStep1 = async () => {
    setSchemaLoading(true); setSchemaError('')
    try {
      const res = await fetch(`${API}/schema/describe?schemaVersion=${encodeURIComponent(graphmanSchema)}`)
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Server returned ${res.status}`) }
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to load schema.')
      setFilterQueries((data.builtinQueries as string[]).filter(q => q.endsWith('ByFilters')).sort())
      setSelectedQuery(''); setQueryFilter(''); setStep(2)
    } catch (e) { setSchemaError((e as Error).message) }
    finally { setSchemaLoading(false) }
  }

  // ── Step 2 → 3: load query metadata ──────────────────────────────────────
  const handleContinueStep2 = async () => {
    if (!selectedQuery) return
    setFieldsLoading(true); setFieldsError('')
    try {
      const res = await fetch(`${API}/schema/query-filters/${encodeURIComponent(selectedQuery)}?schemaVersion=${encodeURIComponent(graphmanSchema)}`)
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Server returned ${res.status}`) }
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to load query metadata.')
      setQueryMeta(data as QueryMeta)
      // Start with one empty condition row
      setConditions([{ id: uid(), field: '', conditionType: 'eq', value: '' }])
      setFetchError(''); setResults([]); setPreviewTab('query')
      setStep(3)
    } catch (e) { setFieldsError((e as Error).message) }
    finally { setFieldsLoading(false) }
  }

  // ── Step 3 → 4: execute query ─────────────────────────────────────────────
  const handleFetch = async () => {
    if (!queryMeta) return
    setFetching(true); setFetchError('')
    try {
      const res = await fetch(`${API}/gateway-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gateway: selectedGateway,
          queryName: selectedQuery,
          filterArgName: queryMeta.filterArgName,
          filterArgDecl: queryMeta.filterArgDecl,
          conditions,
          entityFields: queryMeta.entityFields,
          schemaVersion: graphmanSchema,
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Query failed.')
      setResults(Array.isArray(data.data) ? data.data : data.data ? [data.data] : [])
      setFetchedQuery(selectedQuery)
      setStep(4)
    } catch (e) { setFetchError((e as Error).message) }
    finally { setFetching(false) }
  }

  // ── Condition helpers ─────────────────────────────────────────────────────
  const addCondition    = () => setConditions(prev => [...prev, { id: uid(), field: '', conditionType: 'eq', value: '' }])
  const removeCondition = (id: string) => setConditions(prev => prev.filter(c => c.id !== id))
  const updateCondition = (id: string, patch: Partial<FilterCondition>) =>
    setConditions(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))

  // ── Computed: variables for preview ──────────────────────────────────────
  const variables     = queryMeta ? buildVariables(conditions, queryMeta.filterArgName) : {}
  const activeFilters = queryMeta ? (variables[queryMeta.filterArgName] as unknown[])?.length ?? 0 : 0

  // ── Computed: GQL query text with current entity fields baked in ──────────
  const gqlQueryDisplay = queryMeta?.gqlQueryTemplate ?? ''

  // ── Computed ──────────────────────────────────────────────────────────────
  const selectedEntry  = gwEntries.find(g => g.name === selectedGateway) || null
  const visibleQueries = filterQueries.filter(q => !queryFilter || q.toLowerCase().includes(queryFilter.toLowerCase()))

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1200px' }}>
      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
      `}</style>

      {/* ── Hero banner ─────────────────────────────────────────────────────── */}
      <div style={{ background: `linear-gradient(135deg, ${PAGE_RGBA}0.10) 0%, ${PAGE_RGBA}0.03) 100%)`, border: `1px solid ${PAGE_RGBA}0.20)`, borderLeft: `4px solid ${PAGE_COLOR}`, borderRadius: '10px', padding: '20px 24px', marginBottom: '20px', boxShadow: '0 2px 14px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.2px' }}>
          Entity Browser
          <span style={{ fontWeight: 400, fontSize: '15px', color: 'var(--color-text-secondary)', marginLeft: '12px' }}>
            — Query Gateway Entities by Filter
          </span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '6px', marginBottom: 0 }}>
          Select a gateway, pick a built-in{' '}
          <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px', background: `${PAGE_RGBA}0.10)`, padding: '1px 5px', borderRadius: '3px', color: PAGE_COLOR }}>ByFilters</code>{' '}
          query, define filter conditions, and retrieve matching entities directly from the gateway.
        </p>
      </div>

      {/* ── How It Works ────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          How It Works
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
          {[
            { title: 'Choose Gateway',          desc: 'Select a gateway from graphman.configuration. The schema version is resolved automatically — v11.2.0+ is required for ByFilters queries.' },
            { title: 'Pick a ByFilters Query',   desc: 'Browse all available ByFilters queries exposed by the schema, each targeting a specific entity type such as services or policies.' },
            { title: 'Define Filter Conditions', desc: 'Add field conditions with AND logic. A live GraphQL preview updates as you type — leave blank to return all entities of the selected type.' },
            { title: 'View & Export Results',    desc: 'Matching entities appear in a table. Click any row to expand its full JSON detail. Export all results as a JSON file.' },
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

      {/* ── Step breadcrumb ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', fontSize: '12px', fontWeight: 600 }}>
        {(['Gateway','Query','Filters','Results'] as const).map((label, idx) => {
          const n = (idx + 1) as Step; const active = step === n; const done = step > n
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 11px', borderRadius: '20px', background: active ? `${PAGE_RGBA}0.12)` : done ? 'rgba(34,197,94,0.08)' : 'transparent', color: active ? PAGE_COLOR : done ? '#15803d' : 'var(--color-text-secondary)', border: active ? `1px solid ${PAGE_RGBA}0.25)` : done ? '1px solid rgba(34,197,94,0.20)' : '1px solid transparent' }}>
                <span style={{ width: '17px', height: '17px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? PAGE_COLOR : done ? '#22c55e' : 'var(--color-border)', color: active || done ? '#fff' : 'var(--color-text-secondary)', fontSize: '9.5px', fontWeight: 800 }}>
                  {done ? '✓' : n}
                </span>
                {label}
              </div>
              {idx < 3 && <div style={{ width: '18px', height: '1px', background: done ? '#22c55e' : 'var(--color-border)', opacity: done ? 0.55 : 0.35, margin: '0 3px' }} />}
            </div>
          )
        })}
      </div>

      {/* ═══════════════════════ STEP 1 — Select Gateway ════════════════════ */}
      {step === 1 && (
        <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '28px 32px', maxWidth: '560px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '6px' }}>Choose Gateway</div>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '24px', lineHeight: 1.6 }}>
            Select a gateway from <code>graphman.configuration</code>. ByFilters queries require schema version <strong>v11.2.0+</strong>.
          </p>

          {configError && (
            <div style={{ marginBottom: '18px', padding: '12px 16px', borderRadius: '8px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.30)', fontSize: '12.5px', color: '#b91c1c' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>⚠ Configuration unavailable</div>{configError}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <label style={LBL}>Gateway</label>
            {graphmanSchema && <span style={{ fontSize: '10px', background: `${PAGE_RGBA}0.10)`, color: PAGE_COLOR, borderRadius: '10px', padding: '1px 7px', fontWeight: 700 }}>Schema: {graphmanSchema}</span>}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px' }}>
            <select value={selectedGateway} onChange={e => setSelectedGateway(e.target.value)} style={{ flex: 1, padding: '9px 12px', borderRadius: '8px', border: `1px solid ${selectedGateway ? PAGE_COLOR : 'var(--color-border)'}`, background: 'var(--color-input-bg)', color: 'var(--color-text-primary)', fontSize: '13.5px', fontWeight: selectedGateway ? 600 : 400, outline: 'none', cursor: 'pointer', appearance: 'auto' }}>
              <option value="">— Select a gateway —</option>
              {gwEntries.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
            </select>
            <button onClick={handleTestGateway} disabled={!selectedGateway || gwTestLoading} title="Test GraphQL connectivity" style={{ flexShrink: 0, padding: '9px 14px', borderRadius: '8px', cursor: (!selectedGateway || gwTestLoading) ? 'not-allowed' : 'pointer', background: 'transparent', border: `1px solid ${PAGE_RGBA}0.40)`, color: PAGE_COLOR, fontSize: '12.5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px', opacity: (!selectedGateway || gwTestLoading) ? 0.5 : 1, whiteSpace: 'nowrap' }}>
              {gwTestLoading ? <><Spin /> Testing…</> : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> Test</>}
            </button>
          </div>

          {gwTestResult && (
            <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', borderRadius: '7px', background: gwTestResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(220,38,38,0.08)', border: `1px solid ${gwTestResult.ok ? 'rgba(34,197,94,0.3)' : 'rgba(220,38,38,0.3)'}`, fontSize: '12.5px' }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: gwTestResult.ok ? '#22c55e' : '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}>
                  {gwTestResult.ok ? <CheckIcon /> : <XIcon />}
                </div>
                <span style={{ color: gwTestResult.ok ? '#15803d' : '#b91c1c', fontWeight: 600 }}>{gwTestResult.message}</span>
              </div>
              {!gwTestResult.ok && <div style={{ padding: '7px 12px', borderRadius: '6px', background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.18)', fontSize: '11.5px', color: '#b91c1c' }}>Schema is resolved locally — you can still continue to browse queries, but executing them requires a live gateway.</div>}
            </div>
          )}

          {selectedEntry && (
            <div style={{ marginBottom: '20px', padding: '14px 16px', borderRadius: '8px', background: `${PAGE_RGBA}0.04)`, border: `1px solid ${PAGE_RGBA}0.15)` }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: PAGE_COLOR, marginBottom: '10px' }}>Gateway Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
                {[{ label: 'Host', value: selectedEntry.host || selectedEntry.address || '—' },{ label: 'Username', value: selectedEntry.username || '—' },{ label: 'Allow Mutations', value: selectedEntry.allowMutations ? 'Yes' : 'No' },{ label: 'Reject Unauthorized', value: selectedEntry.rejectUnauthorized ? 'Yes' : 'No' }].map(row => (
                  <div key={row.label}>
                    <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--color-text-secondary)', marginBottom: '1px' }}>{row.label}</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--color-text-primary)', fontFamily: row.label === 'Host' ? 'ui-monospace, monospace' : 'inherit', wordBreak: 'break-all' }}>{row.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {gwEntries.length === 0 && !configError && <div style={{ marginBottom: '20px', padding: '14px 16px', borderRadius: '8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', fontSize: '13px', color: '#b45309' }}>No gateways found in <code>graphman.configuration</code>.</div>}
          {schemaError && <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '7px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', fontSize: '12.5px', color: '#b91c1c' }}>⚠ {schemaError}</div>}

          <button className="btn btn-primary" onClick={handleContinueStep1} disabled={!selectedGateway || schemaLoading} style={{ background: PAGE_COLOR, borderColor: PAGE_COLOR, fontSize: '14px', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {schemaLoading ? <><Spin />Loading Schema…</> : <>Continue <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg></>}
          </button>
        </div>
      )}

      {/* ═══════════════════════ STEP 2 — ByFilters Queries ════════════════ */}
      {step === 2 && (
        <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                ByFilters Queries
                <span style={{ fontSize: '11px', background: `${PAGE_RGBA}0.10)`, color: PAGE_COLOR, borderRadius: '10px', padding: '2px 8px', fontWeight: 700 }}>{filterQueries.length} available</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '3px' }}>Schema <strong>{graphmanSchema}</strong> · Gateway <strong>{selectedGateway}</strong></div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--color-input-bg)', border: '1px solid var(--color-border)', borderRadius: '7px', padding: '6px 12px' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.4 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input value={queryFilter} onChange={e => setQueryFilter(e.target.value)} placeholder="Filter queries…" style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: 'var(--color-text-primary)', width: '160px' }} />
              {queryFilter && <button onClick={() => setQueryFilter('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '14px', padding: 0 }}>×</button>}
            </div>
          </div>

          <div style={{ padding: '16px 24px', minHeight: '180px' }}>
            {visibleQueries.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '13px', opacity: 0.6 }}>
                {filterQueries.length === 0 ? 'No ByFilters queries found. Check that schema version v11.2.0+ is selected.' : 'No matches for your filter.'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
                {visibleQueries.map(q => {
                  const sel = selectedQuery === q; const entityPart = q.replace(/ByFilters$/, '')
                  return (
                    <button key={q} onClick={() => setSelectedQuery(sel ? '' : q)} style={{ padding: '12px 14px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', background: sel ? `${PAGE_RGBA}0.10)` : 'var(--color-input-bg)', border: `1px solid ${sel ? PAGE_COLOR : 'var(--color-border)'}`, transition: 'all 0.12s', display: 'flex', flexDirection: 'column', gap: '5px', boxShadow: sel ? `0 0 0 3px ${PAGE_RGBA}0.10)` : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {sel && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={PAGE_COLOR} strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                        <span style={{ fontSize: '13px', fontWeight: sel ? 700 : 500, color: sel ? PAGE_COLOR : 'var(--color-text-primary)', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>{q}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', background: sel ? `${PAGE_RGBA}0.12)` : 'rgba(184,197,208,0.10)', color: sel ? PAGE_COLOR : 'var(--color-text-secondary)', borderRadius: '8px', padding: '1px 6px', fontWeight: 600, fontFamily: 'ui-monospace, monospace' }}>{entityPart}</span>
                        <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', opacity: 0.55 }}>ByFilters</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {fieldsError && <div style={{ margin: '0 24px 16px', padding: '10px 14px', borderRadius: '7px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', fontSize: '12.5px', color: '#b91c1c' }}>⚠ {fieldsError}</div>}

          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button className="btn btn-outline" onClick={() => { setStep(1); setSelectedQuery(''); setQueryFilter('') }}>← Back</button>
            <button className="btn btn-primary" onClick={handleContinueStep2} disabled={!selectedQuery || fieldsLoading} style={{ background: PAGE_COLOR, borderColor: PAGE_COLOR, display: 'flex', alignItems: 'center', gap: '8px', opacity: !selectedQuery ? 0.45 : 1 }}>
              {fieldsLoading ? <><Spin />Loading…</> : <>Build Filters <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg></>}
            </button>
            {selectedQuery && !fieldsLoading && <span style={{ fontSize: '12px', color: PAGE_COLOR, fontWeight: 600, fontFamily: 'ui-monospace, monospace', opacity: 0.85 }}>✓ {selectedQuery}</span>}
          </div>
        </div>
      )}

      {/* ═══════════════════════ STEP 3 — Filter Conditions ════════════════ */}
      {step === 3 && queryMeta && (
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

          {/* Left: condition builder */}
          <div style={{ flex: 1, background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden', minWidth: 0 }}>

            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                Filter Conditions
                <span style={{ fontSize: '11px', background: `${PAGE_RGBA}0.10)`, color: PAGE_COLOR, borderRadius: '10px', padding: '2px 8px', fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>
                  {queryMeta.filterArgDecl}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                Query <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{selectedQuery}</strong> returns <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{queryMeta.returnTypeName}</strong> · Gateway <strong>{selectedGateway}</strong>
              </div>
            </div>

            {/* Condition rows */}
            <div style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }}>
                Each condition filters on one entity field. All conditions are applied together (AND logic). Leave all conditions blank to return every entity of this type.
              </p>

              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 1fr 32px', gap: '8px', marginBottom: '6px', padding: '0 4px' }}>
                {['Field Name', 'Condition', 'Value', ''].map(h => (
                  <div key={h} style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--color-text-secondary)' }}>{h}</div>
                ))}
              </div>

              {conditions.map(cond => (
                <div key={cond.id} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 1fr 32px', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                  {/* Field name */}
                  {queryMeta.entityFields.length > 0 ? (
                    <select
                      value={cond.field}
                      onChange={e => updateCondition(cond.id, { field: e.target.value })}
                      style={{ padding: '8px 10px', borderRadius: '7px', border: `1px solid ${cond.field ? PAGE_COLOR : 'var(--color-border)'}`, background: 'var(--color-input-bg)', color: 'var(--color-text-primary)', fontSize: '13px', outline: 'none', fontFamily: 'ui-monospace, monospace', cursor: 'pointer', appearance: 'auto' }}
                    >
                      <option value="">— pick field —</option>
                      {queryMeta.entityFields.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={cond.field}
                      onChange={e => updateCondition(cond.id, { field: e.target.value })}
                      placeholder="field name (e.g. name)"
                      style={{ padding: '8px 10px', borderRadius: '7px', border: `1px solid ${cond.field ? PAGE_COLOR : 'var(--color-border)'}`, background: 'var(--color-input-bg)', color: 'var(--color-text-primary)', fontSize: '13px', outline: 'none', fontFamily: 'ui-monospace, monospace' }}
                    />
                  )}

                  {/* Condition type */}
                  <select
                    value={cond.conditionType}
                    onChange={e => updateCondition(cond.id, { conditionType: e.target.value })}
                    style={{ padding: '8px 10px', borderRadius: '7px', border: '1px solid var(--color-border)', background: 'var(--color-input-bg)', color: 'var(--color-text-primary)', fontSize: '13px', outline: 'none', cursor: 'pointer', appearance: 'auto' }}
                  >
                    {queryMeta.conditionTypes.map(ct => (
                      <option key={ct.value} value={ct.value}>{ct.label || ct.value}</option>
                    ))}
                  </select>

                  {/* Value */}
                  <input
                    type={['gt','lt','gte','lte'].includes(cond.conditionType) ? 'number' : 'text'}
                    value={cond.value}
                    onChange={e => updateCondition(cond.id, { value: e.target.value })}
                    placeholder={cond.conditionType === 'in' ? 'val1, val2, …' : cond.conditionType === 'regex' ? '/pattern/' : 'value…'}
                    style={{ padding: '8px 10px', borderRadius: '7px', border: '1px solid var(--color-border)', background: 'var(--color-input-bg)', color: 'var(--color-text-primary)', fontSize: '13px', outline: 'none', fontFamily: 'ui-monospace, monospace' }}
                  />

                  {/* Remove */}
                  <button
                    onClick={() => removeCondition(cond.id)}
                    disabled={conditions.length === 1}
                    title="Remove condition"
                    style={{ width: '32px', height: '32px', borderRadius: '7px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: conditions.length === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: conditions.length === 1 ? 0.3 : 1, fontSize: '16px', flexShrink: 0 }}
                  >
                    ×
                  </button>
                </div>
              ))}

              <button
                onClick={addCondition}
                style={{ marginTop: '8px', padding: '7px 14px', borderRadius: '7px', border: `1px dashed ${PAGE_RGBA}0.35)`, background: 'transparent', color: PAGE_COLOR, fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Condition
              </button>
            </div>

            {/* Error */}
            {fetchError && (
              <div style={{ margin: '0 24px 0', padding: '11px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', fontSize: '12.5px', color: '#b91c1c' }}>
                <strong>Query failed:</strong> {fetchError}
              </div>
            )}

            {/* Actions */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button className="btn btn-outline" onClick={() => { setStep(2); setFetchError('') }}>← Back</button>
              <button className="btn btn-primary" onClick={handleFetch} disabled={fetching} style={{ background: PAGE_COLOR, borderColor: PAGE_COLOR, display: 'flex', alignItems: 'center', gap: '8px', minWidth: '130px', justifyContent: 'center' }}>
                {fetching ? <><Spin />Fetching…</> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Fetch Results</>}
              </button>
              {activeFilters === 0 && !fetching && <span style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', opacity: 0.7 }}>No conditions set — will return all entities</span>}
              {activeFilters > 0 && !fetching && <span style={{ fontSize: '11.5px', color: PAGE_COLOR, fontWeight: 600 }}>{activeFilters} active condition{activeFilters !== 1 ? 's' : ''}</span>}
            </div>
          </div>

          {/* Right: live preview — sticky relative to main's scroll container */}
          <div style={{ width: '380px', flexShrink: 0, position: 'sticky', top: '16px' }}>
            <div style={{ background: 'var(--color-card-bg)', border: `1px solid ${PAGE_RGBA}0.20)`, borderRadius: '10px', overflow: 'hidden' }}>

              {/* Preview tabs */}
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${PAGE_RGBA}0.15)`, background: `${PAGE_RGBA}0.04)`, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: PAGE_COLOR, animation: 'pulse 2.2s infinite', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', fontWeight: 700, color: PAGE_COLOR, textTransform: 'uppercase', letterSpacing: '0.5px', flex: 1 }}>Live Preview</span>
                <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: `1px solid ${PAGE_RGBA}0.20)` }}>
                  {(['query','variables'] as const).map(tab => (
                    <button key={tab} onClick={() => setPreviewTab(tab)} style={{ padding: '3px 10px', fontSize: '11px', fontWeight: 700, background: previewTab === tab ? PAGE_COLOR : 'transparent', color: previewTab === tab ? '#fff' : PAGE_COLOR, border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                      {tab === 'query' ? 'Query' : 'Variables'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Query panel */}
              {previewTab === 'query' && (
                <pre style={{ margin: 0, padding: '16px', fontFamily: 'ui-monospace, monospace', fontSize: '12px', lineHeight: 1.65, color: 'var(--color-text-primary)', background: 'var(--color-input-bg)', overflowX: 'auto', maxHeight: '480px', overflowY: 'auto' }}>
                  {gqlQueryDisplay}
                </pre>
              )}

              {/* Variables panel */}
              {previewTab === 'variables' && (
                <>
                  {activeFilters === 0 ? (
                    <div style={{ padding: '16px', fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                      <div style={{ fontStyle: 'italic', opacity: 0.7, marginBottom: '10px' }}>No conditions set — the gateway will return all entities of this type.</div>
                      <pre style={{ margin: 0, padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-input-bg)', fontSize: '11.5px', fontFamily: 'ui-monospace, monospace', color: 'var(--color-text-primary)' }}>
                        {JSON.stringify({ [queryMeta.filterArgName]: [] }, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <pre style={{ margin: 0, padding: '16px', fontFamily: 'ui-monospace, monospace', fontSize: '12px', lineHeight: 1.65, color: 'var(--color-text-primary)', background: 'var(--color-input-bg)', overflowX: 'auto', maxHeight: '480px', overflowY: 'auto' }}>
                      {buildInlineQuery(variables)}
                    </pre>
                  )}
                </>
              )}

              <div style={{ padding: '10px 16px', borderTop: `1px solid ${PAGE_RGBA}0.12)`, background: `${PAGE_RGBA}0.03)`, fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                {activeFilters > 0
                  ? <><strong style={{ color: PAGE_COLOR }}>{activeFilters}</strong> active condition{activeFilters !== 1 ? 's' : ''} · returns <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{queryMeta.returnTypeName}</strong></>
                  : <>Fill conditions above · returns <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{queryMeta.returnTypeName}</strong></>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ STEP 4 — Results ════════════════════════════ */}
      {step === 4 && (
        <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden' }}>

          {/* Summary bar */}
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', background: results.length > 0 ? `${PAGE_RGBA}0.03)` : 'rgba(245,158,11,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: results.length > 0 ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: results.length > 0 ? '#16a34a' : '#b45309', flexShrink: 0, fontSize: results.length > 0 ? '14px' : '20px' }}>
                {results.length > 0 ? <CheckIcon /> : '◎'}
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {results.length === 0 ? 'No results found' : `${results.length} result${results.length !== 1 ? 's' : ''} returned`}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
                  Query <span style={{ fontFamily: 'ui-monospace, monospace', color: PAGE_COLOR, fontWeight: 600 }}>{fetchedQuery}</span> · Gateway <strong>{selectedGateway}</strong>
                  {activeFilters > 0 && <span style={{ marginLeft: '6px' }}>· {activeFilters} condition{activeFilters !== 1 ? 's' : ''} applied</span>}
                </div>
              </div>
            </div>
            {results.length > 0 && (
              <button
                onClick={() => { const b = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `${fetchedQuery}-results.json`; a.click(); URL.revokeObjectURL(u) }}
                style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: '7px', fontSize: '12.5px', fontWeight: 600, background: `${PAGE_RGBA}0.10)`, color: PAGE_COLOR, border: `1px solid ${PAGE_RGBA}0.25)`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export JSON
              </button>
            )}
          </div>

          {results.length === 0 ? (
            <div style={{ padding: '60px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.35 }}>◎</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '6px' }}>No entities matched your conditions</div>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', maxWidth: '380px', margin: '0 auto 24px', lineHeight: 1.6 }}>
                Try broadening or clearing your filter conditions. An empty condition list returns all entities of this type.
              </p>
              <button className="btn btn-primary" onClick={() => { setStep(3); setFetchError('') }} style={{ background: PAGE_COLOR, borderColor: PAGE_COLOR, display: 'inline-flex', alignItems: 'center', gap: '7px' }}>← Adjust Conditions</button>
            </div>
          ) : (
            <div style={{ padding: '16px 24px' }}>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '0 0 12px', opacity: 0.7 }}>Click any row to expand its full details.</p>
              <ResultsTable data={results} />
            </div>
          )}

          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={() => { setStep(3); setFetchError('') }}>← Adjust Conditions</button>
            <button className="btn btn-outline" onClick={() => setStep(2)}>↩ Change Query</button>
            <button className="btn btn-outline" onClick={() => { setStep(1); setSelectedQuery(''); setQueryFilter(''); setResults([]) }}>⌂ Start Over</button>
          </div>
        </div>
      )}
    </div>
  )
}
