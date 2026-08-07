import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

const LandingPage = lazy(() => import('./pages/LandingPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-dark-default">
        <div className="flex flex-col items-center gap-4">
          <div className="spinner" style={{ width: 40, height: 40 }} />
          <span className="text-sm text-slate-400 animate-pulse-slow">Loading your workspace...</span>
        </div>
      </div>
    )
  }

  return user ? children : <Navigate to="/login" replace />
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? <Navigate to="/dashboard" replace /> : children
}

export default function App() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-dark-default">
        <div className="flex flex-col items-center gap-4">
          <div className="spinner" style={{ width: 40, height: 40 }} />
          <span className="text-sm text-slate-400 animate-pulse-slow">Loading 3D Data Explorer...</span>
        </div>
      </div>
    }>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}