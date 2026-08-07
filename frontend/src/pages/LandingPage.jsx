import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { motion } from 'framer-motion'
import { Hand, Zap, Database, Shield, BarChart3, Cpu, ArrowRight, ChevronDown, Star, CheckCircle, Sun, Moon } from 'lucide-react'

const GESTURES = [
  { icon: '✋', name: 'Open Palm', action: 'Freeze View', color: '#667EEA' },
  { icon: '👊', name: 'Fist', action: 'Auto Rotate', color: '#764BA2' },
  { icon: '👆', name: 'Index Point', action: 'Select Point', color: '#F97316' },
  { icon: '✌️', name: 'Peace Sign', action: 'Zoom In', color: '#22C55E' },
  { icon: '🤙', name: 'Pinky+Thumb', action: 'Zoom Out', color: '#EF4444' },
  { icon: '👍', name: 'Thumbs Up', action: 'Next Chart', color: '#06B6D4' },
  { icon: '👎', name: 'Thumbs Down', action: 'Prev Chart', color: '#F59E0B' },
]

const FEATURES = [
  { icon: Hand, title: '7 Gesture Controls', desc: 'Navigate, zoom, rotate, and select data points with natural hand gestures in real-time.', color: 'from-indigo-500 to-purple-600' },
  { icon: BarChart3, title: '3D Visualization', desc: 'Interactive scatter, bar, and surface charts powered by Three.js with 30+ FPS.', color: 'from-purple-500 to-pink-600' },
  { icon: Cpu, title: 'AI-Powered', desc: 'MediaPipe hand tracking with 95-98% gesture recognition accuracy and <100ms latency.', color: 'from-orange-500 to-red-600' },
  { icon: Database, title: 'Smart Data', desc: 'Upload CSV files, auto-detect columns, and explore your data in immersive 3D space.', color: 'from-green-500 to-emerald-600' },
  { icon: Shield, title: 'Secure Auth', desc: 'JWT authentication with Google OAuth 2.0 integration. Your data stays protected.', color: 'from-cyan-500 to-blue-600' },
  { icon: Zap, title: 'Real-Time', desc: 'WebSocket-powered live gesture streaming with instant visual feedback loop.', color: 'from-yellow-500 to-orange-600' },
]

const STATS = [
  { value: '95-98%', label: 'Gesture Accuracy' },
  { value: '<100ms', label: 'Latency' },
  { value: '30+', label: 'FPS' },
  { value: '7', label: 'Gestures' },
]

// Floating particle component
function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: Math.random() * 4 + 2,
            height: Math.random() * 4 + 2,
            background: `rgba(102, 126, 234, ${Math.random() * 0.3 + 0.1})`,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [0.2, 0.6, 0.2],
          }}
          transition={{
            duration: Math.random() * 4 + 4,
            repeat: Infinity,
            delay: Math.random() * 2,
          }}
        />
      ))}
    </div>
  )
}

