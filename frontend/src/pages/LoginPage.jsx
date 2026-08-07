import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useGoogleLogin } from '@react-oauth/google'
import { useFormValidation, EMAIL_REGEX } from '../hooks/useFormValidation'
import { motion } from 'framer-motion'
import { Hand, Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle, Loader2, Sun, Moon } from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')

  // Redirect if already logged in — inside useEffect to not violate Rules of Hooks
  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  const { values, errors, touched, handleChange, handleBlur, validateAll } = useFormValidation(
    { email: '', password: '' },
    {
      email: {
        required: true,
        requiredMsg: 'Email is required',
        pattern: EMAIL_REGEX,
        patternMsg: 'Please enter a valid email address',
      },
      password: {
        required: true,
        requiredMsg: 'Password is required',
        minLength: 6,
        minLengthMsg: 'Password must be at least 6 characters',
      },
    }
  )

  const handleSubmit = async (e) => {
    e.preventDefault()
    setServerError('')
    if (!validateAll()) return

    setIsSubmitting(true)
    try {
      const res = await axios.post('/api/auth/login', {
        email: values.email.trim().toLowerCase(),
        password: values.password,
      })
      login(res.data.token, res.data.user)
      toast.success(`Welcome back, ${res.data.user.name}!`)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      let msg = 'Login failed. Please try again.'
      if (err.response?.data?.error) {
        msg = err.response.data.error
      } else if (err.response?.status === 401) {
        msg = 'Invalid email or password.'
      } else if (!err.response) {
        msg = 'Cannot connect to server. Please ensure the backend is active.'
      }
      setServerError(msg)
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const googleLogin = useGoogleLogin({
    onSuccess: async (response) => {
      try {
        setIsSubmitting(true)
        const res = await axios.post('/api/auth/google', { token: response.credential || response.access_token })
        login(res.data.token, res.data.user)
        toast.success('Google login successful!')
        navigate('/dashboard', { replace: true })
      } catch (err) {
        const msg = err.response?.data?.error || 'Google login failed. Please try again.'
        toast.error(msg)
      } finally {
        setIsSubmitting(false)
      }
    },
    onError: () => toast.error('Google login cancelled'),
  })

  return (
    <div className="min-h-screen bg-dark-default bg-grid flex items-center justify-center px-4 py-8 relative">
      {/* Theme Toggle in Absolute Top-Right */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-slate-500 bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 transition-all flex items-center justify-center"
          aria-label="Toggle theme"
          id="theme-toggle-btn"
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </div>

      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Hand size={24} className="text-white" />
            </div>
            <span className="text-2xl font-bold gradient-text">3D Data Explorer </span>
          </Link>
          <p className="text-slate-600 dark:text-slate-400 mt-3">Sign in to your account</p>
        </div>

        {/* Form Card */}
        <div className="glass rounded-2xl p-8">
          {/* Server Error */}
          {serverError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-6"
            >
              <AlertCircle size={18} className="text-red-500 dark:text-red-400 flex-shrink-0" />
              <span className="text-sm text-red-700 dark:text-red-300">{serverError}</span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div className="mb-5">
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="     you@example.com"
                  value={values.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={`input-field pl-10 ${touched.email && errors.email ? 'error' : ''}`}
                />
              </div>
              {touched.email && errors.email && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle size={12} /> {errors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
                <Link to="/forgot-password" className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-medium transition-colors" id="forgot-password-link">
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="     Enter your password"
                  maxLength={8}
                  value={values.password}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={`input-field pl-10 pr-10 ${touched.password && errors.password ? 'error' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {touched.password && errors.password && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle size={12} /> {errors.password}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full flex items-center justify-center gap-2 text-base"
              id="login-submit-btn"
            >
              {isSubmitting ? (
                <><Loader2 size={20} className="animate-spin" /> Signing in...</>
              ) : (
                <>Sign In <ArrowRight size={18} /></>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-slate-200 dark:bg-dark-border" />
            <span className="text-xs text-slate-500 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-dark-border" />
          </div>

          {/* Google Login */}
          <button
            onClick={() => googleLogin()}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-dark-border hover:border-slate-400 dark:hover:border-slate-500 bg-white hover:bg-slate-50 dark:bg-white/5 dark:hover:bg-white/10 transition-all text-sm font-medium text-slate-800 dark:text-white"
            id="google-login-btn"
          >
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
        </div>

        {/* Register Link */}
        <p className="text-center mt-6 text-sm text-slate-500 dark:text-slate-400">
          Don't have an account?{' '}
          <Link to="/register" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-medium transition-colors" id="register-link">
            Create one
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
