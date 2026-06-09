import { useState, useEffect } from 'react'
import { useDirtyGuard } from '../hooks/useDirtyGuard'
import { NavigationBlocker } from '../components/NavigationBlocker'
import type { ReactNode } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RepoItem {
  _key:        string   // original name used to match for PAT preservation
  name:        string
  owner:       string
  repo:        string
  branch:      string
  pat:         string
  description: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiToRepos(raw: { name: string; owner: string; repo: string; branch: string; pat: string; description: string }[]): RepoItem[] {
  return raw.map(r => ({
    _key:        r.name,
    name:        r.name        || '',
    owner:       r.owner       || '',
    repo:        r.repo        || '',
    branch:      r.branch      || 'main',
    pat:         r.pat         || '',
    description: r.description || '',
  }))
}

function reposToApi(items: RepoItem[]) {
  return items.map(r => ({
    name:        r.name,
    owner:       r.owner,
    repo:        r.repo,
    branch:      r.branch,
    pat:         r.pat,
    description: r.description,
  }))
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_COLOR = '#16a34a'

const REPO_LIST_MAX_HEIGHT = 9 * 44

const INPUT_ST = {
  width: '100%', padding: '7px 10px', borderRadius: '6px', fontSize: '12px',
  background: 'var(--color-input-bg)', border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)', outline: 'none', boxSizing: 'border-box' as const,
  fontFamily: 'ui-monospace, monospace',
}

const LABEL_ST: React.CSSProperties = {
  display: 'block', fontSize: '10px', fontWeight: 700,
  color: 'var(--color-text-secondary)', marginBottom: '4px',
  textTransform: 'uppercase', letterSpacing: '0.5px',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionBox({ title, accent, children }: { title: string; accent: string; children: ReactNode }) {
  return (
    <div style={{
      background: 'var(--color-card-bg)',
      border: '1px solid var(--color-border)',
      borderTop: `3px solid ${accent}`,
      borderRadius: '8px',
      overflow: 'hidden',
      marginBottom: '14px',
    }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--color-border)',
        fontSize: '12px', fontWeight: 700,
        color: 'var(--color-text-primary)',
        background: 'rgba(255,255,255,0.02)',
      }}>
        {title}
      </div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </div>
  )
}

function Btn({ onClick, disabled, variant, children }: {
  onClick: () => void; disabled?: boolean; variant?: 'primary' | 'danger' | 'ghost'; children: ReactNode
}) {
  const base: React.CSSProperties = {
    padding: '6px 12px', borderRadius: '6px', cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '12px', fontWeight: 600, border: '1px solid', opacity: disabled ? 0.5 : 1,
    display: 'inline-flex', alignItems: 'center', gap: '5px', transition: 'opacity 0.15s',
  }
  if (variant === 'primary') return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, background: PAGE_COLOR, borderColor: PAGE_COLOR, color: '#fff' }}>{children}</button>
  )
  if (variant === 'danger') return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, background: 'transparent', borderColor: 'rgba(239,68,68,0.5)', color: '#fca5a5' }}>{children}</button>
  )
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, background: 'transparent', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>{children}</button>
  )
}

// ─── Repo list row ────────────────────────────────────────────────────────────

function RepoRow({ item, selected, onClick }: { item: RepoItem; selected: boolean; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '9px 12px', cursor: 'pointer',
        background: selected ? `rgba(22,163,74,0.12)` : hov ? 'rgba(255,255,255,0.04)' : 'transparent',
        borderLeft: selected ? `3px solid ${PAGE_COLOR}` : '3px solid transparent',
        borderBottom: '1px solid var(--color-border)',
        transition: 'background 0.12s',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.name || <span style={{ opacity: 0.4 }}>unnamed</span>}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '1px', fontFamily: 'ui-monospace, monospace' }}>
          {item.owner && item.repo ? `${item.owner}/${item.repo}` : <span style={{ opacity: 0.4 }}>not configured</span>}
          {item.branch ? <span style={{ marginLeft: '6px', opacity: 0.6 }}>@ {item.branch}</span> : null}
        </div>
      </div>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={selected ? PAGE_COLOR : 'currentColor'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: selected ? 1 : 0.3, flexShrink: 0 }}>
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>
  )
}

// ─── Editor panel ─────────────────────────────────────────────────────────────

