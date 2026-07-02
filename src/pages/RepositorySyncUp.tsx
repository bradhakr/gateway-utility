import { useState, useEffect } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────

const API        = '/api'
const PAGE_COLOR = '#16a34a'
const PAGE_RGBA  = 'rgba(22,163,74,'

// ─── Types ────────────────────────────────────────────────────────────────────

type Direction = 'gw-to-git' | 'git-to-gw'
type Step = 1 | 2 | 3 | 4

interface GatewayEntry { name: string; address: string }
interface RepoEntry    { name: string; owner: string; repo: string; branch: string }

// Gateway → Git types
interface EntityItem  { [key: string]: unknown }
interface EntityGroup { [pluralName: string]: EntityItem[] }

interface ExplodedFile {
  relPath:    string
  entityType: string
  sizeBytes:  number
}

// Git → Gateway types
interface RepoFile { path: string; size: number; sha: string }
interface RepoGrouped { [entityType: string]: RepoFile[] }

// Result
interface PushResult   { relPath: string; success: boolean; action?: 'created' | 'updated' | 'failed'; error?: string }
interface ImportResult { success: boolean; gateway: string; downloaded: number; importLog: string; downloadResults: { path: string; success: boolean; error?: string }[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function entityDisplayName(item: EntityItem): string {
  return (
    (item.name as string) ||
    (item.resolutionPath as string) ||
    (item.goid as string) ||
    '(unnamed)'
  )
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function Spin({ size = 14 }: { size?: number }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0,
    }} />
  )
}


const LBL: React.CSSProperties = {
  display: 'block', fontSize: '10px', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.5px',
  color: 'var(--color-text-secondary)', marginBottom: '5px',
}

const SELECT_ST: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: '6px', fontSize: '13px',
  background: 'var(--color-input-bg)', border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)', outline: 'none', cursor: 'pointer',
}

const INPUT_ST: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: '6px', fontSize: '13px',
  background: 'var(--color-input-bg)', border: '1px solid var(--color-border)',
  color: 'var(--color-text-primary)', outline: 'none', boxSizing: 'border-box',
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--color-card-bg)', border: '1px solid var(--color-border)',
      borderTop: `3px solid ${PAGE_COLOR}`, borderRadius: '8px',
      padding: '18px 20px', ...style,
    }}>
      {children}
    </div>
  )
}

function ActionBtn({ onClick, disabled, loading: btnLoading, children, variant = 'primary' }: {
  onClick: () => void; disabled?: boolean; loading?: boolean; children: React.ReactNode; variant?: 'primary' | 'ghost' | 'danger'
}) {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '7px',
    padding: '8px 18px', borderRadius: '7px', cursor: disabled || btnLoading ? 'wait' : 'pointer',
    fontSize: '13px', fontWeight: 700, border: 'none', opacity: disabled && !btnLoading ? 0.5 : 1,
    transition: 'opacity 0.15s',
  }
  if (variant === 'primary')
    return <button onClick={onClick} disabled={disabled || btnLoading} style={{ ...base, background: PAGE_COLOR, color: '#fff' }}>{btnLoading ? <Spin /> : null}{children}</button>
  if (variant === 'danger')
    return <button onClick={onClick} disabled={disabled} style={{ ...base, background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}>{children}</button>
  return <button onClick={onClick} disabled={disabled} style={{ ...base, background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>{children}</button>
}

// ─── Workflow stepper (matches EntityForge / FindAssertions style) ────────────

function WorkflowStepper({ step, direction }: { step: Step; direction: Direction }) {
  const stepLabels = direction === 'gw-to-git'
    ? ['Configure', 'Select Entities', 'Preview & Commit', 'Done']
    : ['Configure', 'Browse Repo', 'Review & Import', 'Done']

  const stepDone = [step > 1, step > 2, step > 3, step === 4]

  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', fontSize: '12px', fontWeight: 600 }}>
      {stepLabels.map((label, idx) => {
        const n      = idx + 1
        const active = n === step
        const done   = stepDone[idx]
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 11px', borderRadius: '20px',
              background: active ? `${PAGE_RGBA}0.12)` : done ? 'rgba(34,197,94,0.08)' : 'transparent',
              color: active ? PAGE_COLOR : done ? '#15803d' : 'var(--color-text-secondary)',
              border: active ? `1px solid ${PAGE_RGBA}0.25)` : done ? '1px solid rgba(34,197,94,0.20)' : '1px solid transparent',
            }}>
              <span style={{
                width: '17px', height: '17px', borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: active ? PAGE_COLOR : done ? '#22c55e' : 'var(--color-border)',
                color: active || done ? '#fff' : 'var(--color-text-secondary)',
                fontSize: '9.5px', fontWeight: 800,
              }}>
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
}

// ─── Direction toggle ─────────────────────────────────────────────────────────

function DirectionToggle({ value, onChange }: { value: Direction; onChange: (d: Direction) => void }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
      {(['gw-to-git', 'git-to-gw'] as Direction[]).map(d => (
        <button key={d} onClick={() => onChange(d)} style={{
          padding: '8px 20px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700,
          background: value === d ? PAGE_COLOR : 'transparent',
          color: value === d ? '#fff' : 'var(--color-text-secondary)',
          transition: 'background 0.15s, color 0.15s',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          {d === 'gw-to-git'
            ? <><GwIcon /> Gateway → Git</>
            : <><GitIcon /> Git → Gateway</>}
        </button>
      ))}
    </div>
  )
}

function GwIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
}
function GitIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>
}

// ─── Error / info banners ─────────────────────────────────────────────────────

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '10px 14px', borderRadius: '7px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: '12px', marginBottom: '12px', lineHeight: 1.5 }}>
      {msg}
    </div>
  )
}