export default function LandingPage() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [activeGesture, setActiveGesture] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveGesture(prev => (prev + 1) % GESTURES.length)
    }, 2500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-dark-default bg-grid relative">
      <FloatingParticles />

      {/* ─── Navbar ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 group-hover:shadow-indigo-500/50 transition-shadow">
              <Hand size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold gradient-text">3D Data Explorer</span>
          </Link>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-slate-500 bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 transition-all flex items-center justify-center"
              aria-label="Toggle theme"
              id="theme-toggle-btn"
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            {user ? (
              <Link to="/dashboard" className="btn-primary text-sm flex items-center gap-2" id="nav-dashboard-btn">
                Dashboard <ArrowRight size={16} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-secondary text-sm" id="nav-login-btn">Sign In</Link>
                <Link to="/register" className="btn-primary text-sm" id="nav-register-btn">Get Started</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ─── */}
      <section className="relative pt-32 pb-20 px-6" id="hero-section">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-center max-w-4xl mx-auto"
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8"
            >
              <Star size={14} className="text-yellow-400" />
              <span className="text-sm text-slate-600 dark:text-slate-300">AI-Powered Gesture-Controlled 3D Data Explorer</span>
            </motion.div>

            <h1 className="text-5xl md:text-7xl font-extrabold leading-tight mb-6">
              Explore Data with{' '}
              <span className="gradient-text">Hand Gestures</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Navigate immersive 3D visualizations using real-time hand gesture recognition.
              Upload your CSV data and explore it like never before.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <Link to={user ? '/dashboard' : '/register'} className="btn-primary text-lg px-8 py-4 flex items-center gap-2" id="hero-cta-btn">
                Start Exploring <ArrowRight size={20} />
              </Link>
              <a href="#features" className="btn-secondary text-lg px-8 py-4 flex items-center gap-2" id="hero-features-btn">
                Learn More <ChevronDown size={20} />
              </a>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
              {STATS.map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="glass rounded-2xl p-5 card-hover"
                >
                  <div className="text-3xl font-bold gradient-text">{s.value}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{s.label}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Hero Gesture Preview */}
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="mt-20 max-w-4xl mx-auto"
          >
            <div className="glass rounded-3xl p-8 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-600/5" />
              <div className="relative flex flex-col md:flex-row items-center gap-8">
                {/* Gesture Display */}
                <div className="flex-shrink-0 text-center">
                  <motion.div
                    key={activeGesture}
                    initial={{ scale: 0.5, opacity: 0, rotateY: -90 }}
                    animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                    className="text-8xl mb-4"
                  >
                    {GESTURES[activeGesture].icon}
                  </motion.div>
                  <div className="text-lg font-semibold text-slate-800 dark:text-white">{GESTURES[activeGesture].name}</div>
                  <div className="text-sm mt-1" style={{ color: GESTURES[activeGesture].color }}>
                    → {GESTURES[activeGesture].action}
                  </div>
                </div>

                {/* All Gestures Grid */}
                <div className="flex-1 grid grid-cols-4 sm:grid-cols-7 gap-3">
                  {GESTURES.map((g, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveGesture(i)}
                      className={`p-3 rounded-xl text-center transition-all duration-300 ${
                        i === activeGesture
                          ? 'glass-light ring-2 ring-indigo-500 scale-110'
                          : 'hover:bg-white/5 opacity-60 hover:opacity-100'
                      }`}
                      id={`gesture-btn-${i}`}
                    >
                      <div className="text-2xl">{g.icon}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Features Section ─── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Powerful <span className="gradient-text">Features</span>
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-lg max-w-2xl mx-auto">
              Everything you need for immersive, gesture-controlled data exploration.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="glass rounded-2xl p-6 card-hover group"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg`}>
                  <f.icon size={22} className="text-white" />
                </div>
                <h3 className="text-xl font-semibold text-slate-800 dark:text-white mb-2">{f.title}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section className="py-24 px-6 relative">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              How It <span className="gradient-text">Works</span>
            </h2>
          </motion.div>

          <div className="space-y-8">
            {[
              { step: '01', title: 'Upload Your Data', desc: 'Upload a CSV file or pick from our sample datasets. The system automatically detects numeric columns and prepares 3D coordinates.', icon: Database },
              { step: '02', title: 'Enable Gesture Control', desc: 'Turn on your webcam and the AI-powered hand tracking begins instantly. Your hand becomes the controller.', icon: Hand },
              { step: '03', title: 'Explore in 3D', desc: 'Navigate through your data using natural hand gestures — zoom, rotate, select points, and switch charts effortlessly.', icon: BarChart3 },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="glass rounded-2xl p-8 flex items-start gap-6 card-hover"
              >
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-indigo-500/30">
                    {item.step}
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-800 dark:text-white mb-2 flex items-center gap-2">
                    <item.icon size={20} className="text-indigo-500 dark:text-indigo-400" />
                    {item.title}
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 leading-relaxed">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Section ─── */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="glass rounded-3xl p-12 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-600/10" />
            <div className="relative">
              <h2 className="text-4xl md:text-5xl font-bold mb-4">
                Ready to <span className="gradient-text">Explore</span>?
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-lg mb-8 max-w-xl mx-auto">
                Join and start exploring your data with the power of hand gestures and 3D visualization.
              </p>
              <Link
                to={user ? '/dashboard' : '/register'}
                className="btn-primary text-lg px-10 py-4 inline-flex items-center gap-2"
                id="cta-start-btn"
              >
                {user ? 'Go to Dashboard' : 'Create Free Account'} <ArrowRight size={20} />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-slate-200 dark:border-dark-border py-8 px-6 mt-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Hand size={18} className="text-indigo-500 dark:text-indigo-400" />
            <span className="text-sm text-slate-500 dark:text-slate-400">3D Data Explorer © 2026</span>
          </div> 
          <div className="flex items-center gap-3 text-sm text-slate-400 dark:text-slate-500">
            <CheckCircle size={14} className="text-green-500 dark:text-green-400" />
            <span className="text-slate-200 dark:text-dark-border">|</span>
            <span>Flask + React + Three.js</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
