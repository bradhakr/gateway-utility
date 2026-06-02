import { useState, useEffect } from 'react'

const PAGE_COLOR = '#CC0000'
const PAGE_RGBA  = 'rgba(204,0,0,'

interface ParsedVersion {
  client: string
  schema: string
  supportedSchemas: string[]
  supportedExtensions: string[]
  home: string
  github: string
}

interface VersionResponse {
  success: boolean
  raw: string
  parsed: ParsedVersion
  error?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoRow({ label, value, mono, last }: { label: string; value: string; mono?: boolean; last?: boolean }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '200px 1fr',
      padding: '11px 20px',
      borderBottom: last ? 'none' : '1px solid var(--color-border)',
      alignItems: 'start',
      gap: '12px',
    }}>
      <span style={{
        fontSize: '12px', fontWeight: 600,
        color: 'var(--color-text-secondary)',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: '13px',
        color: 'var(--color-text-primary)',
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
        wordBreak: 'break-all',
      }}>
        {value || '—'}
      </span>
    </div>
  )
}

function TagRow({ label, values, last }: { label: string; values: string[]; last?: boolean }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '200px 1fr',
      padding: '11px 20px',
      borderBottom: last ? 'none' : '1px solid var(--color-border)',
      alignItems: 'start',
      gap: '12px',
    }}>
      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', paddingTop: '4px' }}>
        {label}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {values.length === 0 ? (
          <span style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>—</span>
        ) : values.map(v => (
          <span key={v} style={{
            fontSize: '12px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            background: `${PAGE_RGBA}0.07)`,
            border: `1px solid ${PAGE_RGBA}0.2)`,
            borderRadius: '5px',
            padding: '2px 8px',
            color: PAGE_COLOR,
            fontWeight: 600,
          }}>
            {v}
          </span>
        ))}
      </div>
    </div>
  )
}

function CardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '14px 20px',
      borderBottom: `2px solid ${PAGE_COLOR}`,
      background: 'var(--color-header-bg)',
      color: '#fff',
      fontSize: '13px',
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    }}>
      {children}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GraphmanVersion() {
  const [data, setData]       = useState<VersionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  function load() {
    setLoading(true)
    setError('')
    fetch('/api/graphman-version')
      .then(r => r.json())
      .then((d: VersionResponse) => { setData(d); setLoading(false) })
      .catch(() => { setError('Could not reach the server.'); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const ok = data?.success && data.parsed?.client

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1100px' }}>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.2px' }}>
            Graphman Client
            <span style={{ fontWeight: 400, fontSize: '15px', color: 'var(--color-text-secondary)', marginLeft: '12px', letterSpacing: 0 }}>
              — Installed client details
            </span>
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '6px', marginBottom: 0 }}>
            Output of{' '}
            <code style={{ fontSize: '12px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', background: '#F1F3F5', padding: '2px 6px', borderRadius: '4px', color: '#1A2332', border: '1px solid var(--color-border)' }}>
              graphman version
            </code>
            {' '}— @layer7/graphman npm package
          </p>
        </div>

        <button
          onClick={load}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px', borderRadius: '7px',
            cursor: loading ? 'not-allowed' : 'pointer',
            background: loading ? '#F4F5F7' : '#fff',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
            fontSize: '13px', fontWeight: 600,
            opacity: loading ? 0.6 : 1,
            flexShrink: 0,
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
               strokeLinecap="round" strokeLinejoin="round"
               style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}>
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          {loading ? 'Running…' : 'Refresh'}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Loading ───────────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ color: 'var(--color-text-secondary)', fontSize: '14px', padding: '20px 0' }}>
          Running <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px' }}>graphman version</code>…
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────────── */}
      {!loading && (error || !data?.success) && (
        <div style={{
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '8px',
          padding: '16px 20px',
          marginBottom: '20px',
        }}>
          <div style={{ fontWeight: 600, color: '#991B1B', fontSize: '14px', marginBottom: '4px' }}>
            Failed to run graphman version
          </div>
          <div style={{ fontSize: '13px', color: '#7F1D1D' }}>
            {error || data?.error || 'Unknown error'}
          </div>
        </div>
      )}

      {!loading && ok && (
        <>
          {/* ── Version details card ────────────────────────────────────────────── */}
          <div style={{
            background: 'var(--color-card-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            overflow: 'hidden',
            marginBottom: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <CardHeader>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: '#22C55E',
                boxShadow: '0 0 5px rgba(34,197,94,0.7)',
                flexShrink: 0,
              }} />
              Client detected —
              <span style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                background: 'rgba(255,255,255,0.15)',
                padding: '1px 8px',
                borderRadius: '4px',
              }}>
                {data!.parsed.client}
              </span>
            </CardHeader>

            <InfoRow label="Version"             value={data!.parsed.client}  mono />
            <InfoRow label="Active Schema"       value={data!.parsed.schema}  mono />
            <TagRow  label="Supported Schemas"   values={data!.parsed.supportedSchemas} />
            <TagRow  label="Supported Extensions" values={data!.parsed.supportedExtensions} />
            <InfoRow label="Client Home"         value={data!.parsed.home}    mono />

            {/* GitHub row */}
            <div style={{
              display: 'grid', gridTemplateColumns: '200px 1fr',
              padding: '11px 20px', alignItems: 'start', gap: '12px',
            }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                GitHub
              </span>
              {data!.parsed.github ? (
                <a href={data!.parsed.github} target="_blank" rel="noreferrer"
                   style={{ fontSize: '13px', color: PAGE_COLOR, wordBreak: 'break-all' }}>
                  {data!.parsed.github}
                </a>
              ) : (
                <span style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>—</span>
              )}
            </div>
          </div>

          {/* ── Raw command output ───────────────────────────────────────────────── */}
          <div style={{
            background: 'var(--color-card-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            overflow: 'hidden',
            marginBottom: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <CardHeader>
              Raw command output
            </CardHeader>
            <pre style={{
              margin: 0,
              padding: '16px 20px',
              fontSize: '13px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: 'var(--color-text-primary)',
              lineHeight: '1.8',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              background: '#F8FAFC',
              borderTop: '1px solid var(--color-border)',
            }}>
              {data!.raw}
            </pre>
          </div>

          {/* ── How to update ────────────────────────────────────────────────────── */}
          <div style={{
            background: 'var(--color-card-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <CardHeader>
              How to update the Graphman client
            </CardHeader>

            <div style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 18px', lineHeight: '1.7' }}>
                The client is baked into the container image at build time. To upgrade, rebuild the image
                with the desired version and trigger a rolling restart in Kubernetes.
              </p>

              {/* Step 1 */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  marginBottom: '8px',
                }}>
                  <span style={{
                    fontSize: '11px', fontWeight: 700,
                    background: `${PAGE_RGBA}0.10)`,
                    color: PAGE_COLOR,
                    borderRadius: '10px', padding: '2px 8px',
                  }}>
                    Step 1
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Rebuild &amp; push the image
                  </span>
                </div>
                <pre style={{
                  background: '#F8FAFC',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  padding: '14px 18px',
                  fontSize: '13px',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  color: 'var(--color-text-primary)',
                  overflowX: 'auto',
                  margin: 0,
                  lineHeight: '1.8',
                }}>
{`./Package.sh \\
  --registry  <your-registry> \\
  --tag       $(date +%Y%m%d) \\
  --graphman-version latest \\
  --push`}
                </pre>
              </div>

              {/* Step 2 */}
              <div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  marginBottom: '8px',
                }}>
                  <span style={{
                    fontSize: '11px', fontWeight: 700,
                    background: `${PAGE_RGBA}0.10)`,
                    color: PAGE_COLOR,
                    borderRadius: '10px', padding: '2px 8px',
                  }}>
                    Step 2
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Rolling restart in Kubernetes
                  </span>
                </div>
                <pre style={{
                  background: '#F8FAFC',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  padding: '14px 18px',
                  fontSize: '13px',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  color: 'var(--color-text-primary)',
                  overflowX: 'auto',
                  margin: 0,
                  lineHeight: '1.8',
                }}>
{`kubectl rollout restart deployment/gateway-utility -n gateway-utility`}
                </pre>
              </div>

              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '16px 0 0', lineHeight: '1.6' }}>
                Tip: pin a specific version with{' '}
                <code style={{ fontSize: '12px', fontFamily: 'ui-monospace, monospace', background: '#F1F3F5', padding: '1px 5px', borderRadius: '3px', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                  --graphman-version 1.2.3
                </code>
                {' '}for repeatable production builds.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