// ─── Step 1 — Setup ───────────────────────────────────────────────────────────

interface Step1Props {
  direction: Direction
  setDirection: (d: Direction) => void
  gateways:  GatewayEntry[]
  repos:     RepoEntry[]
  srcGw:     string; setSrcGw: (s: string) => void
  tgtRepo:   string; setTgtRepo: (s: string) => void
  srcRepo:   string; setSrcRepo: (s: string) => void
  tgtGw:     string; setTgtGw: (s: string) => void
  schema:    string; setSchema: (s: string) => void
  onContinue: () => void
  loading:   boolean
  error:     string
}

function Step1({ direction, setDirection, gateways, repos, srcGw, setSrcGw, tgtRepo, setTgtRepo, srcRepo, setSrcRepo, tgtGw, setTgtGw, schema, setSchema, onContinue, loading, error }: Step1Props) {
  const canContinue = direction === 'gw-to-git'
    ? srcGw && tgtRepo
    : srcRepo && tgtGw

  return (
    <Card>
      <h2 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
        Step 1 — Configure Sync
      </h2>

      <div style={{ marginBottom: '20px' }}>
        <label style={LBL}>Sync Direction</label>
        <DirectionToggle value={direction} onChange={d => { setDirection(d); setSrcGw(''); setTgtRepo(''); setSrcRepo(''); setTgtGw('') }} />
        <p style={{ margin: '8px 0 0', fontSize: '11.5px', color: 'var(--color-text-secondary)' }}>
          {direction === 'gw-to-git'
            ? 'Export selected gateway entities, explode to individual files, and push to a GitHub repository.'
            : 'Browse a GitHub repository, select entity files, implode them into a bundle, and import to a gateway.'}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

        {direction === 'gw-to-git' ? (
          <>
            <div>
              <label style={LBL}>Source Gateway</label>
              <select style={SELECT_ST} value={srcGw} onChange={e => setSrcGw(e.target.value)}>
                <option value="">— select gateway —</option>
                {gateways.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
              </select>
              {gateways.length === 0 && <div style={{ fontSize: '11px', color: '#fca5a5', marginTop: '4px' }}>No gateways in graphman.configuration</div>}
            </div>
            <div>
              <label style={LBL}>Target Repository</label>
              <select style={SELECT_ST} value={tgtRepo} onChange={e => setTgtRepo(e.target.value)}>
                <option value="">— select repository —</option>
                {repos.map(r => <option key={r.name} value={r.name}>{r.name} ({r.owner}/{r.repo})</option>)}
              </select>
              {repos.length === 0 && <div style={{ fontSize: '11px', color: '#fca5a5', marginTop: '4px' }}>No repos configured — visit GitHub Config</div>}
            </div>
          </>
        ) : (
          <>
            <div>
              <label style={LBL}>Source Repository</label>
              <select style={SELECT_ST} value={srcRepo} onChange={e => setSrcRepo(e.target.value)}>
                <option value="">— select repository —</option>
                {repos.map(r => <option key={r.name} value={r.name}>{r.name} ({r.owner}/{r.repo})</option>)}
              </select>
              {repos.length === 0 && <div style={{ fontSize: '11px', color: '#fca5a5', marginTop: '4px' }}>No repos configured — visit GitHub Config</div>}
            </div>
            <div>
              <label style={LBL}>Target Gateway</label>
              <select style={SELECT_ST} value={tgtGw} onChange={e => setTgtGw(e.target.value)}>
                <option value="">— select gateway —</option>
                {gateways.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
              </select>
              {gateways.length === 0 && <div style={{ fontSize: '11px', color: '#fca5a5', marginTop: '4px' }}>No gateways in graphman.configuration</div>}
            </div>
          </>
        )}

        {direction === 'gw-to-git' && (
          <div>
            <label style={LBL}>Schema Version</label>
            <input style={INPUT_ST} value={schema} onChange={e => setSchema(e.target.value)} placeholder="e.g. v11.2.1" />
          </div>
        )}
      </div>

      {error && <ErrorBanner msg={error} />}

      <ActionBtn onClick={onContinue} disabled={!canContinue} loading={loading}>
        {loading
          ? direction === 'gw-to-git' ? 'Exporting from gateway…' : 'Fetching repository…'
          : 'Continue →'}
      </ActionBtn>
    </Card>
  )
}

// ─── Step 2A — Entity Selection (Gateway → Git) ───────────────────────────────

interface Step2GwProps {
  entityMap:     EntityGroup
  selected:      Set<string>   // "pluralName::idx"
  setSelected:   (s: Set<string>) => void
  onPreview:     () => void
  previewLoading: boolean
  error:         string
}

function Step2Gw({ entityMap, selected, setSelected, onPreview, previewLoading, error }: Step2GwProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleExpand(key: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  function toggleType(key: string, items: EntityItem[]) {
    const allTypeSelected = items.every((_, i) => selected.has(`${key}::${i}`))
    const n = new Set(selected)
    if (allTypeSelected) items.forEach((_, i) => n.delete(`${key}::${i}`))
    else                 items.forEach((_, i) => n.add(`${key}::${i}`))
    setSelected(n)
  }

  function toggleItem(key: string, idx: number) {
    const id = `${key}::${idx}`
    const n  = new Set(selected)
    n.has(id) ? n.delete(id) : n.add(id)
    setSelected(n)
  }

  const totalItems    = Object.values(entityMap).reduce((sum, items) => sum + items.length, 0)
  const totalSelected = selected.size
  const allSelected   = totalItems > 0 && totalSelected === totalItems
  const someSelected  = totalSelected > 0 && totalSelected < totalItems

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      const all = new Set<string>()
      for (const [key, items] of Object.entries(entityMap)) {
        items.forEach((_, i) => all.add(`${key}::${i}`))
      }
      setSelected(all)
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
          Step 2 — Select Entities
        </h2>
        <span style={{ fontSize: '12px', color: PAGE_COLOR, fontWeight: 700 }}>
          {totalSelected} item{totalSelected !== 1 ? 's' : ''} selected
        </span>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
        Expand entity types to select individual items. Use the type checkbox to select all in a category.
      </p>

      <div style={{ border: '1px solid var(--color-border)', borderRadius: '7px', overflow: 'hidden', marginBottom: '16px' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 80px 80px', alignItems: 'center', padding: '7px 12px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--color-border)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)', position: 'sticky', top: 0, zIndex: 1 }}>
          <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected }}
            onChange={toggleSelectAll}
            title="Select / deselect all entities"
            style={{ cursor: 'pointer', accentColor: PAGE_COLOR }} />
          <span>Entity Type</span>
          <span style={{ textAlign: 'center' }}>Count</span>
          <span style={{ textAlign: 'center' }}>Selected</span>
          <span/>
        </div>

        {Object.entries(entityMap).map(([key, items]) => {
          const selCount = items.filter((_, i) => selected.has(`${key}::${i}`)).length
          const allSel   = selCount === items.length
          const someSel  = selCount > 0 && selCount < items.length
          const isExp    = expanded.has(key)

          return (
            <div key={key} style={{ borderBottom: '1px solid var(--color-border)' }}>
              {/* Type row */}
              <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 80px 80px', alignItems: 'center', padding: '9px 12px', background: selCount > 0 ? `${PAGE_RGBA}0.06)` : 'transparent' }}>
                <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel }}
                  onChange={() => toggleType(key, items)}
                  style={{ cursor: 'pointer', accentColor: PAGE_COLOR }} />
                <button onClick={() => toggleExpand(key)} style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, display: 'flex', alignItems: 'center', gap: '7px', color: 'var(--color-text-primary)' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    style={{ transform: isExp ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>{key}</span>
                </button>
                <span style={{ textAlign: 'center', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{items.length}</span>
                <span style={{ textAlign: 'center', fontSize: '12px', color: selCount > 0 ? PAGE_COLOR : 'var(--color-text-secondary)', fontWeight: selCount > 0 ? 700 : 400 }}>{selCount}</span>
                <span/>
              </div>

              {/* Expanded item rows */}
              {isExp && items.map((item, idx) => {
                const id  = `${key}::${idx}`
                const sel = selected.has(id)
                return (
                  <div key={idx} style={{
                    display: 'grid', gridTemplateColumns: '32px 1fr 80px 80px 80px', alignItems: 'center',
                    padding: '6px 12px 6px 28px',
                    background: sel ? `${PAGE_RGBA}0.07)` : 'rgba(0,0,0,0.12)',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <input type="checkbox" checked={sel} onChange={() => toggleItem(key, idx)}
                      style={{ cursor: 'pointer', accentColor: PAGE_COLOR }} />
                    <span style={{ fontSize: '12px', color: 'var(--color-text-primary)', fontFamily: 'ui-monospace,monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entityDisplayName(item)}
                    </span>
                    <span style={{ textAlign: 'center', fontSize: '11px', color: 'var(--color-text-secondary)', fontFamily: 'ui-monospace,monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {(item.goid as string)?.slice(0, 8) || '—'}
                    </span>
                    <span/>
                    <span/>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {error && <ErrorBanner msg={error} />}

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <ActionBtn onClick={onPreview} disabled={totalSelected === 0} loading={previewLoading}>
          {previewLoading ? 'Exploding bundle…' : `Preview ${totalSelected} item${totalSelected !== 1 ? 's' : ''} →`}
        </ActionBtn>
        {previewLoading && <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Running graphman explode…</span>}
      </div>
    </Card>
  )
}

// ─── Step 2B — Repo Browser (Git → Gateway) ──────────────────────────────────

interface Step2RepoProps {
  grouped:       RepoGrouped
  selected:      Set<string>   // file path
  setSelected:   (s: Set<string>) => void
  onReview:      () => void
  error:         string
}

function Step2Repo({ grouped, selected, setSelected, onReview, error }: Step2RepoProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(Object.keys(grouped)))

  function toggleExpand(key: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  function toggleType(_key: string, files: RepoFile[]) {
    const allSel = files.every(f => selected.has(f.path))
    const n = new Set(selected)
    if (allSel) files.forEach(f => n.delete(f.path))
    else        files.forEach(f => n.add(f.path))
    setSelected(n)
  }

  function toggleItem(p: string) {
    const n = new Set(selected)
    n.has(p) ? n.delete(p) : n.add(p)
    setSelected(n)
  }

  const allFiles     = Object.values(grouped).flatMap(files => files.map(f => f.path))
  const totalSelected = selected.size
  const allSelected  = allFiles.length > 0 && allFiles.every(p => selected.has(p))
  const someSelected = allFiles.some(p => selected.has(p)) && !allSelected

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(allFiles))
    }
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
          Step 2 — Browse Repository
        </h2>
        <span style={{ fontSize: '12px', color: PAGE_COLOR, fontWeight: 700 }}>
          {totalSelected} file{totalSelected !== 1 ? 's' : ''} selected
        </span>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
        Gateway entity files discovered in the repository. Expand a type to select individual files.
      </p>

      <div style={{ border: '1px solid var(--color-border)', borderRadius: '7px', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 70px', alignItems: 'center', padding: '7px 12px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--color-border)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)', position: 'sticky', top: 0, zIndex: 1 }}>
          <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected }}
            onChange={toggleSelectAll}
            title="Select / deselect all files"
            style={{ cursor: 'pointer', accentColor: PAGE_COLOR }} />
          <span>File Path</span>
          <span style={{ textAlign: 'center' }}>Count</span>
          <span style={{ textAlign: 'center' }}>Size</span>
        </div>

        {Object.entries(grouped).map(([key, files]) => {
          const selCount = files.filter(f => selected.has(f.path)).length
          const allSel   = selCount === files.length
          const someSel  = selCount > 0 && selCount < files.length
          const isExp    = expanded.has(key)

          return (
            <div key={key} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 70px', alignItems: 'center', padding: '9px 12px', background: selCount > 0 ? `${PAGE_RGBA}0.06)` : 'transparent' }}>
                <input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel }}
                  onChange={() => toggleType(key, files)}
                  style={{ cursor: 'pointer', accentColor: PAGE_COLOR }} />
                <button onClick={() => toggleExpand(key)} style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, display: 'flex', alignItems: 'center', gap: '7px', color: 'var(--color-text-primary)' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                    style={{ transform: isExp ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>{key}</span>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>({files.length} files)</span>
                </button>
                <span style={{ textAlign: 'center', fontSize: '12px', color: selCount > 0 ? PAGE_COLOR : 'var(--color-text-secondary)', fontWeight: selCount > 0 ? 700 : 400 }}>{selCount}/{files.length}</span>
                <span/>
              </div>

              {isExp && files.map(f => {
                const sel = selected.has(f.path)
                const fileName = f.path.split('/').pop() || f.path
                return (
                  <div key={f.path} style={{
                    display: 'grid', gridTemplateColumns: '32px 1fr 80px 70px', alignItems: 'center',
                    padding: '6px 12px 6px 28px',
                    background: sel ? `${PAGE_RGBA}0.07)` : 'rgba(0,0,0,0.12)',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <input type="checkbox" checked={sel} onChange={() => toggleItem(f.path)}
                      style={{ cursor: 'pointer', accentColor: PAGE_COLOR }} />
                    <span style={{ fontSize: '12px', color: 'var(--color-text-primary)', fontFamily: 'ui-monospace,monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fileName}
                    </span>
                    <span/>
                    <span style={{ textAlign: 'center', fontSize: '11px', color: 'var(--color-text-secondary)' }}>{fmtBytes(f.size || 0)}</span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {error && <ErrorBanner msg={error} />}

      <ActionBtn onClick={onReview} disabled={totalSelected === 0}>
        Review {totalSelected} file{totalSelected !== 1 ? 's' : ''} →
      </ActionBtn>
    </Card>
  )
}

// ─── Step 3A — Explode Preview (Gateway → Git) ────────────────────────────────

interface Step3GwProps {
  files:           ExplodedFile[]
  selectedFiles:   Set<string>
  setSelectedFiles: (s: Set<string>) => void
  commitMsg:       string; setCommitMsg: (s: string) => void
  branch:          string; setBranch:    (s: string) => void
  onPush:          () => void
  pushing:         boolean
  error:           string
}

function Step3Gw({ files, selectedFiles, setSelectedFiles, commitMsg, setCommitMsg, branch, setBranch, onPush, pushing, error }: Step3GwProps) {
  function toggleFile(p: string) {
    const n = new Set(selectedFiles); n.has(p) ? n.delete(p) : n.add(p); setSelectedFiles(n)
  }
  function toggleAll() {
    setSelectedFiles(selectedFiles.size === files.length ? new Set() : new Set(files.map(f => f.relPath)))
  }

  const allSel = selectedFiles.size === files.length

  // Group by entityType for display
  const byType: Record<string, ExplodedFile[]> = {}
  for (const f of files) {
    const t = f.entityType || 'other'
    if (!byType[t]) byType[t] = []
    byType[t].push(f)
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
          Step 3 — Preview & Commit
        </h2>
        <span style={{ fontSize: '12px', color: PAGE_COLOR, fontWeight: 700 }}>
          {selectedFiles.size} / {files.length} files selected
        </span>
      </div>

      <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
        These are the exploded files that will be pushed to the repository. Uncheck any files you want to exclude.
      </p>

      {/* Commit options */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', marginBottom: '14px', alignItems: 'end' }}>
        <div>
          <label style={LBL}>Commit Message</label>
          <input style={INPUT_ST} value={commitMsg} onChange={e => setCommitMsg(e.target.value)} placeholder="Gateway SyncUp — describe your changes" />
        </div>
        <div>
          <label style={LBL}>Branch</label>
          <input style={{ ...INPUT_ST, width: '160px' }} value={branch} onChange={e => setBranch(e.target.value)} placeholder="main" />
        </div>
      </div>

      {/* File table */}
      <div style={{ border: '1px solid var(--color-border)', borderRadius: '7px', overflow: 'hidden', marginBottom: '16px', maxHeight: '420px', overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 160px 70px', alignItems: 'center', padding: '7px 12px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 1 }}>
          <input type="checkbox" checked={allSel} onChange={toggleAll} style={{ cursor: 'pointer', accentColor: PAGE_COLOR }} />
          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)' }}>File Path</span>
          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)' }}>Entity Type</span>
          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)', textAlign: 'right' }}>Size</span>
        </div>

        {files.map(f => {
          const sel = selectedFiles.has(f.relPath)
          const fileName = f.relPath.split('/').slice(1).join('/') || f.relPath
          return (
            <div key={f.relPath} style={{
              display: 'grid', gridTemplateColumns: '32px 1fr 160px 70px', alignItems: 'center',
              padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)',
              background: sel ? `${PAGE_RGBA}0.06)` : 'transparent',
            }}>
              <input type="checkbox" checked={sel} onChange={() => toggleFile(f.relPath)} style={{ cursor: 'pointer', accentColor: PAGE_COLOR }} />
              <span style={{ fontSize: '11.5px', fontFamily: 'ui-monospace,monospace', color: sel ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fileName}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontFamily: 'ui-monospace,monospace' }}>{f.entityType}</span>
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textAlign: 'right' }}>{fmtBytes(f.sizeBytes)}</span>
            </div>
          )
        })}
      </div>

      {error && <ErrorBanner msg={error} />}

      <ActionBtn onClick={onPush} disabled={selectedFiles.size === 0 || !commitMsg.trim() || !branch.trim()} loading={pushing}>
        {pushing ? `Pushing ${selectedFiles.size} files…` : `Push ${selectedFiles.size} files to Git →`}
      </ActionBtn>
    </Card>
  )
}

// ─── Step 3B — Review Selection (Git → Gateway) ───────────────────────────────

interface Step3RepoProps {
  selectedPaths: string[]
  tgtGw:         string
  onImport:      () => void
  importing:     boolean
  error:         string
}

function Step3Repo({ selectedPaths, tgtGw, onImport, importing, error }: Step3RepoProps) {
  return (
    <Card>
      <h2 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
        Step 3 — Review & Import
      </h2>
      <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
        The following files will be downloaded from the repository, imploded into a Graphman bundle, and imported to <strong style={{ color: 'var(--color-text-primary)' }}>{tgtGw}</strong>.
      </p>

      <div style={{ border: '1px solid var(--color-border)', borderRadius: '7px', overflow: 'hidden', marginBottom: '16px', maxHeight: '360px', overflowY: 'auto' }}>
        <div style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--color-border)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)' }}>
          File Path ({selectedPaths.length})
        </div>
        {selectedPaths.map(p => (
          <div key={p} style={{ padding: '7px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '12px', fontFamily: 'ui-monospace,monospace', color: 'var(--color-text-primary)' }}>
            {p}
          </div>
        ))}
      </div>

      {error && <ErrorBanner msg={error} />}

      <ActionBtn onClick={onImport} disabled={selectedPaths.length === 0} loading={importing}>
        {importing ? 'Importing…' : `Import ${selectedPaths.length} files to ${tgtGw} →`}
      </ActionBtn>
    </Card>
  )
}

// ─── Step 4 — Result ──────────────────────────────────────────────────────────

interface Step4Props {
  direction:     Direction
  pushResults?:  PushResult[]
  importResult?: ImportResult | null
  importError?:  string
  onReset:       () => void
}

function Step4({ direction, pushResults, importResult, importError, onReset }: Step4Props) {
  const [logOpen, setLogOpen] = useState(false)

  if (direction === 'gw-to-git' && pushResults) {
    const created = pushResults.filter(r => r.action === 'created').length
    const updated = pushResults.filter(r => r.action === 'updated').length
    const failed  = pushResults.filter(r => !r.success).length

    const actionColor = (action?: string) => {
      if (action === 'created') return PAGE_COLOR
      if (action === 'updated') return '#3b82f6'
      return '#f87171'
    }
    const actionBg = (action?: string) => {
      if (action === 'created') return `${PAGE_RGBA}0.05)`
      if (action === 'updated') return 'rgba(59,130,246,0.05)'
      return 'rgba(239,68,68,0.05)'
    }
    const actionLabel = (action?: string) => {
      if (action === 'created') return 'Created'
      if (action === 'updated') return 'Updated'
      return 'Failed'
    }

    return (
      <Card>
        <div style={{ marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {failed === 0
            ? <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={PAGE_COLOR} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
            : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
          <div>
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
              Push Complete
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              {created > 0 && <span style={{ color: PAGE_COLOR, fontWeight: 700 }}>{created} created</span>}
              {created > 0 && (updated > 0 || failed > 0) && <span style={{ margin: '0 4px' }}>·</span>}
              {updated > 0 && <span style={{ color: '#3b82f6', fontWeight: 700 }}>{updated} updated</span>}
              {updated > 0 && failed > 0 && <span style={{ margin: '0 4px' }}>·</span>}
              {failed > 0  && <span style={{ color: '#f87171', fontWeight: 700 }}>{failed} failed</span>}
              {created === 0 && updated === 0 && failed === 0 && <span>No files processed</span>}
            </p>
          </div>
        </div>

        <div style={{ border: '1px solid var(--color-border)', borderRadius: '7px', overflow: 'hidden', marginBottom: '16px', maxHeight: '400px', overflowY: 'auto' }}>
          <div style={{ padding: '7px 12px', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--color-border)', display: 'grid', gridTemplateColumns: '24px 1fr 80px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-text-secondary)' }}>
            <span/>
            <span>File Path</span>
            <span style={{ textAlign: 'center' }}>Status</span>
          </div>
          {pushResults.map(r => (
            <div key={r.relPath} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 80px', alignItems: 'center', padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: actionBg(r.action) }}>
              <span style={{ color: actionColor(r.action) }}>
                {r.success
                  ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                  : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
              </span>
              <div>
                <div style={{ fontSize: '12px', fontFamily: 'ui-monospace,monospace', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.relPath}</div>
                {r.error && <div style={{ fontSize: '11px', color: '#fca5a5', marginTop: '2px' }}>{r.error}</div>}
              </div>
              <span style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, color: actionColor(r.action) }}>
                {actionLabel(r.action)}
              </span>
            </div>
          ))}
        </div>

        <ActionBtn onClick={onReset} variant="ghost">← Start Over</ActionBtn>
      </Card>
    )
  }

  // Git → Gateway result
  const success = importResult?.success ?? false
  const log     = importResult?.importLog || importError || ''

  return (
    <Card>
      <div style={{ marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        {success
          ? <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={PAGE_COLOR} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
          : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>}
        <div>
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            {success ? 'Import Complete' : 'Import Failed'}
          </h2>
          {importResult && (
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              {importResult.downloaded} file{importResult.downloaded !== 1 ? 's' : ''} downloaded from repository → imported to <strong style={{ color: 'var(--color-text-primary)' }}>{importResult.gateway}</strong>
            </p>
          )}
        </div>
      </div>

      {log && (
        <div style={{ marginBottom: '16px' }}>
          <button onClick={() => setLogOpen(p => !p)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '12px', fontWeight: 600, padding: '6px 0' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: logOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="9 18 15 12 9 6"/></svg>
            {logOpen ? 'Hide' : 'Show'} import log
          </button>
          {logOpen && (
            <pre style={{ margin: '6px 0 0', padding: '10px 14px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', fontSize: '11px', color: 'var(--color-text-secondary)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '300px', overflowY: 'auto' }}>
              {log}
            </pre>
          )}
        </div>
      )}

      {importResult?.downloadResults && importResult.downloadResults.some(r => !r.success) && (
        <div style={{ marginBottom: '16px', padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#fca5a5', marginBottom: '6px' }}>Failed downloads:</div>
          {importResult.downloadResults.filter(r => !r.success).map(r => (
            <div key={r.path} style={{ fontSize: '11px', color: '#fca5a5', fontFamily: 'ui-monospace,monospace' }}>{r.path}: {r.error}</div>
          ))}
        </div>
      )}

      <ActionBtn onClick={onReset} variant="ghost">← Start Over</ActionBtn>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RepositorySyncUp() {
  const [step, setStep]         = useState<Step>(1)
  const [direction, setDirection] = useState<Direction>('gw-to-git')

  // Configuration lists
  const [gateways, setGateways] = useState<GatewayEntry[]>([])
  const [repos, setRepos]       = useState<RepoEntry[]>([])
  const [schema, setSchema]     = useState('')

  // Step 1 selections
  const [srcGw,   setSrcGw]   = useState('')
  const [tgtRepo, setTgtRepo] = useState('')
  const [srcRepo, setSrcRepo] = useState('')
  const [tgtGw,   setTgtGw]   = useState('')

  // Step 2A state (gw→git)
  const [entityMap, setEntityMap]       = useState<EntityGroup>({})
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())

  // Step 2B state (git→gw)
  const [repoGrouped, setRepoGrouped]     = useState<RepoGrouped>({})
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())

  // Step 3A (gw→git)
  const [explodedFiles, setExplodedFiles]   = useState<ExplodedFile[]>([])
  const [selectedFiles, setSelectedFiles]   = useState<Set<string>>(new Set())
  const [tmpId, setTmpId]                   = useState('')
  const [commitMsg, setCommitMsg]           = useState('')
  const [branch, setBranch]                 = useState('main')

  // Loading / error
  const [step1Loading, setStep1Loading] = useState(false)
  const [step2Loading, setStep2Loading] = useState(false)
  const [step3Loading, setStep3Loading] = useState(false)
  const [error, setError]               = useState('')

  // Step 4
  const [pushResults, setPushResults]     = useState<PushResult[] | undefined>()
  const [importResult, setImportResult]   = useState<ImportResult | null>(null)
  const [importError, setImportError]     = useState('')

  // Load gateways + repos on mount
  useEffect(() => {
    Promise.all([
      fetch(`${API}/graphman-config`).then(r => r.json()),
      fetch(`${API}/github-repos`).then(r => r.json()),
    ]).then(([gwData, repoData]) => {
      if (gwData.success) {
        setGateways(Object.entries(gwData.gateways || {}).map(([name, gw]: [string, unknown]) => ({
          name,
          address: (gw as { address?: string }).address || '',
        })))
        setSchema(gwData.options?.schema || '')
      }
      if (repoData.success) {
        setRepos((repoData.repositories || []).map((r: RepoEntry) => r))
      }
    }).catch(() => {})
  }, [])

  // When a repo is selected in direction gw→git, pre-fill branch
  useEffect(() => {
    const r = repos.find(r => r.name === tgtRepo)
    if (r?.branch) setBranch(r.branch)
  }, [tgtRepo, repos])

  function reset() {
    setStep(1)
    setEntityMap({})
    setSelectedItems(new Set())
    setRepoGrouped({})
    setSelectedPaths(new Set())
    setExplodedFiles([])
    setSelectedFiles(new Set())
    setTmpId('')
    setCommitMsg('')
    setPushResults(undefined)
    setImportResult(null)
    setImportError('')
    setError('')
  }

  // ── Step 1 Continue ──────────────────────────────────────────────────────────
  async function handleStep1Continue() {
    setError('')
    setStep1Loading(true)
    try {
      if (direction === 'gw-to-git') {
        const r = await fetch(`${API}/repo-sync/export-selected`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gateway: srcGw, schema }),
        })
        const d = await r.json()
        if (!d.success) { setError(d.error || 'Export failed.'); return }
        if (Object.keys(d.entityMap).length === 0) { setError('The gateway returned no entities.'); return }
        setEntityMap(d.entityMap)
        // Pre-select all items
        const allIds = new Set<string>()
        for (const [key, items] of Object.entries(d.entityMap as EntityGroup)) {
          items.forEach((_, i) => allIds.add(`${key}::${i}`))
        }
        setSelectedItems(allIds)
        setStep(2)
      } else {
        const r = await fetch(`${API}/repo-sync/list-repo-contents`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoName: srcRepo }),
        })
        const d = await r.json()
        if (!d.success) { setError(d.error || 'Failed to list repository.'); return }
        if (Object.keys(d.grouped).length === 0) { setError('No gateway entity files found in this repository.'); return }
        setRepoGrouped(d.grouped)
        setSelectedPaths(new Set())
        setStep(2)
      }
    } catch (e) {
      setError(`Network error: ${String(e)}`)
    } finally {
      setStep1Loading(false)
    }
  }

  // ── Step 2A Preview (explode) ────────────────────────────────────────────────
  async function handleStep2Preview() {
    setError('')
    setStep2Loading(true)
    try {
      // Build filtered bundle from selected items
      const filteredBundle: EntityGroup = {}
      for (const [key, items] of Object.entries(entityMap)) {
        const selItems = items.filter((_, i) => selectedItems.has(`${key}::${i}`))
        if (selItems.length > 0) filteredBundle[key] = selItems
      }

      const r = await fetch(`${API}/repo-sync/explode`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle: filteredBundle, schema }),
      })
      const d = await r.json()
      if (!d.success) { setError(d.detail || d.error || 'Explode failed.'); return }
      setExplodedFiles(d.files)
      setTmpId(d.tmpId)
      setSelectedFiles(new Set(d.files.map((f: ExplodedFile) => f.relPath)))
      setStep(3)
    } catch (e) {
      setError(`Network error: ${String(e)}`)
    } finally {
      setStep2Loading(false)
    }
  }

  // ── Step 2B Review ───────────────────────────────────────────────────────────
  function handleStep2Review() {
    setError('')
    setStep(3)
  }

  // ── Step 3A Push to Git ──────────────────────────────────────────────────────
  async function handlePush() {
    setError('')
    setStep3Loading(true)
    try {
      const r = await fetch(`${API}/repo-sync/push-to-github`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tmpId, repoName: tgtRepo,
          selectedFiles: Array.from(selectedFiles),
          commitMessage: commitMsg, branch,
        }),
      })
      const d = await r.json()
      // 422 = branch missing or other pre-flight failure — stay on step 3 with error
      if (!r.ok && !d.results) {
        setError(d.error + (d.detail ? `\n${d.detail}` : ''))
        return
      }
      setPushResults(d.results || [])
      setStep(4)
    } catch (e) {
      setError(`Network error: ${String(e)}`)
    } finally {
      setStep3Loading(false)
    }
  }

  // ── Step 3B Import ───────────────────────────────────────────────────────────
  async function handleImport() {
    setError('')
    setStep3Loading(true)
    try {
      const r = await fetch(`${API}/repo-sync/pull-and-import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoName: srcRepo,
          selectedPaths: Array.from(selectedPaths),
          gateway: tgtGw, schema,
        }),
      })
      const d = await r.json()
      if (d.success) {
        setImportResult(d)
      } else {
        setImportError(d.error || 'Import failed.')
        setImportResult(d)
      }
      setStep(4)
    } catch (e) {
      setImportError(`Network error: ${String(e)}`)
      setStep(4)
    } finally {
      setStep3Loading(false)
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1100px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Hero banner ── */}
      <div style={{
        background: `linear-gradient(135deg, ${PAGE_RGBA}0.10) 0%, ${PAGE_RGBA}0.03) 100%)`,
        border: `1px solid ${PAGE_RGBA}0.20)`,
        borderLeft: `4px solid ${PAGE_COLOR}`,
        borderRadius: '10px',
        padding: '20px 24px',
        marginBottom: '20px',
        boxShadow: '0 2px 14px rgba(0,0,0,0.08)',
      }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.2px' }}>
          Repository SyncUp
          <span style={{ fontWeight: 400, fontSize: '15px', color: 'var(--color-text-secondary)', marginLeft: '12px', letterSpacing: '0' }}>— Bi-directional Gateway ↔ GitHub Sync</span>
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginTop: '6px', marginBottom: 0 }}>
          Export gateway entities and push them as exploded files to a GitHub repository, or pull entity files from a repo and import them back to a gateway — with full entity-level selection control in both directions.
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
            {
              title: 'Choose Direction & Endpoints',
              desc: 'Select Gateway → Git to export entities to a repository, or Git → Gateway to pull files from a repo and import them. Pick source gateway and target repo (or vice versa).',
            },
            {
              title: 'Select Entities or Files',
              desc: direction === 'gw-to-git'
                ? 'The gateway is exported and all entity types are listed. Expand any type to cherry-pick individual services, policies, JDBC connections, and more.'
                : 'The repository tree is fetched and gateway entity files are grouped by type. Browse folder-by-folder and select exactly the files you need.',
            },
            {
              title: direction === 'gw-to-git' ? 'Preview Exploded Files' : 'Review & Confirm',
              desc: direction === 'gw-to-git'
                ? 'The selected bundle is exploded (policy XML extracted separately). A file-by-file preview table shows every artifact. Deselect any file before committing.'
                : 'A read-only list confirms the files that will be downloaded, imploded into a Graphman bundle, and imported to the target gateway.',
            },
            {
              title: direction === 'gw-to-git' ? 'Push to GitHub' : 'Import to Gateway',
              desc: direction === 'gw-to-git'
                ? 'Files are pushed to the repository via the GitHub REST API using your PAT — no git binary required. Per-file success or failure is reported.'
                : 'Selected files are downloaded, assembled into a bundle by graphman implode, and imported to the target gateway. The full import log is shown.',
            },
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
      <WorkflowStepper step={step} direction={direction} />

      {/* ── Step content ── */}
      {step === 1 && (
        <Step1
          direction={direction} setDirection={d => { setDirection(d); reset() }}
          gateways={gateways} repos={repos}
          srcGw={srcGw} setSrcGw={setSrcGw}
          tgtRepo={tgtRepo} setTgtRepo={setTgtRepo}
          srcRepo={srcRepo} setSrcRepo={setSrcRepo}
          tgtGw={tgtGw} setTgtGw={setTgtGw}
          schema={schema} setSchema={setSchema}
          onContinue={handleStep1Continue}
          loading={step1Loading} error={error}
        />
      )}

      {step === 2 && direction === 'gw-to-git' && (
        <Step2Gw
          entityMap={entityMap}
          selected={selectedItems} setSelected={setSelectedItems}
          onPreview={handleStep2Preview}
          previewLoading={step2Loading}
          error={error}
        />
      )}

      {step === 2 && direction === 'git-to-gw' && (
        <Step2Repo
          grouped={repoGrouped}
          selected={selectedPaths} setSelected={setSelectedPaths}
          onReview={handleStep2Review}
          error={error}
        />
      )}

      {step === 3 && direction === 'gw-to-git' && (
        <Step3Gw
          files={explodedFiles}
          selectedFiles={selectedFiles} setSelectedFiles={setSelectedFiles}
          commitMsg={commitMsg} setCommitMsg={setCommitMsg}
          branch={branch} setBranch={setBranch}
          onPush={handlePush} pushing={step3Loading} error={error}
        />
      )}

      {step === 3 && direction === 'git-to-gw' && (
        <Step3Repo
          selectedPaths={Array.from(selectedPaths)}
          tgtGw={tgtGw}
          onImport={handleImport} importing={step3Loading} error={error}
        />
      )}

      {step === 4 && (
        <Step4
          direction={direction}
          pushResults={pushResults}
          importResult={importResult}
          importError={importError}
          onReset={reset}
        />
      )}

      {/* ── Back nav (steps 2–3) ── */}
      {step > 1 && step < 4 && (
        <div style={{ marginTop: '12px' }}>
          <button
            onClick={() => { setError(''); setStep(prev => (prev - 1) as Step) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 0' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
        </div>
      )}
    </div>
  )
}
