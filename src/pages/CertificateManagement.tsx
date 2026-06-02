import { useState, useEffect } from 'react'
import type { Certificate, CertificatesData } from '../types'

const API = '/api'

function DaysUntilExpiry({ notAfter }: { notAfter: string | null }) {
  if (!notAfter) return <span className="text-muted">—</span>

  const expiry = new Date(notAfter)
  const now = new Date()
  const diff = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  let color = 'var(--color-success)'
  let label = `${diff}d`
  if (diff < 0) { color = 'var(--color-error)'; label = 'Expired' }
  else if (diff < 30) { color = '#D97706'; label = `${diff}d (soon)` }
  else if (diff < 90) { color = '#0066CC'; label = `${diff}d` }

  return <span style={{ color, fontWeight: 600, fontSize: '12px' }}>{label}</span>
}

function StatusDot({ enabled }: { enabled: boolean }) {
  return (
    <span style={{
      display: 'inline-block',
      width: '8px', height: '8px',
      borderRadius: '50%',
      background: enabled ? 'var(--color-success)' : '#9CA3AF',
    }} title={enabled ? 'Enabled' : 'Disabled'} />
  )
}

export default function CertificateManagement() {
  const [data, setData] = useState<CertificatesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [filterType, setFilterType] = useState<'All' | 'Trusted Certificate' | 'Private Key'>('All')
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Expiring' | 'Expired'>('All')
  const [sortField, setSortField] = useState<keyof Certificate>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  useEffect(() => {
    fetch(`${API}/certificates`)
      .then(r => r.json())
      .then(d => {
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
        setStatusMsg({ type: 'error', text: 'Cannot reach API server on port 3002.' })
      })
  }, [])

  const getDaysUntil = (notAfter: string | null) => {
    if (!notAfter) return Infinity
    return Math.floor((new Date(notAfter).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  }

  const getStatus = (cert: Certificate) => {
    const d = getDaysUntil(cert.notAfter)
    if (d === Infinity) return 'Active'
    if (d < 0) return 'Expired'
    if (d < 30) return 'Expiring'
    return 'Active'
  }

  const handleSort = (field: keyof Certificate) => {
    if (sortField === field) setSortAsc(!sortAsc)
    else { setSortField(field); setSortAsc(true) }
  }

  const sortArrow = (field: keyof Certificate) =>
    sortField === field ? (sortAsc ? ' ▲' : ' ▼') : ''

  const certs = data?.certificates ?? []

  const filtered = certs
    .filter(c => {
      if (filterType !== 'All' && c.type !== filterType) return false
      if (filterStatus !== 'All' && getStatus(c) !== filterStatus) return false
      if (filter) {
        const q = filter.toLowerCase()
        return c.name.toLowerCase().includes(q) || c.subjectDn.toLowerCase().includes(q) || c.issuerDn.toLowerCase().includes(q)
      }
      return true
    })
    .sort((a, b) => {
      const av = String(a[sortField] ?? '')
      const bv = String(b[sortField] ?? '')
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
    })

  const expiredCount = certs.filter(c => getDaysUntil(c.notAfter) < 0).length
  const expiringCount = certs.filter(c => { const d = getDaysUntil(c.notAfter); return d >= 0 && d < 30 }).length
  const trustedCount = certs.filter(c => c.type === 'Trusted Certificate').length
  const keyCount = certs.filter(c => c.type === 'Private Key').length

  return (
    <div>
      <h1 className="page-title">Certificate Management</h1>
      <p className="page-subtitle">
        View trusted certificates and private keys loaded from the gateway bundle. Track expiry dates and identify certificates requiring attention.
      </p>

      {statusMsg && (
        <div className={`alert alert-${statusMsg.type}`} style={{ marginBottom: '16px' }}>
          <span>{statusMsg.type === 'error' ? '✕' : 'ℹ'}</span>
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Stats */}
      {!loading && data?.exists && (
        <div className="stats-row" style={{ marginBottom: '20px' }}>
          <div className="stat-card">
            <div className="stat-value">{certs.length}</div>
            <div className="stat-label">Total Entries</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{trustedCount}</div>
            <div className="stat-label">Trusted Certificates</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{keyCount}</div>
            <div className="stat-label">Private Keys</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: expiringCount > 0 ? '#D97706' : 'var(--color-success)' }}>
              {expiringCount}
            </div>
            <div className="stat-label">Expiring (&lt;30d)</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: expiredCount > 0 ? 'var(--color-error)' : 'var(--color-success)' }}>
              {expiredCount}
            </div>
            <div className="stat-label">Expired</div>
          </div>
        </div>
      )}

      {/* Alerts */}
      {!loading && data?.exists && expiredCount > 0 && (
        <div className="alert alert-error" style={{ marginBottom: '14px' }}>
          <span>✕</span>
          <span><strong>{expiredCount} certificate{expiredCount !== 1 ? 's' : ''} expired.</strong> Immediate renewal required.</span>
        </div>
      )}
      {!loading && data?.exists && expiringCount > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: '14px' }}>
          <span>⚠</span>
          <span><strong>{expiringCount} certificate{expiringCount !== 1 ? 's' : ''} expiring within 30 days.</strong> Schedule renewal soon.</span>
        </div>
      )}

      <div className="card">
        <div className="card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <h2 style={{ margin: 0 }}>Certificates &amp; Keys</h2>
            {data?.hostname && (
              <span className="font-mono text-sm text-muted">· {data.hostname}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="search"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search name, subject, issuer…"
              style={{ width: '220px' }}
            />
            <select value={filterType} onChange={e => setFilterType(e.target.value as typeof filterType)} style={{ width: 'auto' }}>
              <option value="All">All Types</option>
              <option value="Trusted Certificate">Trusted Certs</option>
              <option value="Private Key">Private Keys</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)} style={{ width: 'auto' }}>
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="Expiring">Expiring Soon</option>
              <option value="Expired">Expired</option>
            </select>
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
            <span className="spinner spinner-dark" style={{ width: '24px', height: '24px' }} />
            <div style={{ marginTop: '12px' }}>Loading certificates…</div>
          </div>
        )}

        {!loading && !data?.exists && (
          <div className="alert alert-info">
            <span>ℹ</span>
            <div>
              <strong>No bundle data available.</strong>
              <br />
              Certificate information is extracted from the gateway bundle (<code>spFolderSVCFull.json</code>).
              Run an assertion search from the <strong>Find Assertions</strong> page first to load the bundle, or export the full gateway bundle using:
              <pre style={{ marginTop: '8px', fontSize: '11px', background: '#1e293b', color: '#e2e8f0', padding: '8px', borderRadius: '4px' }}>
                {`graphman.sh export --gateway <name> --using all \\\n  --output response/spFolderSVCFull.json`}
              </pre>
            </div>
          </div>
        )}

        {!loading && data?.exists && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-secondary)' }}>
            {certs.length === 0
              ? 'No certificate or key entries found in the bundle data. The bundle may not include trustedCertificates or privateKeys.'
              : 'No entries match the current filters.'}
          </div>
        )}

        {!loading && data?.exists && filtered.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '32px' }}></th>
                  <th onClick={() => handleSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Name{sortArrow('name')}
                  </th>
                  <th>Type</th>
                  <th onClick={() => handleSort('subjectDn')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Subject DN{sortArrow('subjectDn')}
                  </th>
                  <th onClick={() => handleSort('issuerDn')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Issuer DN{sortArrow('issuerDn')}
                  </th>
                  <th onClick={() => handleSort('notAfter')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Expires{sortArrow('notAfter')}
                  </th>
                  <th>Days Left</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(cert => {
                  const status = getStatus(cert)
                  return (
                    <tr key={cert.id} style={{
                      background: status === 'Expired' ? '#FEF2F2' : status === 'Expiring' ? '#FFFBEB' : undefined
                    }}>
                      <td><StatusDot enabled={cert.enabled} /></td>
                      <td style={{ fontWeight: 500, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cert.name}
                      </td>
                      <td>
                        <span className={`badge ${cert.type === 'Trusted Certificate' ? 'badge-cert' : 'badge-key'}`}>
                          {cert.type === 'Trusted Certificate' ? 'Cert' : 'Key'}
                        </span>
                      </td>
                      <td className="font-mono" style={{ fontSize: '11px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cert.subjectDn}
                      </td>
                      <td className="font-mono" style={{ fontSize: '11px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cert.issuerDn}
                      </td>
                      <td className="font-mono" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                        {cert.notAfter ? new Date(cert.notAfter).toLocaleDateString() : '—'}
                      </td>
                      <td><DaysUntilExpiry notAfter={cert.notAfter} /></td>
                      <td>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '20px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: status === 'Expired' ? '#FEE2E2' : status === 'Expiring' ? '#FEF3C7' : '#D1FAE5',
                          color: status === 'Expired' ? '#991B1B' : status === 'Expiring' ? '#92400E' : '#065F46',
                        }}>
                          {status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            Showing {filtered.length} of {certs.length} entries
          </div>
        )}
      </div>

      {/* Info note */}
      {!loading && data?.exists && (
        <div className="card section-gap" style={{ background: '#F8FAFC' }}>
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: '1.7' }}>
            <strong>Note:</strong> Certificate data is extracted from the exported gateway bundle. To refresh, re-export the bundle from the gateway using the Graphman export command or the Find Assertions search workflow. Expiry dates are only available when the bundle includes certificate metadata (notBefore/notAfter fields).
          </div>
        </div>
      )}
    </div>
  )
}
