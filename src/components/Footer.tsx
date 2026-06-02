export default function Footer() {
  return (
    <footer style={{
      background: 'var(--color-header-bg)',
      color: 'rgba(255,255,255,0.45)',
      fontSize: '11px',
      padding: '10px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      flexShrink: 0,
    }}>
      <span>
        Layer7 Gateway Utility &mdash; Broadcom Inc. &copy; {new Date().getFullYear()}
      </span>
      <span>
        API: <a
          href="http://localhost:3002/api/health"
          target="_blank"
          rel="noreferrer"
          style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'underline' }}
        >
          localhost:3002
        </a>
      </span>
    </footer>
  )
}
