import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useDirtyGuard } from '../hooks/useDirtyGuard'
import { NavigationBlocker } from '../components/NavigationBlocker'

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
  certBase64?:    string   // trustedCerts only
  p12?:           string   // keys: base64-encoded PKCS#12 bundle
  pem?:           string   // keys: PEM-encoded encrypted private key
  certChain?:     string[] // keys: PEM certificate chain
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

// ─── Field metadata for form editor ──────────────────────────────────────────

interface CertFieldDef { key: string; label: string; type: 'readonly' | 'boolean' | 'textarea'; desc?: string }

const TRUSTED_CERT_FIELDS: CertFieldDef[] = [
  { key: 'name',                         label: 'Name',                             type: 'readonly',  desc: 'Display name — primary identifier' },
  { key: 'trustedForSsl',                label: 'Trusted for SSL',                  type: 'boolean',   desc: 'Include this cert in the SSL trust store' },
  { key: 'verifyHostname',               label: 'Verify Hostname',                  type: 'boolean',   desc: 'Verify the certificate CN matches the connecting hostname' },
  { key: 'trustAnchor',                  label: 'Trust Anchor',                     type: 'boolean',   desc: 'Treat as a root / trust anchor' },
  { key: 'revocationCheckingEnabled',    label: 'Revocation Checking',              type: 'boolean',   desc: 'Enable OCSP / CRL revocation checking' },
  { key: 'trustedAsSamlIssuer',          label: 'Trusted as SAML Issuer',           type: 'boolean',   desc: 'Accept SAML tokens signed by this cert' },
  { key: 'trustedAsSamlAttestingEntity', label: 'Trusted as SAML Attesting Entity', type: 'boolean',   desc: 'Accept SAML holder-of-key assertions from this entity' },
  { key: 'subjectDn',                    label: 'Subject DN',                       type: 'readonly' },
  { key: 'issuerDn',                     label: 'Issuer DN',                        type: 'readonly' },
  { key: 'notBefore',                    label: 'Not Before',                       type: 'readonly' },
  { key: 'notAfter',                     label: 'Not After',                        type: 'readonly' },
  { key: 'thumbprintSha1',               label: 'SHA1 Thumbprint',                  type: 'readonly' },
  { key: 'certBase64',                   label: 'Certificate (Base64 DER)',          type: 'textarea',  desc: 'Paste a new DER base64 value only when renewing this certificate.' },
]

// Keys are replace-only: alias/keystoreId/keyType/subjectDn are derived from the key itself.
// The only meaningful update is to provide new p12 (PKCS#12) or pem (encrypted PEM) material.
const PRIVATE_KEY_FIELDS: CertFieldDef[] = [
  { key: 'alias',      label: 'Alias',                      type: 'readonly', desc: 'Key alias — primary identifier' },
  { key: 'keystoreId', label: 'Keystore ID',                type: 'readonly' },
  { key: 'keyType',    label: 'Key Type',                   type: 'readonly' },
  { key: 'subjectDn',  label: 'Subject DN',                 type: 'readonly' },
  { key: 'issuerDn',   label: 'Issuer DN',                  type: 'readonly' },
  { key: 'notBefore',  label: 'Not Before',                 type: 'readonly' },
  { key: 'notAfter',   label: 'Not After',                  type: 'readonly' },
  { key: 'p12',        label: 'PKCS#12 Bundle (Base64)',     type: 'textarea', desc: 'To replace this key: paste a new Base64-encoded PKCS#12 bundle (contains private key + cert chain).' },
  { key: 'pem',        label: 'PEM Private Key',            type: 'textarea', desc: 'To replace this key: paste a new PEM-encoded encrypted private key.' },
]

// Keys exported in certChain (PEM array) — displayed read-only alongside Additional Fields
const KEY_KNOWN_EXTRA = ['certChain', 'checksum', 'goid']

// ─── Cert / Key inline form editor ────────────────────────────────────────────

interface CertFormEditorProps {
  entityType: EntityType
  item: CertItem
  savedEdit?: CertItem
  isReadOnly: boolean
  onSave: (parsed: CertItem) => void
  onBack: () => void
  onDirtyChange?: (dirty: boolean) => void
}