function RepoEditor({ item, onChange }: { item: RepoItem; onChange: (updated: RepoItem) => void }) {
  function set(field: keyof RepoItem, value: string) {
    onChange({ ...item, [field]: value })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

      <div style={{ gridColumn: '1 / -1' }}>
        <label style={LABEL_ST}>Display Name *</label>
        <input style={INPUT_ST} value={item.name} placeholder="e.g. gateway-config-prod"
          onChange={e => set('name', e.target.value)} />
        <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '3px' }}>
          Unique identifier — used in the SyncUp source/target selector
        </div>
      </div>

      <div>
        <label style={LABEL_ST}>GitHub Owner / Org *</label>
        <input style={INPUT_ST} value={item.owner} placeholder="e.g. myorg or myusername"
          onChange={e => set('owner', e.target.value)} />
      </div>

      <div>
        <label style={LABEL_ST}>Repository Name *</label>
        <input style={INPUT_ST} value={item.repo} placeholder="e.g. gateway-config"
          onChange={e => set('repo', e.target.value)} />
      </div>

      <div>
        <label style={LABEL_ST}>Default Branch</label>
        <input style={INPUT_ST} value={item.branch} placeholder="main"
          onChange={e => set('branch', e.target.value)} />
      </div>

      <div>
        <label style={LABEL_ST}>Personal Access Token (PAT) *</label>
        <input style={INPUT_ST} type="password" value={item.pat}
          placeholder={item._key ? '(unchanged — enter new value to update)' : 'ghp_…'}
          onChange={e => set('pat', e.target.value)} />
        <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '3px' }}>
          Needs <code>repo</code> scope. Stored server-side only, never sent to the browser.
        </div>
      </div>

      <div style={{ gridColumn: '1 / -1' }}>
        <label style={LABEL_ST}>Description</label>
        <input style={INPUT_ST} value={item.description} placeholder="Optional description"
          onChange={e => set('description', e.target.value)} />
      </div>

    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function emptyRepo(): RepoItem {
  return { _key: '', name: '', owner: '', repo: '', branch: 'main', pat: '', description: '' }
}

