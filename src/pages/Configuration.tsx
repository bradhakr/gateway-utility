import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDirtyGuard } from '../hooks/useDirtyGuard'
import { NavigationBlocker } from '../components/NavigationBlocker'

interface Config {
  graphmanHome:   string
  sourceGateway:  string
  targetGateway:  string
  assertionType:  string
  exportSchema:   string
  importSchema:   string
}

// Fields rendered as plain text inputs (schema fields handled separately)
const TEXT_FIELDS: { key: keyof Config; label: string; desc: string; placeholder: string; mono?: boolean }[] = [
  { key: 'sourceGateway',  label: 'Source Gateway',         placeholder: 'e.g. vks',               desc: 'Name of the gateway to read/export bundles from. Must match an entry in the graphman configuration.' },
  { key: 'targetGateway',  label: 'Target Gateway',         placeholder: 'e.g. aws',               desc: 'Name of the gateway to import entities to. Can be the same as source.' },
  { key: 'graphmanHome',   label: 'Graphman Home',          placeholder: '../../graphman-client-main', desc: 'Relative or absolute path to the graphman-client-main directory containing graphman.sh.', mono: true },
  { key: 'assertionType',  label: 'Default Assertion Type', placeholder: 'EvaluateJsonPathExpressionV2', desc: 'Pre-filled assertion type for the Find Assertions search.' },
]

