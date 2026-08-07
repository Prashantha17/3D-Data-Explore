import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useGoogleLogin } from '@react-oauth/google'
import { useFormValidation, EMAIL_REGEX, getPasswordStrength, getPasswordCriteria } from '../hooks/useFormValidation'
import { motion, AnimatePresence } from 'framer-motion'
import { Hand, Mail, Lock, User, Key, Eye, EyeOff, ArrowRight, ArrowLeft, AlertCircle, Loader2, CheckCircle, Check, X, ShieldCheck, Sun, Moon } from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { login, user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  
  // Registration Steps: 'form' | 'otp'
  const [step, setStep] = useState('form')
  const [otp, setOtp] = useState('')
  const [isPasswordFocused, setIsPasswordFocused] = useState(false)

  // Redirect if already logged in
  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  const { values, errors, touched, handleChange, handleBlur, validateAll } = useFormValidation(
    { name: '', email: '', password: '', confirmPassword: '' },
    {
      name: {
        required: true,
        requiredMsg: 'Full name is required',
        minLength: 2,
        minLengthMsg: 'Name must be at least 2 characters',
        maxLength: 8,
        maxLengthMsg: 'Name must be at most 8 characters',
      },
      email: {
        required: true,
        requiredMsg: 'Email is required',
        pattern: EMAIL_REGEX,
        patternMsg: 'Only @gmail.com email addresses are accepted',
      },
      password: {
        required: true,
        requiredMsg: 'Password is required',
        minLength: 6,
        minLengthMsg: 'Password must be at least 6 characters',
        maxLength: 8,
        maxLengthMsg: 'Password must be at most 8 characters',
        custom: (val) => {
          if (!val) return ''
          if (!/[A-Z]/.test(val)) return 'Password must contain at least one uppercase letter (A-Z)'
          if (!/[a-z]/.test(val)) return 'Password must contain at least one lowercase letter (a-z)'
          if (!/[0-9]/.test(val)) return 'Password must contain at least one number (0-9)'
          if (!/[^A-Za-z0-9]/.test(val)) return 'Password must contain at least one special character (!@#$%^&*...)'
          return ''
        },
      },
      confirmPassword: {
        required: true,
        requiredMsg: 'Please confirm your password',
        custom: (val, all) => val !== all.password ? 'Passwords do not match' : '',
      },
    }
  )

  const pwStrength = getPasswordStrength(values.password)
  const pwCriteria = getPasswordCriteria(values.password)
  const allCriteriaMet = pwCriteria.every(c => c.met)

  // Step 1: Submit Form -> Send OTP to Email
  const handleRequestOtp = async (e) => {
    e.preventDefault()
    setServerError('')
    if (!validateAll()) return

    setIsSubmitting(true)
    try {
      const res = await axios.post('/api/auth/send-register-otp', {
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
      })
      toast.success(res.data.message || `OTP verification code sent to ${values.email}`)
      setStep('otp')
    } catch (err) {
      let msg = 'Failed to send OTP code. Please try again.'
      if (err.response?.data?.error) {
        msg = err.response.data.error
      } else if (err.response?.status === 409) {
        msg = 'This email is already registered. Please sign in instead.'
      }
      setServerError(msg)
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Step 2: Verify OTP & Complete Account Creation
  const handleVerifyOtpAndRegister = async (e) => {
    e.preventDefault()
    setServerError('')
    if (!otp.trim()) {
      setServerError('Please enter the 6-digit OTP code')
      return
    }
    if (otp.trim().length !== 6) {
      setServerError('OTP code must be exactly 6 digits')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await axios.post('/api/auth/register', {
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
        otp: otp.trim(),
      })
      login(res.data.token, res.data.user)
      toast.success(`Welcome, ${res.data.user.name}! Email verified and account created.`)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      let msg = 'Registration verification failed. Please try again.'
      if (err.response?.data?.error) {
        msg = err.response.data.error
      }
      setServerError(msg)
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Resend OTP
  const handleResendOtp = async () => {
    setServerError('')
    setIsSubmitting(true)
    try {
      const res = await axios.post('/api/auth/send-register-otp', {
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
      })
      toast.success(res.data.message || 'New OTP sent to your email!')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to resend OTP')
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
        toast.success('Account created with Google!')
        navigate('/dashboard', { replace: true })
      } catch (err) {
        toast.error('Google signup failed')
      } finally {
        setIsSubmitting(false)
      }
    },
    onError: () => toast.error('Google signup cancelled'),
  })

  // Animation variants
  const slideVariants = {
    hidden: { opacity: 0, x: 40 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.35, ease: 'easeOut' } },
    exit: { opacity: 0, x: -40, transition: { duration: 0.25, ease: 'easeIn' } }
  }

  return (
    <div className="min-h-screen bg-dark-default bg-grid flex items-center justify-center px-4 py-8 relative">
      {/* Theme Toggle Top-Right */}
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
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md relative z-10"
      >
        {/* Header Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Hand size={24} className="text-white" />
            </div>
            <span className="text-2xl font-bold gradient-text">3D Data Explorer</span>
          </Link>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mt-4">
            {step === 'form' ? 'Create Your Account' : 'Verify Your Email'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {step === 'form' ? 'Join 3D Data Explorer today' : `Enter the 6-digit OTP code sent to ${values.email}`}
          </p>
        </div>

        {/* Card Container */}
        <div className="glass rounded-2xl p-8 relative overflow-hidden">
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

          <AnimatePresence mode="wait">
            {/* STEP 1: REGISTRATION FORM */}
            {step === 'form' && (
              <motion.form
                key="register-form"
                variants={slideVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                onSubmit={handleRequestOtp}
                noValidate
              >
                {/* Full Name */}
                <div className="mb-4">
                  <label htmlFor="reg-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Full Name</label>
                  <div className="relative">
                    <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      id="reg-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      placeholder="User Name"
                      value={values.name}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className={`input-field pl-10 ${touched.name && errors.name ? 'error' : ''}`}
                    />
                  </div>
                  {touched.name && errors.name && (
                    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1"><AlertCircle size={12} /> {errors.name}</p>
                  )}
                </div>

                {/* Email Address */}
                <div className="mb-4">
                  <label htmlFor="reg-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email Address</label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      id="reg-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={values.email}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className={`input-field pl-10 ${touched.email && errors.email ? 'error' : ''}`}
                    />
                  </div>
                  {touched.email && errors.email && (
                    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1"><AlertCircle size={12} /> {errors.email}</p>
                  )}
                </div>

                {/* Password Field + Live Strength Checklist Popup */}
                <div className="mb-4 relative">
                  <label htmlFor="reg-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Password</label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      id="reg-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Create a strong password"
                      maxLength={8}
                      value={values.password}
                      onChange={handleChange}
                      onFocus={() => setIsPasswordFocused(true)}
                      onBlur={(e) => {
                        handleBlur(e)
                        setIsPasswordFocused(false)
                      }}
                      className={`input-field pl-10 pr-10 ${touched.password && errors.password ? 'error' : ''}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  {/* LIVE PASSWORD STRENGTH POPUP CARD */}
                  <AnimatePresence>
                    {(isPasswordFocused || values.password) && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                        className="mt-3 p-4 rounded-xl border border-indigo-500/30 bg-slate-900/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-xl space-y-3 z-20 relative"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ShieldCheck size={16} className="text-indigo-400" />
                            <span className="text-xs font-semibold text-slate-200">Password Security</span>
                          </div>
                          {values.password && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${pwStrength.color}20`, color: pwStrength.color }}>
                              {pwStrength.label}
                            </span>
                          )}
                        </div>

                        {/* Progress Bar */}
                        <div className="flex gap-1.5">
                          {[1, 2, 3, 4, 5].map(i => (
                            <div
                              key={i}
                              className="flex-1 h-1.5 rounded-full transition-all duration-300"
                              style={{ background: i <= pwStrength.score ? pwStrength.color : 'rgba(148, 163, 184, 0.2)' }}
                            />
                          ))}
                        </div>

                        {/* Checklist */}
                        <div className="grid grid-cols-1 gap-1.5 pt-1 text-xs">
                          {pwCriteria.map((c) => (
                            <div key={c.id} className="flex items-center gap-2 transition-colors">
                              {c.met ? (
                                <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                                  <Check size={11} strokeWidth={3} />
                                </div>
                              ) : (
                                <div className="w-4 h-4 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center flex-shrink-0 border border-slate-700">
                                  <X size={10} strokeWidth={2} />
                                </div>
                              )}
                              <span className={c.met ? 'text-emerald-400 font-medium' : 'text-slate-400'}>
                                {c.label}
                              </span>
                            </div>
                          ))}
                        </div>

                        {allCriteriaMet && (
                          <div className="pt-2 border-t border-slate-800 text-center">
                            <span className="text-xs font-medium text-emerald-400 flex items-center justify-center gap-1">
                              ✨ Strong & Secure Password!
                            </span>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {touched.password && errors.password && (
                    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1"><AlertCircle size={12} /> {errors.password}</p>
                  )}
                </div>

                {/* Confirm Password */}
                <div className="mb-6">
                  <label htmlFor="reg-confirm" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Confirm Password</label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      id="reg-confirm"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
                      maxLength={8}
                      value={values.confirmPassword}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className={`input-field pl-10 ${touched.confirmPassword && errors.confirmPassword ? 'error' : ''}`}
                    />
                    {values.confirmPassword && values.confirmPassword === values.password && (
                      <CheckCircle size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400" />
                    )}
                  </div>
                  {touched.confirmPassword && errors.confirmPassword && (
                    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1"><AlertCircle size={12} /> {errors.confirmPassword}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-base"
                  id="register-submit-btn"
                >
                  {isSubmitting ? (
                    <><Loader2 size={20} className="animate-spin" /> Sending Email OTP...</>
                  ) : (
                    <>Verify Email & Register <ArrowRight size={18} /></>
                  )}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-slate-200 dark:bg-dark-border" />
                  <span className="text-xs text-slate-500 uppercase tracking-wider">or</span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-dark-border" />
                </div>

                {/* Google Sign In */}
                <button
                  type="button"
                  onClick={() => googleLogin()}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-dark-border hover:border-slate-400 dark:hover:border-slate-500 bg-white hover:bg-slate-50 dark:bg-white/5 dark:hover:bg-white/10 transition-all text-sm font-medium text-slate-800 dark:text-white"
                  id="google-register-btn"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Continue with Google
                </button>
              </motion.form>
            )}

            {/* STEP 2: VERIFY REGISTRATION OTP */}
            {step === 'otp' && (
              <motion.form
                key="otp-form"
                variants={slideVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                onSubmit={handleVerifyOtpAndRegister}
              >
                <div className="mb-6">
                  <label htmlFor="reg-otp" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Enter 6-Digit Email Verification Code
                  </label>
                  <div className="relative">
                    <Key size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      id="reg-otp"
                      type="text"
                      maxLength={6}
                      placeholder="e.g. 123456"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      className="input-field pl-10 text-center tracking-[0.4em] font-mono text-lg font-bold"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-base mb-4"
                  id="verify-register-otp-btn"
                >
                  {isSubmitting ? (
                    <><Loader2 size={20} className="animate-spin" /> Verifying Code...</>
                  ) : (
                    <>Verify & Complete Signup <ArrowRight size={18} /></>
                  )}
                </button>

                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-4 pt-4 border-t border-slate-200 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => setStep('form')}
                    className="inline-flex items-center gap-1 hover:text-indigo-500 transition-colors"
                  >
                    <ArrowLeft size={14} /> Change Email
                  </button>

                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={isSubmitting}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                  >
                    Resend Code
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        {/* Login Link */}
        <p className="text-center mt-6 text-sm text-slate-500 dark:text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 font-medium transition-colors" id="login-link">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
