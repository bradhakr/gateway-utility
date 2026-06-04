import { createBrowserRouter, RouterProvider, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import type { ReactNode } from 'react'
import Layout from './components/Layout'

// Pages
import GatewayLogin       from './pages/GatewayLogin'
import Landing            from './pages/Landing'
import Configuration      from './pages/Configuration'
import GraphmanConfig     from './pages/GraphmanConfig'
import FindAssertions     from './pages/FindAssertions'
import CheckCompliance    from './pages/CheckCompliance'
import KeysCertificates   from './pages/KeysCertificates'
import EntityInspector    from './pages/EntityInspector'
import NewEntity          from './pages/NewEntity'
import EntityForge        from './pages/EntityForge'
import EntityBrowser      from './pages/EntityBrowser'
import GraphmanVersion    from './pages/GraphmanVersion'
import AuthSetup         from './pages/AuthSetup'
import OidcCallback      from './pages/OidcCallback'

// ─── Route guards ─────────────────────────────────────────────────────────────

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <>{children}</>
}


// ─── App with routing ─────────────────────────────────────────────────────────

function AppRoutes() {
  const { isAuthenticated } = useAuth()

  return (
    <Layout>
      <Routes>
        {/* Root: redirect based on auth state */}
        <Route path="/" element={
          isAuthenticated ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />
        } />

        {/* Public (pre-login) routes */}
        <Route path="/login"      element={<PublicOnlyRoute><GatewayLogin /></PublicOnlyRoute>} />
        <Route path="/login-idsp" element={<PublicOnlyRoute><GatewayLogin /></PublicOnlyRoute>} />

        {/* OIDC callback — must be public (user is not yet authenticated) */}
        <Route path="/auth/callback" element={<OidcCallback />} />

        {/* Protected (post-login) routes */}
        <Route path="/dashboard"          element={<ProtectedRoute><Landing /></ProtectedRoute>} />
        <Route path="/configuration"      element={<ProtectedRoute><Configuration /></ProtectedRoute>} />
        <Route path="/graphman-config"    element={<ProtectedRoute><GraphmanConfig /></ProtectedRoute>} />
        <Route path="/find-assertions"    element={<ProtectedRoute><FindAssertions /></ProtectedRoute>} />
        <Route path="/check-compliance"   element={<ProtectedRoute><CheckCompliance /></ProtectedRoute>} />
        <Route path="/certificate-management" element={<ProtectedRoute><KeysCertificates /></ProtectedRoute>} />
        <Route path="/entity-updates"     element={<ProtectedRoute><EntityInspector /></ProtectedRoute>} />
        <Route path="/new-entity"         element={<ProtectedRoute><NewEntity /></ProtectedRoute>} />
        <Route path="/entity-forge"        element={<ProtectedRoute><EntityForge /></ProtectedRoute>} />
        <Route path="/entity-browser"     element={<ProtectedRoute><EntityBrowser /></ProtectedRoute>} />
        <Route path="/graphman-version"   element={<ProtectedRoute><GraphmanVersion /></ProtectedRoute>} />
        {/* Auth Setup is intentionally public — must be reachable before login to fix misconfigurations */}
        <Route path="/auth-setup"         element={<AuthSetup />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

// createBrowserRouter enables useBlocker (navigation guard) on all pages.
// AppRoutes still uses <Routes>/<Route> internally — both APIs are compatible.
const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    ),
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