export default function GitHubConfig() {
  const [repos, setRepos]         = useState<RepoItem[]>([])
  const [selected, setSelected]   = useState<number | null>(null)
  const [editItem, setEditItem]   = useState<RepoItem | null>(null)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [saveMsg, setSaveMsg]     = useState<{ ok: boolean; text: string } | null>(null)
  const [error, setError]         = useState('')
  const [isDirty, setIsDirty]     = useState(false)

  const blocker = useDirtyGuard(isDirty)

  useEffect(() => {
    fetch('/api/github-repos')
      .then(r => r.json())
      .then(d => {
        if (d.success) setRepos(apiToRepos(d.repositories))
        else setError(d.error || 'Failed to load GitHub repositories.')
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  function selectRow(idx: number) {
    setSelected(idx)
    setEditItem(JSON.parse(JSON.stringify(repos[idx])))
    setIsDirty(false)
    setSaveMsg(null)
  }

  function handleChange(updated: RepoItem) {
    setEditItem(updated)
    setIsDirty(true)
  }

  function handleAdd() {
    const fresh = emptyRepo()
    const newRepos = [...repos, fresh]
    setRepos(newRepos)
    setSelected(newRepos.length - 1)
    setEditItem(fresh)
    setIsDirty(true)
    setSaveMsg(null)
  }

  function handleRemove() {
    if (selected === null) return
    const name = repos[selected]?.name || 'this entry'
    if (!window.confirm(`Remove "${name}" from GitHub repositories?`)) return
    const newRepos = repos.filter((_, i) => i !== selected)
    setRepos(newRepos)
    setSelected(null)
    setEditItem(null)
    setIsDirty(true)
    setSaveMsg(null)
  }

  async function handleSave() {
    if (!editItem) return
    if (!editItem.name.trim()) { setSaveMsg({ ok: false, text: 'Display Name is required.' }); return }
    if (!editItem.owner.trim()) { setSaveMsg({ ok: false, text: 'Owner is required.' }); return }
    if (!editItem.repo.trim()) { setSaveMsg({ ok: false, text: 'Repository name is required.' }); return }
    if (!editItem.pat.trim()) { setSaveMsg({ ok: false, text: 'PAT is required.' }); return }

    const dupeIdx = repos.findIndex((r, i) => r.name === editItem.name && i !== selected)
    if (dupeIdx >= 0) { setSaveMsg({ ok: false, text: `Name "${editItem.name}" is already used by another entry.` }); return }

    const updatedRepos = repos.map((r, i) => i === selected ? editItem : r)
    setSaving(true)
    setSaveMsg(null)
    try {
      const resp = await fetch('/api/github-repos-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositories: reposToApi(updatedRepos) }),
      })
      const d = await resp.json()
      if (d.success) {
        setRepos(updatedRepos.map(r => ({ ...r, _key: r.name })))
        setEditItem(prev => prev ? { ...prev, _key: prev.name } : prev)
        setSaveMsg({ ok: true, text: 'Saved successfully.' })
        setIsDirty(false)
      } else {
        setSaveMsg({ ok: false, text: d.error || 'Save failed.' })
      }
    } catch (e) {
      setSaveMsg({ ok: false, text: `Network error: ${String(e)}` })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <NavigationBlocker blocker={blocker} description="You have unsaved changes to a GitHub repository entry. Leave anyway?" />
      <div style={{ padding: '16px 24px', maxWidth: '960px' }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '14px', flexWrap: 'wrap', gap: '8px',
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
              GitHub Repository Config
            </h1>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              Add GitHub repositories used as targets or sources in Repository SyncUp.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <Btn onClick={handleAdd}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Repository
            </Btn>
            {selected !== null && (
              <Btn onClick={handleRemove} variant="danger">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                Remove
              </Btn>
            )}
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', color: '#fca5a5', fontSize: '12px', marginBottom: '12px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '14px', alignItems: 'start' }}>

          {/* ── Repo list ── */}
          <SectionBox title={`Repositories (${repos.length})`} accent={PAGE_COLOR}>
            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '12px' }}>Loading…</div>
            ) : repos.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                No repositories configured.<br />
                <button onClick={handleAdd} style={{ marginTop: '8px', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, background: PAGE_COLOR, border: 'none', color: '#fff' }}>
                  Add one
                </button>
              </div>
            ) : (
              <div style={{ margin: '-14px -16px', maxHeight: REPO_LIST_MAX_HEIGHT, overflowY: 'auto' }}>
                {repos.map((r, i) => (
                  <RepoRow key={i} item={r} selected={selected === i} onClick={() => selectRow(i)} />
                ))}
              </div>
            )}
          </SectionBox>

          {/* ── Editor ── */}
          {editItem ? (
            <SectionBox title={editItem._key ? `Edit: ${editItem._key}` : 'New Repository'} accent={PAGE_COLOR}>
              <RepoEditor item={editItem} onChange={handleChange} />

              {/* Save feedback */}
              {saveMsg && (
                <div style={{
                  marginTop: '12px', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                  background: saveMsg.ok ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${saveMsg.ok ? 'rgba(22,163,74,0.35)' : 'rgba(239,68,68,0.3)'}`,
                  color: saveMsg.ok ? '#86efac' : '#fca5a5',
                }}>
                  {saveMsg.text}
                </div>
              )}

              <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
                <Btn onClick={handleSave} disabled={saving || !isDirty} variant="primary">
                  {saving ? 'Saving…' : 'Save'}
                </Btn>
                <Btn onClick={() => {
                  setSelected(null); setEditItem(null); setIsDirty(false); setSaveMsg(null)
                }}>
                  Cancel
                </Btn>
              </div>
            </SectionBox>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '180px', border: '1px dashed var(--color-border)', borderRadius: '8px',
              color: 'var(--color-text-secondary)', fontSize: '13px', textAlign: 'center', padding: '20px',
            }}>
              Select a repository from the list to edit,<br />or click <strong>Add Repository</strong> to create one.
            </div>
          )}

        </div>

        {/* ── Info panel ── */}
        <div style={{
          marginTop: '14px', padding: '12px 16px', background: 'rgba(22,163,74,0.06)',
          border: '1px solid rgba(22,163,74,0.2)', borderRadius: '8px', fontSize: '12px',
          color: 'var(--color-text-secondary)', lineHeight: 1.7,
        }}>
          <strong style={{ color: 'var(--color-text-primary)' }}>PAT Requirements:</strong> The Personal Access Token must have the <code>repo</code> scope
          (full repository access) to push and pull gateway entity files. Fine-grained tokens require <em>Contents: Read &amp; Write</em> on the target repository.
          PATs are stored server-side in <code>github-repos.json</code> and are never returned to the browser after saving.
        </div>

      </div>
    </>
  )
}
