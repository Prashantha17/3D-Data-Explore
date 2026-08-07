import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem('elite_token'))
  const [loading, setLoading] = useState(true)

  // Verify token on mount
  useEffect(() => {
    let cancelled = false
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
      axios.get('/api/auth/me')
        .then(r => { if (!cancelled) setUser(r.data.user) })
        .catch(() => { if (!cancelled) performLogout() })
        .finally(() => { if (!cancelled) setLoading(false) })
    } else {
      setLoading(false)
    }
    return () => { cancelled = true }
  }, []) // Only run once on mount

  const login = useCallback((tkn, usr) => {
    localStorage.setItem('elite_token', tkn)
    axios.defaults.headers.common['Authorization'] = `Bearer ${tkn}`
    setToken(tkn)
    setUser(usr)
  }, [])

  const performLogout = useCallback(() => {
    localStorage.removeItem('elite_token')
    delete axios.defaults.headers.common['Authorization']
    setToken(null)
    setUser(null)
  }, [])

  const logout = useCallback(() => {
    performLogout()
  }, [performLogout])

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}