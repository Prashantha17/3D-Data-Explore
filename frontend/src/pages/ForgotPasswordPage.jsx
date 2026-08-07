import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { motion, AnimatePresence } from 'framer-motion'
import { Hand, Mail, User, Lock, Key, ArrowRight, ArrowLeft, AlertCircle, Loader2, Sun, Moon, CheckCircle2 } from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  
  // Steps: 'request' | 'verify' | 'reset' | 'success'
  const [step, setStep] = useState('request')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  
  // Fields
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Handle requesting the OTP (Step 1)
  const handleRequestOtp = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim()) {
      setError('Please enter your email address')
      return
    }
    
    setIsSubmitting(true)
    try {
      const res = await axios.post('/api/auth/forgot-password', {
        email: email.trim().toLowerCase(),
      })
      toast.success(res.data.message || 'OTP sent successfully!')
      setStep('verify')
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to request OTP. Please try again.'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle verifying the OTP (Step 2)
  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    setError('')
    if (!otp.trim()) {
      setError('Please enter the 6-digit OTP code')
      return
    }
    if (otp.trim().length !== 6) {
      setError('OTP must be exactly 6 digits')
      return
    }

    setIsSubmitting(true)
    try {
      await axios.post('/api/auth/verify-otp', {
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
      })
      toast.success('OTP verified successfully!')
      setStep('reset')
    } catch (err) {
      const msg = err.response?.data?.error || 'Invalid OTP code. Please try again.'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle resetting the password (Step 3)
  const handleResetPassword = async (e) => {
    e.preventDefault()
    setError('')
    if (!newPassword || !confirmPassword) {
      setError('All password fields are required')
      return
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (newPassword.length > 8) {
      setError('Password must be at most 8 characters')
      return
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError('Password must contain at least one uppercase letter (A-Z)')
      return
    }
    if (!/[a-z]/.test(newPassword)) {
      setError('Password must contain at least one lowercase letter (a-z)')
      return
    }
    if (!/[0-9]/.test(newPassword)) {
      setError('Password must contain at least one number (0-9)')
      return
    }
    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      setError('Password must contain at least one special character (!@#$%^&*...)')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setIsSubmitting(true)
    try {
      await axios.post('/api/auth/reset-password', {
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        new_password: newPassword,
      })
      toast.success('Password reset successfully!')
      setStep('success')
    } catch (err) {
      const msg = err.response?.data?.error || 'Password reset failed. Please try again.'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Animation variants
  const slideVariants = {
    hidden: { opacity: 0, x: 50 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: 'easeOut' } },
    exit: { opacity: 0, x: -50, transition: { duration: 0.3, ease: 'easeIn' } }
  }

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

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Hand size={24} className="text-white" />
            </div>
            <span className="text-2xl font-bold gradient-text">3D Data Explorer</span>
          </Link>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mt-4">Reset Password</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {step === 'request' && 'Verify your identity to request OTP'}
            {step === 'verify' && 'Enter the security code'}
            {step === 'reset' && 'Create your new password'}
            {step === 'success' && 'Password updated successfully'}
          </p>
        </div>

        {/* Form Card */}
        <div className="glass rounded-2xl p-8 relative overflow-hidden">
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-6"
            >
              <AlertCircle size={18} className="text-red-500 dark:text-red-400 flex-shrink-0" />
              <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {/* STEP 1: REQUEST OTP */}
            {step === 'request' && (
              <motion.form
                key="request-form"
                variants={slideVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                onSubmit={handleRequestOtp}
                noValidate
              >
                <div className="mb-6">
                  <label htmlFor="reset-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email Address</label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      id="reset-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input-field pl-10"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-base"
                >
                  {isSubmitting ? (
                    <><Loader2 size={20} className="animate-spin" /> Sending OTP...</>
                  ) : (
                    <>Send OTP <ArrowRight size={18} /></>
                  )}
                </button>

                <div className="text-center mt-6">
                  <Link to="/login" className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition-colors">
                    <ArrowLeft size={14} /> Back to Sign In
                  </Link>
                </div>
              </motion.form>
            )}

            {/* STEP 2: VERIFY OTP */}
            {step === 'verify' && (
              <motion.form
                key="verify-form"
                variants={slideVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                onSubmit={handleVerifyOtp}
              >
                <div className="mb-6">
                  <label htmlFor="reset-otp" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Enter 6-Digit OTP</label>
                  <div className="relative">
                    <Key size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      id="reset-otp"
                      type="text"
                      maxLength={6}
                      placeholder="     Enter 6-digit code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      className="input-field pl-10 tracking-widest text-center text-lg font-bold"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-base"
                >
                  {isSubmitting ? (
                    <><Loader2 size={20} className="animate-spin" /> Verifying...</>
                  ) : (
                    <>Verify OTP <ArrowRight size={18} /></>
                  )}
                </button>

                <div className="flex items-center justify-between mt-6 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setStep('request')}
                    className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    <ArrowLeft size={14} /> Back
                  </button>
                  <button
                    type="button"
                    onClick={handleRequestOtp}
                    className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors"
                  >
                    Resend Code
                  </button>
                </div>
              </motion.form>
            )}

            {/* STEP 3: CREATE NEW PASSWORD */}
            {step === 'reset' && (
              <motion.form
                key="reset-form"
                variants={slideVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                onSubmit={handleResetPassword}
              >
                <div className="mb-5">
                  <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">New Password</label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      id="new-password"
                      type="password"
                      placeholder="     6–8 chars with A-Z, a-z, 0-9, !@#"
                      maxLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="input-field pl-10"
                    />
                  </div>
                </div>

                <div className="mb-6">
                  <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Confirm New Password</label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      id="confirm-password"
                      type="password"
                      placeholder="     Repeat new password"
                      maxLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="input-field pl-10"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-base"
                >
                  {isSubmitting ? (
                    <><Loader2 size={20} className="animate-spin" /> Updating...</>
                  ) : (
                    <>Update Password <ArrowRight size={18} /></>
                  )}
                </button>
              </motion.form>
            )}

            {/* SUCCESS STATE */}
            {step === 'success' && (
              <motion.div
                key="success-card"
                variants={slideVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="text-center py-4"
              >
                <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/10">
                  <CheckCircle2 size={36} />
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Password Reset Successful</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-8 max-w-xs mx-auto">
                  Your password has been successfully updated. You can now use your new credentials to sign in.
                </p>
                <button
                  onClick={() => navigate('/login')}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-base"
                >
                  Sign In Now <ArrowRight size={18} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
