import type { ReactNode } from 'react'
import Header from './Header'
import Sidebar from './Sidebar'
import Footer from './Footer'
import { useAuth } from '../context/AuthContext'

interface LayoutProps { children: ReactNode }

export default function Layout({ children }: LayoutProps) {
  const { isAuthenticated } = useAuth()
  const sideW = isAuthenticated ? 220 : 0

  return (
    <div>
      <Header />
      {isAuthenticated && <Sidebar />}

      {/* Content pane: fixed below header, right of sidebar, above footer */}
      <div style={{
        position: 'fixed',
        top: '56px',
        left: `${sideW}px`,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <main style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--color-content-bg)',
        }}>
          {children}
        </main>
        <Footer />
      </div>
    </div>
  )
}
