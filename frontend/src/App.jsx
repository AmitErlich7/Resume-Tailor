import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.js'
import { setAccessToken } from './services/api.js'
import Dashboard from './pages/Dashboard.jsx'
import Login from './pages/Login.jsx'
import Profile from './pages/Profile.jsx'
import Tailor from './pages/Tailor.jsx'
import Versions from './pages/Versions.jsx'

export default function App() {
  const { session, loading, signInWithGoogle, accessToken } = useAuth()

  // Set token synchronously before child components render and fire API calls
  setAccessToken(accessToken)

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{
          width: '32px', height: '32px',
          border: '2.5px solid var(--color-border)',
          borderTopColor: 'var(--color-accent)',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
      </div>
    )
  }

  if (!session) {
    return <Login onSignIn={signInWithGoogle} />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/tailor" element={<Tailor />} />
        <Route path="/tailor/:id" element={<Tailor />} />
        <Route path="/versions" element={<Versions />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