export default function Configuration() {
  const navigate = useNavigate()
  const [config, setConfig] = useState<Config>({
    graphmanHome:  '',
    sourceGateway: '',
    targetGateway: '',
    assertionType: '',
    exportSchema:  '',
    importSchema:  '',
  })
  const [original, setOriginal]       = useState<Config | null>(null)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [saveResult, setSaveResult]   = useState<{ success: boolean; message: string } | null>(null)
  const [schemaVersions, setSchemaVersions] = useState<string[]>([])
  const [schemaDir, setSchemaDir]     = useState('')
  const [schemasLoading, setSchemasLoading] = useState(false)
  // Load config
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(d => {
        const cfg: Config = {
          graphmanHome:  d.graphmanHome  ?? '',
          sourceGateway: d.sourceGateway ?? '',
          targetGateway: d.targetGateway ?? '',
          assertionType: d.assertionType ?? '',
          exportSchema:  d.exportSchema  ?? '',
          importSchema:  d.importSchema  ?? '',
        }
        setConfig(cfg)
        setOriginal(cfg)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Load schema versions (re-fetch whenever graphmanHome changes so the list stays fresh)
  useEffect(() => {
    setSchemasLoading(true)
    fetch('/api/schema/versions')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setSchemaVersions(d.versions || [])
          setSchemaDir(d.schemaDir || '')
        }
      })
      .catch(() => {})
      .finally(() => setSchemasLoading(false))
  }, [config.graphmanHome])

  const isDirty   = original !== null && JSON.stringify(config) !== JSON.stringify(original)
  const navBlocker = useDirtyGuard(isDirty)

  function handleChange(key: keyof Config, value: string) {
    setConfig(prev => ({ ...prev, [key]: value }))
    setSaveResult(null)
  }

  async function handleSave() {
    setSaving(true); setSaveResult(null)
    try {
      const resp = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const data = await resp.json()
      if (data.success) {
        setOriginal({ ...config })
        setSaveResult({ success: true, message: 'Configuration saved successfully.' })
      } else {
        setSaveResult({ success: false, message: data.error ?? 'Failed to save configuration.' })
      }
    } catch (err) {
      setSaveResult({ success: false, message: String(err) })
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    if (original) { setConfig({ ...original }); setSaveResult(null) }
  }

  // Shared border colour — red when the field has been modified
  function fieldBorder(key: keyof Config) {
    return config[key] !== (original?.[key] ?? '')
      ? '1px solid rgba(204,0,0,0.6)'
      : '1px solid var(--color-border)'
  }

  if (loading) {
    return (
      <div style={{ padding: '28px 32px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
        Loading configuration…
      </div>
    )
  }

  return (
    <>
    <NavigationBlocker blocker={navBlocker}
      description="You have unsaved configuration changes. Leaving this page will discard them." />
    <div style={{ padding: '28px 32px', maxWidth: '780px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Page title ─────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(100,116,139,0.10) 0%, rgba(100,116,139,0.03) 100%)',
        border: '1px solid rgba(100,116,139,0.20)',
        borderLeft: '4px solid #64748b',
        borderRadius: '10px',
        padding: '20px 24px',
        marginBottom: '24px',
        boxShadow: '0 2px 14px rgba(0,0,0,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.2px' }}>Configuration</h1>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '6px', marginBottom: 0 }}>
            Manage gateway connection settings and script paths. Changes are persisted to{' '}
            <code style={{ fontFamily: 'monospace', fontSize: '12px', background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: '3px' }}>config.json</code>.
          </p>
        </div>
        <button onClick={() => navigate('/dashboard')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '7px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          Back to Home
        </button>
      </div>

      {/* ── Text fields ─────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
        {TEXT_FIELDS.map((field, idx) => (
          <div key={field.key} style={{ padding: '20px 24px', borderBottom: idx < TEXT_FIELDS.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap' }}>
              <div style={{ flex: '0 0 200px' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)', display: 'block', marginBottom: '4px' }}>
                  {field.label}
                </label>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                  {field.desc}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: '220px' }}>
                <input
                  type="text"
                  value={config[field.key]}
                  onChange={e => handleChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: '6px', fontSize: '13px',
                    fontFamily: field.mono ? 'ui-monospace, monospace' : 'inherit',
                    background: 'var(--color-input-bg)', border: fieldBorder(field.key),
                    color: 'var(--color-text-primary)', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Schema version dropdowns ─────────────────────────────────────────── */}
      <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>

        {/* Section header */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-header-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>Schema Versions</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
              Schemas detected from{' '}
              <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: '10px', background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: '3px' }}>
                {schemaDir || `${config.graphmanHome || '…'}/schema/`}
              </code>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {schemasLoading && (
              <span style={{ display: 'inline-block', width: '13px', height: '13px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            )}
            <span style={{
              fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '20px',
              background: schemaVersions.length > 0 ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.1)',
              color: schemaVersions.length > 0 ? '#86efac' : 'rgba(255,255,255,0.5)',
              border: schemaVersions.length > 0 ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.15)',
            }}>
              {schemaVersions.length === 0
                ? schemasLoading ? 'Scanning…' : 'No schemas found'
                : `${schemaVersions.length} schema${schemaVersions.length !== 1 ? 's' : ''} available`}
            </span>
          </div>
        </div>

        {/* Export schema row */}
        <SchemaDropdownRow
          label="Export Schema Version"
          desc="Schema version passed to graphman when exporting bundles from the source gateway."
          value={config.exportSchema}
          original={original?.exportSchema ?? ''}
          versions={schemaVersions}
          schemaDir={schemaDir}
          loading={schemasLoading}
          onChange={v => handleChange('exportSchema', v)}
        />

        {/* Import schema row */}
        <SchemaDropdownRow
          label="Import Schema Version"
          desc="Schema version passed to graphman when importing bundles into the target gateway."
          value={config.importSchema}
          original={original?.importSchema ?? ''}
          versions={schemaVersions}
          schemaDir={schemaDir}
          loading={schemasLoading}
          onChange={v => handleChange('importSchema', v)}
          last
        />
      </div>

      {/* ── Status ──────────────────────────────────────────────────────────── */}
      {saveResult && (
        <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '7px', fontSize: '13px', background: saveResult.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: saveResult.success ? '#86efac' : '#fca5a5', border: `1px solid ${saveResult.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
          {saveResult.success ? '✓ ' : '✕ '}{saveResult.message}
        </div>
      )}

      {/* ── Footer actions ───────────────────────────────────────────────────── */}
      <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        {isDirty && (
          <span style={{ fontSize: '12px', color: '#facc15', background: 'rgba(250,204,21,0.1)', border: '1px solid rgba(250,204,21,0.25)', padding: '3px 9px', borderRadius: '4px' }}>
            Unsaved changes
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={handleReset} disabled={!isDirty || saving}
          style={{ padding: '9px 20px', borderRadius: '7px', cursor: (!isDirty || saving) ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 600, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', opacity: (!isDirty || saving) ? 0.5 : 1 }}>
          Reset
        </button>
        <button onClick={handleSave} disabled={!isDirty || saving}
          style={{ padding: '9px 24px', borderRadius: '7px', cursor: (!isDirty || saving) ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 700, background: (!isDirty || saving) ? 'rgba(204,0,0,0.4)' : 'var(--color-accent-red)', border: 'none', color: '#fff', opacity: (!isDirty || saving) ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
          {saving
            ? <><span style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Saving…</>
            : 'Save Configuration'}
        </button>
      </div>
    </div>
    </>
  )
}

// ─── Schema dropdown row — Entity Forge gateway pattern ──────────────────────

const SCHEMA_COLOR = '#0891b2'   // teal accent, neutral for both export/import
const SCHEMA_RGBA  = 'rgba(8,145,178,'

function SchemaDropdownRow({ label, desc, value, original, versions, schemaDir, loading, onChange, last }: {
  label: string
  desc: string
  value: string
  original: string
  versions: string[]
  schemaDir: string
  loading: boolean
  onChange: (v: string) => void
  last?: boolean
}) {
  const changed    = value !== original
  const hasVersion = !!value
  // Whether the currently typed/selected value exists in the discovered list
  const isOnDisk   = versions.includes(value)

  return (
    <div style={{ padding: '20px 24px', borderBottom: last ? 'none' : '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap' }}>

        {/* Label + description */}
        <div style={{ flex: '0 0 200px' }}>
          <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)', display: 'block', marginBottom: '4px' }}>
            {label}
          </label>
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
            {desc}
          </div>
        </div>

        {/* Control column */}
        <div style={{ flex: 1, minWidth: '260px' }}>

          {/* Label row with current-value badge (Entity Forge pattern) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-secondary)' }}>
              Schema Version
            </span>
            {hasVersion && (
              <span style={{ fontSize: '10px', background: `${SCHEMA_RGBA}0.10)`, color: SCHEMA_COLOR, borderRadius: '10px', padding: '1px 7px', fontWeight: 700 }}>
                {value}
              </span>
            )}
            {changed && (
              <span style={{ fontSize: '10px', background: 'rgba(204,0,0,0.08)', color: '#CC0000', borderRadius: '10px', padding: '1px 7px', fontWeight: 600 }}>
                modified
              </span>
            )}
          </div>

          {/* Dropdown — Entity Forge style: colored border when selected */}
          <select
            value={versions.includes(value) ? value : ''}
            onChange={e => onChange(e.target.value)}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: '8px',
              border: `1px solid ${hasVersion && isOnDisk ? SCHEMA_COLOR : 'var(--color-border)'}`,
              background: 'var(--color-input-bg)',
              color: 'var(--color-text-primary)',
              fontSize: '13.5px', fontWeight: hasVersion ? 600 : 400,
              outline: 'none', cursor: loading ? 'wait' : 'pointer',
              appearance: 'auto', boxSizing: 'border-box',
              opacity: loading ? 0.6 : 1,
            }}
          >
            <option value="">
              {loading ? 'Scanning schema folder…' : versions.length === 0 ? '— No schemas found on disk —' : '— Select a schema version —'}
            </option>
            {[...versions].reverse().map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>

          {/* Detail card — appears when a version is selected (Entity Forge pattern) */}
          {hasVersion && (
            <div style={{
              marginTop: '10px', padding: '12px 14px', borderRadius: '8px',
              background: `${SCHEMA_RGBA}0.04)`,
              border: `1px solid ${SCHEMA_RGBA}0.18)`,
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: SCHEMA_COLOR, marginBottom: '8px' }}>
                Schema Details
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
                {[
                  { label: 'Version',   value: value },
                  { label: 'Status',    value: isOnDisk ? '✓ Available on disk' : '⚠ Not found on disk' },
                  { label: 'Path',      value: schemaDir ? `${schemaDir}/${value}` : `graphmanHome/schema/${value}` },
                  { label: 'Source',    value: isOnDisk ? 'Graphman client bundle' : 'Manual entry' },
                ].map(row => (
                  <div key={row.label}>
                    <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--color-text-secondary)', marginBottom: '1px' }}>
                      {row.label}
                    </div>
                    <div style={{
                      fontSize: '12px', color: row.label === 'Status'
                        ? (isOnDisk ? '#15803d' : '#b45309')
                        : 'var(--color-text-primary)',
                      fontFamily: row.label === 'Path' || row.label === 'Version' ? 'ui-monospace, monospace' : 'inherit',
                      wordBreak: 'break-all',
                    }}>
                      {row.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual text input — fallback for typing a version not on disk */}
          {(!isOnDisk || versions.length === 0) && (
            <div style={{ marginTop: '8px' }}>
              <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={loading ? 'Scanning…' : 'Type version manually, e.g. v11.1.3'}
                style={{
                  width: '100%', padding: '7px 12px', borderRadius: '6px',
                  fontSize: '12px', fontFamily: 'ui-monospace, monospace',
                  background: 'var(--color-input-bg)',
                  border: `1px solid ${changed ? 'rgba(204,0,0,0.5)' : 'var(--color-border)'}`,
                  color: 'var(--color-text-primary)', outline: 'none', boxSizing: 'border-box',
                }}
              />
              {versions.length === 0 && !loading && (
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px', lineHeight: '1.5' }}>
                  No schema folders found in <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: '10px' }}>graphmanHome/schema/</code>.
                  Check the <strong>Graphman Home</strong> path above.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
