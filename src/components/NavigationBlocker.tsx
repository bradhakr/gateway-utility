import type { Blocker } from 'react-router-dom'
import type { ReactNode } from 'react'

interface NavigationBlockerProps {
  blocker: Blocker
  title?: string
  description: string | ReactNode
  stayLabel?: string
  proceedLabel?: string
}

/**
 * Full-screen modal that fires whenever the React Router blocker intercepts
 * an in-app navigation attempt. Clicking the backdrop or "Stay on page"
 * cancels the navigation; "Leave anyway" lets it proceed.
 */
export function NavigationBlocker({
  blocker,
  title = 'Unsaved changes',
  description,
  stayLabel = 'Stay on page',
  proceedLabel = 'Leave anyway',
}: NavigationBlockerProps) {
  if (blocker.state !== 'blocked') return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)' }}
      onClick={() => blocker.reset()}
    >
      <div
        style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '28px 32px', maxWidth: '460px', width: '90%', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '17px' }}>
            ⚠
          </div>
          <span style={{ fontSize: '17px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{title}</span>
        </div>

        {/* Body */}
        <div style={{ fontSize: '13.5px', color: 'var(--color-text-secondary)', lineHeight: 1.65, marginBottom: '24px' }}>
          {description}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => blocker.proceed()}
            style={{ padding: '9px 18px', borderRadius: '7px', border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#fca5a5', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
          >
            {proceedLabel}
          </button>
          <button
            onClick={() => blocker.reset()}
            style={{ padding: '9px 22px', borderRadius: '7px', border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}
          >
            {stayLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