function CertFormEditor({ entityType, item, savedEdit, isReadOnly, onSave, onBack, onDirtyChange }: CertFormEditorProps) {
  const [formState, setFormState] = useState<CertItem>({ ...(savedEdit ?? item) })
  const [isDirty, setIsDirty]     = useState(false)
  const [isSaved, setIsSaved]     = useState(!!savedEdit)
  // Per-textarea-field expand state; auto-expand all for keys (only editable material) or when savedEdit exists
  const [expandedFields, setExpandedFields] = useState<Record<string, boolean>>(() => {
    const tFields = (entityType === 'keys' ? PRIVATE_KEY_FIELDS : TRUSTED_CERT_FIELDS).filter(f => f.type === 'textarea')
    if (entityType === 'keys' || !!savedEdit) return Object.fromEntries(tFields.map(f => [f.key, true]))
    return {}
  })
  const [copied, setCopied]       = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  const id     = getItemId(item)
  const isKey  = entityType === 'keys'
  const fields = isKey ? PRIVATE_KEY_FIELDS : TRUSTED_CERT_FIELDS
  const liveJson = JSON.stringify({ [entityType]: [formState] }, null, 2)

  useEffect(() => { onDirtyChange?.(isDirty) }, [isDirty, onDirtyChange])

  function setField(key: string, value: unknown) {
    if (isReadOnly) return
    setFormState(prev => ({ ...prev, [key]: value }))
    setIsDirty(true); setIsSaved(false)
  }

  function handleSave() {
    if (isReadOnly) return
    onSave(formState); setIsDirty(false); setIsSaved(true)
  }

  function handleBack() {
    if (isDirty && !window.confirm('You have unsaved edits. Leave without saving?')) return
    onDirtyChange?.(false); onBack()
  }

  function handleDownload() {
    const blob = new Blob([liveJson], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = `${entityType}_${id.replace(/[^a-z0-9]/gi, '_')}.json`
    a.click(); URL.revokeObjectURL(url)
    setDownloaded(true); setTimeout(() => setDownloaded(false), 2000)
  }

  function handleCopy() {
    navigator.clipboard.writeText(liveJson).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  const knownKeys      = [...fields.map(f => f.key), ...(isKey ? KEY_KNOWN_EXTRA : [])]
  const booleanFields  = fields.filter(f => f.type === 'boolean')
  const readonlyFields = fields.filter(f => f.type === 'readonly')
  const textareaFields = fields.filter(f => f.type === 'textarea')
  const additionalKeys = Object.keys(formState).filter(k => !knownKeys.includes(k))

  const INPUT_ST: React.CSSProperties = { padding: '7px 10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '5px', fontSize: '12px', fontFamily: 'ui-monospace,monospace', color: 'var(--color-text-secondary)', wordBreak: 'break-all', lineHeight: 1.5, width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>

      {/* ── Header ── */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--color-header-bg)', flexWrap: 'wrap' }}>
        <button onClick={handleBack}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '5px', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '4px 10px', fontSize: '12px', flexShrink: 0 }}>
          ← Back to list
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
          <span style={{ background: PAGE_COLOR, color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
            {isKey ? 'Private Key' : 'Trusted Cert'}
          </span>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{id}</span>
          {isReadOnly  && <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', background: 'rgba(107,114,128,0.12)', border: '1px solid rgba(107,114,128,0.25)', padding: '1px 7px', borderRadius: '4px', whiteSpace: 'nowrap' }}>READ-ONLY</span>}
          {isDirty     && <span style={{ fontSize: '10px', fontWeight: 700, color: '#facc15', background: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.3)',  padding: '1px 7px', borderRadius: '4px', whiteSpace: 'nowrap' }}>UNSAVED</span>}
          {isSaved && !isDirty && <span style={{ fontSize: '10px', fontWeight: 700, color: '#86efac', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', padding: '1px 7px', borderRadius: '4px', whiteSpace: 'nowrap' }}>✓ STAGED</span>}
        </div>
        <button onClick={handleDownload}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 500, background: downloaded ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)', border: `1px solid ${downloaded ? 'rgba(34,197,94,0.35)' : 'var(--color-border)'}`, color: downloaded ? '#86efac' : 'var(--color-text-secondary)', transition: 'all 0.2s', flexShrink: 0 }}>
          <DownloadIcon size={12} /> {downloaded ? 'Downloaded!' : 'Download'}
        </button>
      </div>

      {/* ── Split panel ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 390px', minHeight: '520px' }}>

        {/* Left — form */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', borderRight: '1px solid var(--color-border)' }}>

          {/* Trust / behaviour toggles */}
          {booleanFields.some(f => formState[f.key] !== undefined || item[f.key] !== undefined) && (
            <section style={{ marginBottom: '22px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>Trust Settings</div>
              {booleanFields.map(f => {
                const cur = formState[f.key]
                if (cur === undefined && item[f.key] === undefined) return null
                const bval = Boolean(cur ?? item[f.key] ?? false)
                return (
                  <div key={f.key} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ flex: 1, marginRight: '16px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{f.label}</div>
                      {f.desc && <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px', lineHeight: 1.4 }}>{f.desc}</div>}
                    </div>
                    <div onClick={() => setField(f.key, !bval)}
                      style={{ width: '38px', height: '20px', borderRadius: '10px', cursor: isReadOnly ? 'default' : 'pointer', background: bval ? '#22c55e' : 'rgba(255,255,255,0.12)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: '2px', left: bval ? '20px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                    </div>
                  </div>
                )
              })}
            </section>
          )}

          {/* Read-only info fields */}
          <section style={{ marginBottom: '22px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>{isKey ? 'Key Details' : 'Certificate Info'}</div>
            {readonlyFields.map(f => {
              const val = formState[f.key]
              if (val === undefined || val === null || val === '') return null
              return (
                <div key={f.key} style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '3px' }}>{f.label}</div>
                  <div style={INPUT_ST}>{String(val)}</div>
                </div>
              )
            })}
          </section>

          {/* Key-replacement notice */}
          {isKey && (
            <div style={{ marginBottom: '20px', padding: '10px 14px', borderRadius: '6px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', fontSize: '12px', color: '#fcd34d', lineHeight: 1.5 }}>
              <strong>Replace-only:</strong> Key metadata (alias, type, subject) is determined by the key material itself and cannot be edited directly.
              To replace this key, paste a new <strong>PKCS#12</strong> or <strong>PEM</strong> bundle in the field below, then save and import.
            </div>
          )}

          {/* Textarea fields — certBase64 for trustedCerts; p12 / pem for keys */}
          {/* Textarea always stays in DOM (CSS display) so focus/value survive re-renders */}
          {textareaFields.map(f => {
            const rawVal = formState[f.key] ?? item[f.key]
            if (rawVal === undefined || rawVal === null) return null
            const str = typeof rawVal === 'string' ? rawVal : JSON.stringify(rawVal)
            const textareaVal = typeof formState[f.key] === 'string' ? formState[f.key] as string : JSON.stringify(formState[f.key] ?? '')
            const expanded = !!expandedFields[f.key]
            return (
              <section key={f.key} style={{ marginBottom: '22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{f.label}</div>
                  <button type="button"
                    onClick={() => setExpandedFields(prev => ({ ...prev, [f.key]: !prev[f.key] }))}
                    style={{ fontSize: '11px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '2px 8px' }}>
                    {expanded ? 'Collapse' : 'Expand'}
                  </button>
                </div>
                {f.desc && <div style={{ fontSize: '11px', color: 'rgba(184,197,208,0.4)', marginBottom: '6px', lineHeight: 1.4 }}>{f.desc}</div>}
                <textarea
                  value={textareaVal}
                  onChange={e => setField(f.key, e.target.value)}
                  readOnly={isReadOnly} rows={8} spellCheck={false}
                  style={{ display: expanded ? 'block' : 'none', width: '100%', resize: 'vertical', background: '#0d1117', color: '#c9d1d9', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '5px', fontFamily: 'ui-monospace,monospace', fontSize: '11px', lineHeight: '1.5', padding: '10px 12px', outline: 'none', boxSizing: 'border-box', opacity: isReadOnly ? 0.6 : 1 }} />
                <div style={{ display: expanded ? 'none' : 'block', ...INPUT_ST, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {str.slice(0, 80)}{str.length > 80 ? `… (+${str.length - 80} chars)` : ''}
                </div>
              </section>
            )
          })}

          {/* certChain — read-only PEM cert chain display (keys only) */}
          {isKey && Array.isArray(item.certChain) && (item.certChain as string[]).length > 0 && (
            <section style={{ marginBottom: '22px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                Certificate Chain ({(item.certChain as string[]).length} cert{(item.certChain as string[]).length > 1 ? 's' : ''})
              </div>
              {(item.certChain as string[]).map((pem, i) => (
                <div key={i} style={{ ...INPUT_ST, marginBottom: '6px', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pem.trim().slice(0, 100)}{pem.trim().length > 100 ? '…' : ''}
                </div>
              ))}
            </section>
          )}

          {/* Additional / unknown fields */}
          {additionalKeys.length > 0 && (
            <section style={{ marginBottom: '22px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>Additional Fields</div>
              {additionalKeys.map(k => (
                <div key={k} style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '3px' }}>{k}</div>
                  <div style={{ ...INPUT_ST, color: 'rgba(184,197,208,0.5)' }}>
                    {typeof formState[k] === 'object' ? JSON.stringify(formState[k]) : String(formState[k] ?? '')}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* Action buttons */}
          {!isReadOnly && (
            <div style={{ paddingTop: '16px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={handleBack}
                style={{ padding: '8px 18px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={!isDirty}
                style={{ padding: '8px 20px', borderRadius: '6px', cursor: isDirty ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 700, background: isDirty ? PAGE_COLOR : `${PAGE_RGBA}0.4)`, border: 'none', color: '#fff', opacity: isDirty ? 1 : 0.55, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <SaveIcon /> Save to Staging
              </button>
            </div>
          )}
        </div>

        {/* Right — live JSON */}
        <div style={{ background: '#0d1117', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#8b949e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Bundle — <span style={{ color: '#c9d1d9' }}>{entityType}_{id.replace(/[^a-z0-9]/gi, '_')}.json</span>
            </span>
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              <button onClick={handleCopy}
                style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.12)', background: copied ? 'rgba(34,197,94,0.15)' : 'transparent', color: copied ? '#86efac' : '#8b949e', cursor: 'pointer', transition: 'all 0.2s' }}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
              <button onClick={handleDownload}
                style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#8b949e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <DownloadIcon size={10} /> DL
              </button>
            </div>
          </div>
          <pre style={{ flex: 1, margin: 0, padding: '16px', overflowY: 'auto', fontFamily: 'ui-monospace,"Cascadia Code","Fira Code",monospace', fontSize: '11.5px', lineHeight: '1.65', color: '#c9d1d9', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {liveJson}
          </pre>
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
    <div style={{ padding: '18px 24px', background: isActive ? `${dotColor}10` : 'transparent', boxShadow: isActive ? `inset 0 3px 0 0 ${dotColor}` : 'none', transition: 'background 0.2s' }}>
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
          {isActive ? `✓ Viewing ${gatewayName || 'this'} data` : `View ${gatewayName || 'this'} data`}
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
  const [selectedEdited, setSelectedEdited] = useState<Set<string>>(new Set())
  const [importingRows, setImportingRows] = useState<Set<string>>(new Set())
  const [importStatus, setImportStatus] = useState<{ id: string; success: boolean; message: string; suggestVerify?: boolean } | null>(null)
  const [formDirty, setFormDirty]       = useState(false)

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
    setEntityType(type); setEditedItems({}); setSelectedEdited(new Set()); setImportStatus(null); setFormDirty(false)
    if (type) loadItems(type, viewMode)
    else { setItems([]); setItemsError('') }
  }

  function switchView(mode: ViewMode) {
    if (mode === viewMode) return
    setViewMode(mode); setItems([]); setEditedItems({}); setSelectedEdited(new Set()); setImportStatus(null); setSearch(''); setPage(1); setFormDirty(false)
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
    setSelectedEdited(prev => new Set([...prev, id]))
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
        setSelectedEdited(prev => { const n = new Set(prev); n.delete(id); return n })
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

  const guardDirty   = formDirty || modifiedCount > 0
  const guardMessage = formDirty
    ? 'You have unsaved edits in the JSON editor. Leaving this page will discard those changes.'
    : `You have ${modifiedCount} staged edit${modifiedCount > 1 ? 's' : ''} that haven't been imported to the gateway yet. The bundle file retains these changes, but the live gateway won't reflect them until you import.`
  const navBlocker = useDirtyGuard(guardDirty)

  // ── Bulk import all selected staged items ──────────────────────────────────
  async function handleImportSelected() {
    const ids = [...selectedEdited].filter(id => editedItems[id])
    if (ids.length === 0) return
    setImportStatus(null)
    setImportingRows(new Set(ids))

    const results = await Promise.allSettled(
      ids.map(async (id): Promise<{ id: string; ok: boolean }> => {
        const entityData = editedItems[id]
        const ac    = new AbortController()
        const timer = setTimeout(() => ac.abort(), EXPORT_TIMEOUT_MS)
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
            setSelectedEdited(prev => { const n = new Set(prev); n.delete(id); return n })
          }
          return { id, ok: !!d.success }
        } catch {
          return { id, ok: false }
        } finally {
          clearTimeout(timer)
          setImportingRows(prev => { const n = new Set(prev); n.delete(id); return n })
        }
      })
    )

    const successes = results.filter(r => r.status === 'fulfilled' && (r.value as { ok: boolean }).ok).length
    const total     = results.length
    const failures  = total - successes
    setImportStatus({
      id: '',
      success: successes > 0,
      message: `Bulk import: ${successes} of ${total} item${total > 1 ? 's' : ''} sent to "${targetGateway}" successfully.${failures > 0 ? ` ${failures} failed — check individually.` : ''}`,
      suggestVerify: successes > 0,
    })
    if (successes > 0) loadItems(entityType, viewMode)
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
    <NavigationBlocker blocker={navBlocker} description={guardMessage} />
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

      {/* ── Inline form editor — replaces table while editing ── */}
      {editItem && (
        <CertFormEditor
          entityType={entityType}
          item={editItem}
          savedEdit={editedItems[getItemId(editItem)]}
          isReadOnly={viewMode === 'target'}
          onSave={parsed => handleSave(editItem, parsed)}
          onBack={() => { setFormDirty(false); setEditItem(null) }}
          onDirtyChange={setFormDirty}
        />
      )}

      {/* Loading */}
      {!editItem && loadingItems && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-secondary)', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
          <Spinner /> <div style={{ marginTop: '12px', fontSize: '13px' }}>Loading…</div>
        </div>
      )}

      {/* Error */}
      {!editItem && itemsError && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '16px 20px', color: '#fca5a5', fontSize: '13px' }}>{itemsError}</div>}

      {/* Table */}
      {!editItem && !loadingItems && !itemsError && items.length > 0 && (
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

          {/* Staging bar */}
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
                  <th style={{ ...thSt, width: '32px', textAlign: 'center' }}>
                    {modifiedCount > 0
                      ? <input type="checkbox" style={{ margin: 0, cursor: 'pointer', accentColor: '#f59e0b' }}
                          checked={selectedEdited.size === modifiedCount}
                          ref={el => { if (el) el.indeterminate = selectedEdited.size > 0 && selectedEdited.size < modifiedCount }}
                          onChange={e => setSelectedEdited(e.target.checked ? new Set(Object.keys(editedItems)) : new Set())}
                          title="Select / deselect all staged edits" />
                      : '#'}
                  </th>
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
                      <td style={{ ...tdSt, textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '11px' }}>
                        {isEdited
                          ? <input type="checkbox" style={{ margin: 0, cursor: 'pointer', accentColor: '#f59e0b' }}
                              checked={selectedEdited.has(id)}
                              onChange={e => setSelectedEdited(prev => { const n = new Set(prev); e.target.checked ? n.add(id) : n.delete(id); return n })} />
                          : absIdx}
                      </td>

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
                          {viewMode === 'target' && (
                            <button onClick={() => setEditItem(rawItem)}
                              style={{ padding: '4px 10px', borderRadius: '5px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: '12px', fontWeight: 500 }}>
                              View
                            </button>
                          )}
                          {isEdited && (
                            <button onClick={() => handleImportRow(rawItem)} disabled={isImporting}
                              className="kc-import-btn"
                              style={{ padding: '4px 10px', borderRadius: '5px', cursor: isImporting ? 'wait' : 'pointer', background: 'var(--color-accent-red)', border: 'none', color: '#fff', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                              {isImporting ? <><Spinner small />…</> : <>↑ Import</>}
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
      {!editItem && !loadingItems && !itemsError && entityType && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-secondary)', fontSize: '13px', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
          No items found for <strong>{entityType}</strong> in the {viewMode} bundle.
        </div>
      )}
      {!editItem && !entityType && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-secondary)', fontSize: '13px', background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25, margin: '0 auto 12px', display: 'block' }}>
            <path d="M12 22s-8-4.5-8-11.8V5l8-3 8 3v5.2c0 7.3-8 11.8-8 11.8z"/><polyline points="9 12 11 14 15 10"/>
          </svg>
          Select <strong>Trusted Certificates</strong> or <strong>Private Keys</strong> to begin.
        </div>
      )}
    </div>
    </>
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
