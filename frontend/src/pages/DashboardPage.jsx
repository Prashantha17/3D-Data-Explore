import { useState, useRef, useCallback, useEffect, useMemo, Suspense } from 'react'
import GestureCamera from '../components/GestureCamera'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { useTheme } from '../context/ThemeContext'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Text, Html } from '@react-three/drei'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Hand, Upload, Camera, CameraOff, LogOut, BarChart3, History,
  ChevronDown, FileSpreadsheet, Loader2, AlertCircle, Database,
  Activity, TrendingUp, Layers, Eye, RefreshCw, Settings, X, Menu,
  Sparkles, Bot, FileDown, Send, Mic, MicOff, MessageSquare, Trash2,
  Sun, Moon
} from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'
import * as THREE from 'three'
import generateReport from '../utils/generateReport'

// ─────────────────────────────────────────────────────────────────────────────
// 3D SCATTER PLOT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const PALETTE = [
  '#667EEA', '#764BA2', '#F97316', '#22C55E', '#06B6D4',
  '#EF4444', '#8B5CF6', '#F59E0B', '#EC4899', '#14B8A6',
]

function DataPoint({ position, color, size, label, tooltip, onHover }) {
  const ref = useRef()
  const [hovered, setHovered] = useState(false)

  useFrame(() => {
    if (ref.current) {
      ref.current.scale.lerp(
        new THREE.Vector3(hovered ? 1.8 : 1, hovered ? 1.8 : 1, hovered ? 1.8 : 1),
        0.15
      )
    }
  })

  return (
    <mesh
      ref={ref}
      position={position}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); onHover?.(tooltip) }}
      onPointerOut={() => { setHovered(false); onHover?.(null) }}
    >
      <sphereGeometry args={[size || 0.08, 12, 12]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={hovered ? 0.6 : 0.2}
        roughness={0.3}
        metalness={0.5}
      />
      {hovered && (
        <Html distanceFactor={10} style={{ pointerEvents: 'none' }}>
          <div className="tooltip-3d whitespace-nowrap">
            <strong className="text-indigo-300">{label || 'Data Point'}</strong>
          </div>
        </Html>
      )}
    </mesh>
  )
}

function AxisLines({ ranges }) {
  const xLabel = ranges?.x?.label || 'X'
  const yLabel = ranges?.y?.label || 'Y'
  const zLabel = ranges?.z?.label || 'Z'

  return (
    <group>
      {/* X axis - red */}
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={2} array={new Float32Array([-6,0,0, 6,0,0])} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color="#EF4444" opacity={0.5} transparent />
      </line>
      <Text position={[6.5, 0, 0]} fontSize={0.3} color="#EF4444" anchorX="left">{xLabel}</Text>

      {/* Y axis - green */}
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={2} array={new Float32Array([0,-6,0, 0,6,0])} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color="#22C55E" opacity={0.5} transparent />
      </line>
      <Text position={[0, 6.5, 0]} fontSize={0.3} color="#22C55E" anchorX="center">{yLabel}</Text>

      {/* Z axis - blue */}
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={2} array={new Float32Array([0,0,-6, 0,0,6])} itemSize={3} />
        </bufferGeometry>
        <lineBasicMaterial color="#3B82F6" opacity={0.5} transparent />
      </line>
      <Text position={[0, 0, 6.5]} fontSize={0.3} color="#3B82F6" anchorX="center">{zLabel}</Text>

      {/* Grid floor */}
      <gridHelper args={[12, 12, 'rgba(102,126,234,0.15)', 'rgba(102,126,234,0.08)']} position={[0, -5, 0]} />
    </group>
  )
}

// Shared ref so useFrame reads live gesture without stale closure
const gestureActionRef = { current: '' }

function ScatterPlot({ data, ranges, gestureAction }) {
  const controlsRef = useRef()
  const groupRef = useRef()

  // Keep ref in sync with prop
  useEffect(() => { gestureActionRef.current = gestureAction }, [gestureAction])

  // Uniformly sample down visual points for silky smooth 60 FPS on large datasets (e.g. 10k+ rows)
  const displayData = useMemo(() => {
    if (data.length <= 1500) return data
    const step = Math.ceil(data.length / 1500)
    const sampled = []
    for (let i = 0; i < data.length; i += step) {
      sampled.push(data[i])
    }
    return sampled
  }, [data])

  // Assign colors by label
  const labelColorMap = useMemo(() => {
    const labels = [...new Set(displayData.map(p => p.label).filter(Boolean))]
    const map = {}
    labels.forEach((l, i) => { map[l] = PALETTE[i % PALETTE.length] })
    return map
  }, [displayData])

  // Gesture-driven controls — reads from ref so never stale
  useFrame((state, delta) => {
    const action = gestureActionRef.current
    if (!controlsRef.current || !groupRef.current) return
    switch (action) {
      case 'ROTATE':
        groupRef.current.rotation.y += delta * 0.5
        break
      case 'ZOOM_IN':
        if (state.camera.position.length() > 4) {
          state.camera.position.multiplyScalar(0.985)
          controlsRef.current.update()
        }
        break
      case 'ZOOM_OUT':
        if (state.camera.position.length() < 35) {
          state.camera.position.multiplyScalar(1.015)
          controlsRef.current.update()
        }
        break
      case 'FREEZE':
        break
      default: break
    }
  })

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -5, -10]} intensity={0.5} color="#764BA2" />

      <group ref={groupRef}>
        <AxisLines ranges={ranges} />
        {displayData.map((point, i) => (
          <DataPoint
            key={i}
            position={[point.x, point.y, point.z]}
            color={labelColorMap[point.label] || '#667EEA'}
            label={point.label || `Point ${i + 1}`}
            tooltip={point.tooltip}
            size={0.08}
          />
        ))}
      </group>

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={35}
        autoRotate={gestureAction === 'ROTATE'}
        autoRotateSpeed={2}
        enabled={gestureAction !== 'FREEZE'}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D BAR CHART COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function BarChart3D({ data, ranges, gestureAction }) {
  const controlsRef = useRef()
  const groupRef = useRef()

  // Keep ref in sync
  useEffect(() => { gestureActionRef.current = gestureAction }, [gestureAction])

  // Uniformly sample down visual points for silky smooth 60 FPS on large datasets (e.g. 10k+ rows)
  const displayData = useMemo(() => {
    if (data.length <= 1500) return data
    const step = Math.ceil(data.length / 1500)
    const sampled = []
    for (let i = 0; i < data.length; i += step) {
      sampled.push(data[i])
    }
    return sampled
  }, [data])

  const labelColorMap = useMemo(() => {
    const labels = [...new Set(displayData.map(p => p.label).filter(Boolean))]
    const map = {}
    labels.forEach((l, i) => { map[l] = PALETTE[i % PALETTE.length] })
    return map
  }, [displayData])

  useFrame((state, delta) => {
    const action = gestureActionRef.current
    if (!controlsRef.current || !groupRef.current) return
    switch (action) {
      case 'ROTATE':
        groupRef.current.rotation.y += delta * 0.5
        break
      case 'ZOOM_IN':
        if (state.camera.position.length() > 4) {
          state.camera.position.multiplyScalar(0.985)
          controlsRef.current.update()
        }
        break
      case 'ZOOM_OUT':
        if (state.camera.position.length() < 35) {
          state.camera.position.multiplyScalar(1.015)
          controlsRef.current.update()
        }
        break
      case 'FREEZE':
        break
      default: break
    }
  })

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -5, -10]} intensity={0.5} color="#764BA2" />

      <group ref={groupRef}>
        <AxisLines ranges={ranges} />
        {displayData.map((point, i) => {
          const yHeight = Math.max(0.1, point.y + 5)
          const color = labelColorMap[point.label] || '#667EEA'
          return (
            <mesh key={i} position={[point.x, -5 + yHeight / 2, point.z]}>
              <boxGeometry args={[0.3, yHeight, 0.3]} />
              <meshStandardMaterial color={color} roughness={0.3} metalness={0.5} />
            </mesh>
          )
        })}
      </group>

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={35}
        autoRotate={gestureAction === 'ROTATE'}
        autoRotateSpeed={2}
        enabled={gestureAction !== 'FREEZE'}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD PAGE
// ─────────────────────────────────────────────────────────────────────────────

const CHART_TYPES = ['scatter', 'bar']

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const { socketRef, connected, on, emit, initSocket, disconnectSocket } = useSocket()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  // Data state
  const [chartData, setChartData] = useState([])
  const [filteredPoints, setFilteredPoints] = useState([])
  const [rowCount, setRowCount] = useState(0)
  const [axisRanges, setAxisRanges] = useState(null)
  const [columns, setColumns] = useState({ numeric: [], categorical: [], all: [] })
  const [defaultAxes, setDefaultAxes] = useState(null)
  const [savedFilename, setSavedFilename] = useState('')
  const [dataStats, setDataStats] = useState(null)
  const [dataPreview, setDataPreview] = useState([])
  const [uniqueLabels, setUniqueLabels] = useState([])
  const [deepAnalysis, setDeepAnalysis] = useState(null)

  // UI state
  const [uploading, setUploading] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [currentGesture, setCurrentGesture] = useState(null)
  const [gestureAction, setGestureAction] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  
  // Chatbot State
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState([
    { sender: 'bot', text: 'Hello! I am your AI Data Assistant. Ask me anything about your dataset, e.g., "average age", "filter columns", or click the mic to speak!', timestamp: new Date() }
  ])
  const [chatInput, setChatInput] = useState('')
  const [isListening, setIsListening] = useState(false)
  const isListeningRef = useRef(false)
  const recognitionRef = useRef(null)
  const [isChatAnalyzing, setIsChatAnalyzing] = useState(false)
  const messagesEndRef = useRef(null)
  const [samples, setSamples] = useState([])
  const [showSidebar, setShowSidebar] = useState(true)
  const [activeTab, setActiveTab] = useState('data') // 'data' | 'gesture' | 'info'
  const [showAxesPanel, setShowAxesPanel] = useState(false)
  const [selectedAxes, setSelectedAxes] = useState({ x: '', y: '', z: '' })
  const [chartTypeIndex, setChartTypeIndex] = useState(0)

  // Sync isListening state to ref
  useEffect(() => {
    isListeningRef.current = isListening
  }, [isListening])

  // AI Insight state
  const [aiInsight, setAiInsight]     = useState(null)  // { text, source }
  const [aiLoading, setAiLoading]     = useState(false)
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [aiTypedText, setAiTypedText] = useState('')
  const aiTypewriterRef               = useRef(null)

  // Initialize socket on dashboard mount, disconnect on unmount
  useEffect(() => {
    initSocket()
    return () => disconnectSocket()
  }, [initSocket, disconnectSocket])

  // Cleanup speech on chat close
  useEffect(() => {
    if (!isChatOpen) {
      setIsListening(false)
      if (window.speechSynthesis) window.speechSynthesis.cancel()
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (e) {}
        recognitionRef.current = null
      }
    }
  }, [isChatOpen])

  // Cleanup speech on component unmount
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.cancel()
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (e) {}
      }
    }
  }, [])

  // Load samples on mount
  useEffect(() => {
    axios.get('/api/samples').then(r => setSamples(r.data.samples || [])).catch(() => {})
  }, [])

  // Handle gesture detected from GestureCamera (browser-side MediaPipe)
  const handleGestureDetected = useCallback((data) => {
    if (data?.error) {
      toast.error(data.error)
      setCameraOn(false)
      return
    }
    setCurrentGesture(data)
    setGestureAction(data.action)
    gestureActionRef.current = data.action
    if (data.action === 'NEXT') {
      setChartTypeIndex(prev => (prev + 1) % CHART_TYPES.length)
    } else if (data.action === 'PREV') {
      setChartTypeIndex(prev => (prev - 1 + CHART_TYPES.length) % CHART_TYPES.length)
    }
    const clearDelay = (data.action === 'ZOOM_IN' || data.action === 'ZOOM_OUT') ? 3000 : 2500
    setTimeout(() => {
      setGestureAction('')
      setCurrentGesture(null)
      gestureActionRef.current = ''
    }, clearDelay)
  }, [])

  // ── Typewriter effect for AI insight ──────────────────────────────────────
  useEffect(() => {
    if (!aiInsight?.text) { setAiTypedText(''); return }
    setAiTypedText('')
    let i = 0
    clearInterval(aiTypewriterRef.current)
    // For long rule-based reports, use a faster tick so it doesn't take forever
    const msPerChar = aiInsight.text.length > 500 ? 3 : 12
    aiTypewriterRef.current = setInterval(() => {
      // Advance multiple chars per tick for long text
      const step = aiInsight.text.length > 500 ? 6 : 1
      i = Math.min(i + step, aiInsight.text.length)
      setAiTypedText(aiInsight.text.slice(0, i))
      if (i >= aiInsight.text.length) clearInterval(aiTypewriterRef.current)
    }, msPerChar)
    return () => clearInterval(aiTypewriterRef.current)
  }, [aiInsight])

  // Scroll chat to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, isChatOpen])

  // ── Conversational Chatbot Send Message ────────────────────────────────────
  const handleSendMessage = useCallback(async (textToSend = null) => {
    const text = (textToSend || chatInput).trim()
    if (!text) return

    if (!chartData.length) {
      toast.error("Please load a dataset first to query it.")
      return
    }

    const userMsg = { sender: 'user', text, timestamp: new Date() }
    setChatMessages(prev => [...prev, userMsg])
    setChatInput('')
    setIsChatAnalyzing(true)

    if (window.speechSynthesis) window.speechSynthesis.cancel()

    // ── Local Interception of Visual Commands ────────────────────────────────
    const lowerText = text.toLowerCase().trim()

    // 1. Zoom In
    if (lowerText === "zoom in" || lowerText === "zoom") {
      setGestureAction('ZOOM_IN')
      gestureActionRef.current = 'ZOOM_IN'
      setChatMessages(prev => [...prev, {
        sender: 'bot',
        text: "Zooming in on the 3D canvas.",
        timestamp: new Date()
      }])
      setIsChatAnalyzing(false)
      if (window.speechSynthesis) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance("Zooming in"))
      }
      setTimeout(() => {
        setGestureAction(prev => prev === 'ZOOM_IN' ? '' : prev)
        if (gestureActionRef.current === 'ZOOM_IN') gestureActionRef.current = ''
      }, 3000)
      return
    }

    // 2. Zoom Out
    if (lowerText === "zoom out") {
      setGestureAction('ZOOM_OUT')
      gestureActionRef.current = 'ZOOM_OUT'
      setChatMessages(prev => [...prev, {
        sender: 'bot',
        text: "Zooming out on the 3D canvas.",
        timestamp: new Date()
      }])
      setIsChatAnalyzing(false)
      if (window.speechSynthesis) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance("Zooming out"))
      }
      setTimeout(() => {
        setGestureAction(prev => prev === 'ZOOM_OUT' ? '' : prev)
        if (gestureActionRef.current === 'ZOOM_OUT') gestureActionRef.current = ''
      }, 3000)
      return
    }

    // 3. Rotate
    if (lowerText.includes("rotate") || lowerText.includes("spin") || lowerText.includes("turn")) {
      setGestureAction('ROTATE')
      gestureActionRef.current = 'ROTATE'
      setChatMessages(prev => [...prev, {
        sender: 'bot',
        text: "Rotating the 3D visualization.",
        timestamp: new Date()
      }])
      setIsChatAnalyzing(false)
      if (window.speechSynthesis) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance("Rotating the plot"))
      }
      return
    }

    // 4. Freeze / Stop
    if (lowerText.includes("stop") || lowerText.includes("freeze") || lowerText.includes("pause") || lowerText.includes("hold")) {
      setGestureAction('FREEZE')
      gestureActionRef.current = 'FREEZE'
      setChatMessages(prev => [...prev, {
        sender: 'bot',
        text: "Freezing the rotation.",
        timestamp: new Date()
      }])
      setIsChatAnalyzing(false)
      if (window.speechSynthesis) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance("Freezing rotation"))
      }
      setTimeout(() => {
        setGestureAction(prev => prev === 'FREEZE' ? '' : prev)
        if (gestureActionRef.current === 'FREEZE') gestureActionRef.current = ''
      }, 1000)
      return
    }

    // 5. Scatter Plot
    if (lowerText.includes("scatter") || lowerText.includes("scatter plot")) {
      setChartTypeIndex(0)
      setChatMessages(prev => [...prev, {
        sender: 'bot',
        text: "Switched visualization to 3D Scatter Plot.",
        timestamp: new Date()
      }])
      setIsChatAnalyzing(false)
      if (window.speechSynthesis) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance("Switched to scatter plot"))
      }
      return
    }

    // 6. Bar Chart
    if (lowerText.includes("bar chart") || lowerText.includes("bar graph") || lowerText.includes("bar plot")) {
      setChartTypeIndex(1)
      setChatMessages(prev => [...prev, {
        sender: 'bot',
        text: "Switched visualization to 3D Bar Chart.",
        timestamp: new Date()
      }])
      setIsChatAnalyzing(false)
      if (window.speechSynthesis) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance("Switched to bar chart"))
      }
      return
    }

    try {
      const res = await axios.post('/api/query-data', {
        query: text,
        numeric_columns: columns.numeric,
        categorical_columns: columns.categorical,
        unique_labels: uniqueLabels,
        stats: dataStats || {},
        deep_analysis: deepAnalysis || {}
      })

      const { action, rules, narration, text_response } = res.data

      setChatMessages(prev => [...prev, {
        sender: 'bot',
        text: text_response,
        timestamp: new Date(),
        actionType: action
      }])

      if (action === 'reset') {
        setFilteredPoints(chartData)
        toast.success("Visualization reset.")
      } else if (action === 'filter' || action === 'highlight') {
        if (!rules || rules.length === 0) {
          toast.error("AI returned filter action but no rules to apply.")
        } else {
          const filtered = chartData.filter(point => {
            return rules.every(rule => {
              const rawStr = point.tooltip[rule.column]
              if (rawStr === undefined) return true
              
              const rawVal = parseFloat(rawStr)
              const ruleVal = parseFloat(rule.value)
              
              const isNumericCompare = !isNaN(rawVal) && !isNaN(ruleVal)
              const valA = isNumericCompare ? rawVal : String(rawStr).toLowerCase()
              const valB = isNumericCompare ? ruleVal : String(rule.value).toLowerCase()

              if (rule.operator === '>') return valA > valB
              if (rule.operator === '<') return valA < valB
              if (rule.operator === '>=') return valA >= valB
              if (rule.operator === '<=') return valA <= valB
              if (rule.operator === '==') return valA === valB
              if (rule.operator === '!=') return valA !== valB
              if (rule.operator === 'contains') return String(rawStr).toLowerCase().includes(String(rule.value).toLowerCase())
              return true
            })
          })
          setFilteredPoints(filtered)
          toast.success(`Filter applied! Showed ${filtered.length} points.`)
        }
      }

      if (window.speechSynthesis && narration) {
        const utterance = new SpeechSynthesisUtterance(narration)
        utterance.rate = 0.95
        window.speechSynthesis.speak(utterance)
      }

    } catch (err) {
      console.error(err)
      setChatMessages(prev => [...prev, {
        sender: 'bot',
        text: "Sorry, I had an error parsing your query. Please try again.",
        timestamp: new Date()
      }])
      toast.error("Failed to query data.")
    } finally {
      setIsChatAnalyzing(false)
    }
  }, [chatInput, chartData, columns, uniqueLabels, dataStats, deepAnalysis])

  // ── Toggle Speech Recognition ──────────────────────────────────────────────
  const toggleSpeechRecognition = useCallback(() => {
    if (isListeningRef.current) {
      setIsListening(false)
      if (window.speechSynthesis) window.speechSynthesis.cancel()
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (e) {
          console.error("Error stopping recognition:", e)
        }
        recognitionRef.current = null
      }
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      toast.error("Voice input is not supported in this browser. Please try Chrome or Edge.")
      return
    }

    // Helper function to launch the speech recognition
    const startListening = () => {
      // Check if user cancelled while speaking the welcome greeting
      if (!isListeningRef.current) return

      try {
        const recognition = new SpeechRecognition()
        recognition.continuous = false
        recognition.lang = 'en-US'
        recognition.interimResults = false
        recognitionRef.current = recognition

        recognition.onstart = () => {
          setIsListening(true)
        }

        recognition.onresult = (event) => {
          const speechText = event.results[0][0].transcript
          if (speechText.trim()) {
            handleSendMessage(speechText)
          }
        }

        recognition.onerror = (event) => {
          console.error("Speech recognition error:", event.error)
          setIsListening(false)
        }

        recognition.onend = () => {
          setIsListening(false)
          recognitionRef.current = null
        }

        recognition.start()
      } catch (e) {
        console.error("Speech recognition start failed:", e)
        setIsListening(false)
      }
    }

    // Trigger voice greeting first
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel() // clear anything currently speaking
      
      const welcomeUtterance = new SpeechSynthesisUtterance("Welcome to 3D Data Explore bro! What can I help you?")
      welcomeUtterance.rate = 0.95
      
      setIsListening(true)

      welcomeUtterance.onend = () => {
        startListening()
      }

      welcomeUtterance.onerror = (event) => {
        console.error("Speech synthesis greeting error:", event)
        // If speaking fails, fallback to starting recognition immediately
        startListening()
      }

      window.speechSynthesis.speak(welcomeUtterance)
    } else {
      // Speech synthesis not supported, start recognition directly
      setIsListening(true)
      startListening()
    }
  }, [handleSendMessage])

  // ── Fetch AI Insight from backend ────────────────────────────────────────
  const fetchAiInsight = useCallback(async (payload) => {
    setAiLoading(true)
    setShowAiPanel(true)
    setAiInsight(null)
    setAiTypedText('')
    
    // Cancel any ongoing speech
    if (window.speechSynthesis) window.speechSynthesis.cancel()

    try {
      const res = await axios.post('/api/ai-insight', payload)
      const text = res.data.insight
      const source = res.data.source
      setAiInsight({ text, source })
      
      // Speak a short summary aloud (not the full multi-section report)
      if (window.speechSynthesis) {
        // For rule-based: just read the first meaningful line as a teaser
        let speakText = text
        if (source === 'rule-based') {
          const firstLine = text.split('\n').find(l => l.trim() && !l.startsWith('📊') && !l.startsWith('📈'))
          speakText = firstLine ? firstLine.replace(/\*\*/g, '').trim() : 'Analysis complete. Check the panel for detailed insights.'
        }
        const utterance = new SpeechSynthesisUtterance(speakText)
        utterance.rate = 0.95
        window.speechSynthesis.speak(utterance)
      }
    } catch {
      const fallbackText = 'Explore the 3D visualization using hand gestures to rotate, zoom and select data points!'
      setAiInsight({
        text: fallbackText,
        source: 'fallback'
      })
      if (window.speechSynthesis) {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(fallbackText))
      }
    } finally {
      setAiLoading(false)
    }
  }, [])

  // Process API response into chart state
  const processDataResponse = useCallback((result) => {
    if (result.chart_data) {
      setChartData(result.chart_data)
      setFilteredPoints(result.chart_data)
      setRowCount(result.row_count || result.chart_data?.length || 0)
      setAxisRanges(result.axis_ranges || null)
      const numCols = result.numeric_columns || []
      const catCols = result.categorical_columns || []
      const allCols = result.columns || []
      setColumns({
        numeric: numCols,
        categorical: catCols,
        all: allCols,
      })
      setDefaultAxes(result.default_axes || null)
      setSelectedAxes(result.default_axes || { x: '', y: '', z: '' })
      setSavedFilename(result.saved_filename || '')
      setDataStats(result.stats || null)
      setDataPreview(result.preview || [])
      setUniqueLabels(result.unique_labels || [])
      setDeepAnalysis(result.deep_analysis || null)
      // Clear previous AI insights on new data load
      setAiInsight(null)
      setAiTypedText('')

      // Inject dynamic chat examples based on loaded dataset
      let examplesText = "I've successfully loaded your dataset! Here are some query examples you can try:\n\n"
      if (numCols.length > 0) {
        examplesText += `* **"average ${numCols[0]}"** or **"max ${numCols[0]}"**\n`
        const meanVal = result.stats?.[numCols[0]]?.mean || 30
        examplesText += `* **"${numCols[0]} > ${meanVal.toFixed(0)}"**\n`
      }
      if (numCols.length > 1) {
        const meanVal2 = result.stats?.[numCols[1]]?.mean || 50
        examplesText += `* **"less than ${meanVal2.toFixed(0)} ${numCols[1]}"**\n`
      }
      if (catCols.length > 0 && result.unique_labels && result.unique_labels.length > 0) {
        examplesText += `* **"filter for ${catCols[0]} ${result.unique_labels[0]}"**\n`
      }
      examplesText += `\n**Voice Commands to Control 3D Canvas:**\n`
      examplesText += `* **"rotate"** or **"spin"** (start rotating visual)\n`
      examplesText += `* **"zoom in"** or **"zoom out"** (zoom canvas)\n`
      examplesText += `* **"stop"** or **"freeze"** (stop rotation)\n`
      examplesText += `* **"bar chart"** or **"scatter plot"** (switch chart types)\n`
      examplesText += `* **"reset"** (to show all data)`

      setChatMessages(prev => [
        ...prev,
        {
          sender: 'bot',
          text: examplesText,
          timestamp: new Date()
        }
      ])
    }
  }, [])

  // File Upload
  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please upload a CSV file')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error('File size must be under 25MB')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    setUploading(true)
    try {
      const res = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      processDataResponse(res.data)
      toast.success(`Loaded ${res.data.row_count} rows from ${file.name}`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [processDataResponse])

  // Load sample
  const loadSample = useCallback(async (name) => {
    setUploading(true)
    try {
      const res = await axios.get(`/api/sample/${name}`)
      processDataResponse(res.data)
      toast.success(`Loaded sample: ${name}`)
    } catch (err) {
      toast.error('Failed to load sample')
    } finally {
      setUploading(false)
    }
  }, [processDataResponse])

  // Reprocess with new axes
  const handleReprocess = useCallback(async () => {
    if (!savedFilename || !selectedAxes.x || !selectedAxes.y || !selectedAxes.z) {
      toast.error('Select all 3 axes')
      return
    }
    try {
      const res = await axios.post('/api/reprocess', {
        filename: savedFilename,
        x: selectedAxes.x,
        y: selectedAxes.y,
        z: selectedAxes.z,
      })
      if (res.data.chart_data) {
        setChartData(res.data.chart_data)
        setFilteredPoints(res.data.chart_data)
        setAxisRanges(res.data.axis_ranges)
        toast.success('Axes updated!')
      }
    } catch (err) {
      toast.error('Reprocess failed')
    }
    setShowAxesPanel(false)
  }, [savedFilename, selectedAxes])

  // Camera toggle — now purely local (no socket emit needed to start camera)
  const toggleCamera = useCallback(() => {
    if (cameraOn) {
      setCameraOn(false)
      setCurrentGesture(null)
      setGestureAction('')
    } else {
      setCameraOn(true)
    }
  }, [cameraOn])

  // History
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await axios.get('/api/history')
      setHistory(res.data.datasets || [])
    } catch {
      toast.error('Failed to load history')
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const handleLogout = () => {
    setCameraOn(false)
    logout()
    navigate('/', { replace: true })
  }

  // ── AI Insight Handler ──────────────────────────────────────────────────
  const handleAiInsightClick = useCallback(() => {
    if (showAiPanel) {
      setShowAiPanel(false)
      if (window.speechSynthesis) window.speechSynthesis.cancel()
    } else {
      if (!aiInsight && !aiLoading) {
        fetchAiInsight({
          row_count:           rowCount,
          col_count:           columns.all.length,
          numeric_columns:     columns.numeric,
          categorical_columns: columns.categorical,
          unique_labels:       uniqueLabels,
          default_axes:        defaultAxes || {},
          stats:               dataStats || {},
          preview:             dataPreview,
          deep_analysis:       deepAnalysis || {},
        })
      } else {
        setShowAiPanel(true)
        if (aiInsight?.text && window.speechSynthesis) {
          window.speechSynthesis.cancel()
          const utterance = new SpeechSynthesisUtterance(aiInsight.text)
          utterance.rate = 0.95
          window.speechSynthesis.speak(utterance)
        }
      }
    }
  }, [showAiPanel, aiInsight, aiLoading, fetchAiInsight, rowCount, columns, uniqueLabels, defaultAxes, dataStats, dataPreview, deepAnalysis])

  // ── Generate PDF Report ────────────────────────────────────────────────
  const handleGenerateReport = useCallback(() => {
    if (!chartData.length) {
      toast.error('Load a dataset first to generate a report')
      return
    }
    try {
      const filename = generateReport({
        dataStats,
        deepAnalysis,
        aiInsight,
        chartData,
        columns,
        uniqueLabels,
        defaultAxes,
        savedFilename,
        dataPreview,
        rowCount,
      })
      toast.success(`Report saved: ${filename}`)
    } catch (err) {
      console.error('Report generation failed:', err)
      toast.error('Failed to generate report')
    }
  }, [dataStats, deepAnalysis, aiInsight, chartData, columns, uniqueLabels, defaultAxes, savedFilename, dataPreview, rowCount])

  return (
    <div className="h-screen flex overflow-hidden bg-dark-default">
      {/* ─── Sidebar ─── */}
      <AnimatePresence>
        {showSidebar && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="w-72 flex-shrink-0 glass border-r border-dark-border flex flex-col h-full z-20"
          >
            {/* User Info */}
            <div className="p-5 border-b border-dark-border">
              <div className="flex items-center gap-3">
                <img
                  src={user?.avatar || `https://api.dicebear.com/8.x/avataaars/svg?seed=${user?.email}`}
                  alt="avatar"
                  className="w-10 h-10 rounded-full border-2 border-indigo-500/40"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 dark:text-white truncate">{user?.name || 'User'}</div>
                  <div className="text-xs text-slate-500 truncate">{user?.email}</div>
                </div>
              </div>
            </div>

            {/* Tab Selector */}
            <div className="flex border-b border-dark-border">
              {[
                { key: 'data', label: 'Data', icon: Database },
                { key: 'gesture', label: 'Gestures', icon: Hand },
                { key: 'info', label: 'Stats', icon: Activity },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 py-3 text-xs font-medium flex flex-col items-center gap-1 transition-colors ${
                    activeTab === tab.key
                      ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                  id={`sidebar-tab-${tab.key}`}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeTab === 'data' && (
                <>
                  {/* Upload */}
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">Upload CSV</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleUpload}
                      className="hidden"
                      id="file-upload-input"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="w-full btn-secondary text-sm flex items-center justify-center gap-2"
                      id="upload-csv-btn"
                    >
                      {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      {uploading ? 'Processing...' : 'Upload CSV'}
                    </button>
                  </div>

                  {/* Samples */}
                  {samples.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">Sample Data</label>
                      <div className="space-y-2">
                        {samples.map((s, i) => (
                          <button
                            key={i}
                            onClick={() => loadSample(s.name)}
                            disabled={uploading}
                            className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-100 dark:bg-white/3 hover:bg-slate-200 dark:hover:bg-white/8 border border-transparent hover:border-indigo-500/20 transition-all text-left group"
                            id={`sample-btn-${i}`}
                          >
                            <FileSpreadsheet size={16} className="text-indigo-500 dark:text-indigo-400 group-hover:text-indigo-300" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-slate-700 dark:text-slate-300 truncate">{s.name}</div>
                              <div className="text-xs text-slate-500">{s.size_kb} KB</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Axes Selector */}
                  {columns.numeric.length >= 2 && (
                    <div>
                      <button
                        onClick={() => setShowAxesPanel(!showAxesPanel)}
                        className="w-full flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                        id="axes-toggle-btn"
                      >
                        <span>Change Axes</span>
                        <Settings size={14} className={`transition-transform ${showAxesPanel ? 'rotate-90' : ''}`} />
                      </button>
                      <AnimatePresence>
                        {showAxesPanel && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="space-y-2 overflow-hidden"
                          >
                            {['x', 'y', 'z'].map(axis => (
                              <div key={axis}>
                                <label className="text-xs text-slate-500 mb-1 block">{axis.toUpperCase()} Axis</label>
                                <select
                                  value={selectedAxes[axis]}
                                  onChange={e => setSelectedAxes(p => ({ ...p, [axis]: e.target.value }))}
                                  className="input-field text-xs py-2"
                                  id={`axis-select-${axis}`}
                                >
                                  <option value="">Select...</option>
                                  {columns.numeric.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                  ))}
                                </select>
                              </div>
                            ))}
                            <button
                              onClick={handleReprocess}
                              className="w-full btn-primary text-xs py-2 flex items-center justify-center gap-1"
                              id="reprocess-btn"
                            >
                              <RefreshCw size={14} /> Apply
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* History */}
                  <div>
                    <button
                      onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory() }}
                      className="w-full flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                      id="history-toggle-btn"
                    >
                      <span>History</span>
                      <History size={14} />
                    </button>
                    <AnimatePresence>
                      {showHistory && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          {historyLoading ? (
                            <div className="text-center py-4"><Loader2 size={16} className="animate-spin inline text-indigo-400" /></div>
                          ) : history.length === 0 ? (
                            <p className="text-xs text-slate-500 text-center py-2">No history yet</p>
                          ) : (
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {history.map((h, i) => (
                                <div key={i} className="p-2 rounded-lg bg-slate-100 dark:bg-white/3 text-xs">
                                  <div className="text-slate-700 dark:text-slate-300 truncate">{h.original_name || h.filename}</div>
                                  <div className="text-slate-500 mt-0.5">{h.row_count} rows • {h.size_kb} KB</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              )}

              {activeTab === 'gesture' && (
                <div className="space-y-4">
                  <div className="text-xs text-slate-400 mb-2">Camera must be active for gestures to work.</div>
                  {[
                    { icon: '✋', name: 'open_palm', label: 'Open Palm', action: 'FREEZE', desc: 'Freeze the view' },
                    { icon: '👊', name: 'fist', label: 'Fist', action: 'ROTATE', desc: 'Auto-rotate chart' },
                    { icon: '👆', name: 'index_point', label: 'Index Point', action: 'SELECT', desc: 'Select data point' },
                    { icon: '✌️', name: 'peace_zoom_in', label: 'Peace', action: 'ZOOM IN', desc: 'Zoom into chart' },
                    { icon: '🤙', name: 'pinky_thumb', label: 'Pinky+Thumb', action: 'ZOOM OUT', desc: 'Zoom out' },
                    { icon: '👍', name: 'thumbs_up', label: 'Thumbs Up', action: 'NEXT', desc: 'Next chart type' },
                    { icon: '👎', name: 'thumbs_down', label: 'Thumbs Down', action: 'PREV', desc: 'Previous chart' },
                  ].map((g, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                        currentGesture?.gesture === g.name
                          ? 'bg-indigo-500/20 border border-indigo-500/30'
                          : 'bg-slate-100 dark:bg-white/3'
                      }`}
                    >
                      <span className="text-xl">{g.icon}</span>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{g.label}</div>
                        <div className="text-xs text-slate-500">{g.desc}</div>
                      </div>
                      <span className="text-[10px] font-mono text-indigo-500 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">{g.action}</span>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'info' && (
                <div className="space-y-4">
                  {/* Data stats */}
                  {chartData.length > 0 && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="glass rounded-lg p-3 text-center">
                          <div className="text-lg font-bold text-indigo-400">{rowCount}</div>
                          <div className="text-[10px] text-slate-500">Data Points</div>
                        </div>
                        <div className="glass rounded-lg p-3 text-center">
                          <div className="text-lg font-bold text-purple-400">{columns.numeric.length}</div>
                          <div className="text-[10px] text-slate-500">Numeric Cols</div>
                        </div>
                        <div className="glass rounded-lg p-3 text-center">
                          <div className="text-lg font-bold text-orange-600 dark:text-orange-400">{uniqueLabels.length || 0}</div>
                          <div className="text-[10px] text-slate-500">Categories</div>
                        </div>
                        <div className="glass rounded-lg p-3 text-center">
                          <div className="text-lg font-bold text-green-400">{columns.all.length}</div>
                          <div className="text-[10px] text-slate-500">Total Cols</div>
                        </div>
                      </div>

                      {/* Column stats */}
                      {dataStats && (
                        <div>
                          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">Column Statistics</label>
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {Object.entries(dataStats).map(([col, stats]) => (
                              <div key={col} className="p-3 rounded-lg bg-slate-100 dark:bg-white/3">
                                <div className="text-xs font-medium text-indigo-600 dark:text-indigo-300 mb-1">{col}</div>
                                <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-600 dark:text-slate-400">
                                  <span>Min: {stats.min}</span>
                                  <span>Max: {stats.max}</span>
                                  <span>Mean: {stats.mean}</span>
                                  <span>Std: {stats.std}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Legend */}
                      {uniqueLabels.length > 0 && (
                        <div>
                          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">Legend</label>
                          <div className="space-y-1">
                            {uniqueLabels.map((label, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs">
                                <div className="w-3 h-3 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                                <span className="text-slate-600 dark:text-slate-300">{label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* User stats */}
                  <div>
                    <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">Your Stats</label>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-100 dark:bg-white/3 text-xs">
                        <span className="text-slate-500 dark:text-slate-400">Total Sessions</span>
                        <span className="text-slate-800 dark:text-white font-medium">{user?.total_sessions || 0}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-100 dark:bg-white/3 text-xs">
                        <span className="text-slate-500 dark:text-slate-400">Total Gestures</span>
                        <span className="text-slate-800 dark:text-white font-medium">{user?.total_gestures || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Logout */}
            <div className="p-4 border-t border-dark-border">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-all"
                id="logout-btn"
              >
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ─── Main Content ─── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Bar */}
        <header className="flex items-center justify-between px-4 py-3 glass border-b border-dark-border flex-shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors"
              id="toggle-sidebar-btn"
            >
              {showSidebar ? <X size={18} className="text-slate-400" /> : <Menu size={18} className="text-slate-400" />}
            </button>
            <h1 className="text-lg font-semibold gradient-text hidden sm:block">3D Data Explorer</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Chart Type Toggle */}
            <div className="hidden sm:flex items-center bg-slate-100 dark:bg-white/5 rounded-lg p-1 border border-slate-200 dark:border-dark-border">
              {CHART_TYPES.map((type, i) => (
                <button
                  key={type}
                  onClick={() => setChartTypeIndex(i)}
                  className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-all ${
                    chartTypeIndex === i ? 'bg-indigo-500/25 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 font-semibold' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Gesture Status */}
            {currentGesture && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/15 border border-indigo-500/30"
              >
                <Activity size={14} className="text-indigo-400" />
                <span className="text-xs font-medium text-indigo-300">{currentGesture.action}</span>
                <span className="text-[10px] text-indigo-400">{currentGesture.confidence}%</span>
              </motion.div>
            )}

            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${connected ? 'status-online' : 'status-offline'}`} />
              <span className="text-xs text-slate-500 hidden sm:inline">{connected ? 'Connected' : 'Disconnected'}</span>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl border border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-slate-500 bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 transition-all flex items-center justify-center"
              aria-label="Toggle theme"
              id="theme-toggle-btn"
              title="Toggle Theme"
            >
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
            </button>

            {/* AI Insight Toggle */}
            {chartData.length > 0 && (
              <button
                onClick={handleAiInsightClick}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
                  showAiPanel
                    ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-purple-300 hover:border-purple-500/30'
                }`}
                id="ai-insight-toggle-btn"
                title="AI Data Analyst"
              >
                <Sparkles size={14} className={aiLoading ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">{aiLoading ? 'Analyzing...' : 'AI Insight'}</span>
              </button>
            )}

            {/* Generate Report Button */}
            {chartData.length > 0 && (
              <button
                onClick={handleGenerateReport}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all border bg-white/5 border-white/10 text-slate-400 hover:text-orange-300 hover:border-orange-500/30 hover:bg-orange-500/10"
                id="generate-report-btn"
                title="Generate PDF Report"
              >
                <FileDown size={14} />
                <span className="hidden sm:inline">Report</span>
              </button>
            )}

            {/* Camera Toggle */}
            <button
              onClick={toggleCamera}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                cameraOn
                  ? 'bg-red-500/20 border border-red-500/30 text-red-600 dark:text-red-300 hover:bg-red-500/30'
                  : 'bg-green-500/15 border border-green-500/30 text-green-600 dark:text-green-300 hover:bg-green-500/25'
              }`}
              id="camera-toggle-btn"
            >
              {cameraOn ? <CameraOff size={16} /> : <Camera size={16} />}
              <span className="hidden sm:inline">{cameraOn ? 'Stop Camera' : 'Start Camera'}</span>
            </button>
          </div>
        </header>

        {/* Main Area */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* 3D Canvas / Empty State */}
          <div className="flex-1 relative">
            {chartData.length > 0 ? (
              <Canvas
                camera={{ position: [8, 6, 8], fov: 55, near: 0.1, far: 100 }}
                dpr={[1, 1.5]}
                gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
                style={{ background: 'linear-gradient(180deg, var(--bg-default) 0%, var(--bg-card) 100%)' }}
              >
                <Suspense fallback={null}>
                  {CHART_TYPES[chartTypeIndex] === 'scatter' ? (
                    <ScatterPlot data={filteredPoints} ranges={axisRanges} gestureAction={gestureAction} />
                  ) : (
                    <BarChart3D data={filteredPoints} ranges={axisRanges} gestureAction={gestureAction} />
                  )}
                </Suspense>
              </Canvas>
            ) : (
              <div className="h-full flex flex-col items-center justify-center px-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center max-w-md"
                >
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 flex items-center justify-center mx-auto mb-6 animate-float">
                    <BarChart3 size={36} className="text-indigo-500 dark:text-indigo-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-3">No Data Loaded</h2>
                  <p className="text-slate-600 dark:text-slate-400 mb-8">
                    Upload a CSV file or load a sample dataset to start exploring your data in 3D.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-primary flex items-center justify-center gap-2"
                      id="empty-upload-btn"
                    >
                      <Upload size={18} /> Upload CSV
                    </button>
                    {samples.length > 0 && (
                      <button
                        onClick={() => loadSample(samples[0].name)}
                        className="btn-secondary flex items-center justify-center gap-2"
                        id="empty-sample-btn"
                      >
                        <Database size={18} /> Load Sample
                      </button>
                    )}
                  </div>
                </motion.div>
              </div>
            )}

            {/* ── AI Insight Panel ─────────────────────────────────────────── */}
            <AnimatePresence>
              {showAiPanel && (
                <motion.div
                  initial={{ opacity: 0, y: -20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0,   scale: 1    }}
                  exit={{    opacity: 0, y: -20, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                  className="absolute top-4 left-4 right-4 z-20 pointer-events-auto flex justify-center"
                  id="ai-insight-panel"
                >
                  <div className="w-full max-w-2xl">
                  {/* Glowing border wrapper */}
                  <div className="relative rounded-2xl p-[1px] bg-gradient-to-br from-purple-500/50 via-indigo-500/30 to-transparent shadow-2xl shadow-purple-900/30">
                    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--ai-panel-bg)', backdropFilter: 'blur(24px)' }}>

                      {/* Header */}
                      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(99,102,241,0.08))' }}>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #8B5CF6, #6366F1)' }}>
                            <Sparkles size={14} className="text-white" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">AI Data Analyst</div>
                            <div className="text-[10px] leading-tight" style={{ color: aiInsight?.source === 'gemini' ? (theme === 'light' ? '#7c3aed' : '#a78bfa') : '#64748b' }}>
                              {aiLoading ? 'Analyzing dataset...' :
                               aiInsight?.source === 'gemini'   ? '✨ Powered by Gemini 1.5 Flash' :
                               aiInsight?.source === 'rule-based'? '⚡ Deep Data Analysis' : '💡 Insight'}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setShowAiPanel(false)
                            if (window.speechSynthesis) window.speechSynthesis.cancel()
                          }}
                          className="p-1.5 rounded-lg transition-colors hover:bg-white/10 flex-shrink-0"
                        >
                          <X size={14} className="text-slate-400" />
                        </button>
                      </div>

                      {/* Body */}
                      <div className="px-5 py-4 max-h-72 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(139,92,246,0.3) transparent' }}>
                        {aiLoading ? (
                          <div className="flex items-start gap-3">
                            <Bot size={16} className="text-purple-400 mt-0.5 flex-shrink-0 animate-pulse" />
                            <div className="space-y-2.5 flex-1 pt-0.5">
                              <div className="h-2.5 rounded-full animate-pulse" style={{ background: 'rgba(139,92,246,0.25)', width: '100%' }} />
                              <div className="h-2.5 rounded-full animate-pulse" style={{ background: 'rgba(139,92,246,0.18)', width: '90%' }} />
                              <div className="h-2.5 rounded-full animate-pulse" style={{ background: 'rgba(139,92,246,0.15)', width: '75%' }} />
                              <div className="h-2.5 rounded-full animate-pulse" style={{ background: 'rgba(139,92,246,0.12)', width: '85%' }} />
                              <div className="h-2.5 rounded-full animate-pulse" style={{ background: 'rgba(139,92,246,0.08)', width: '60%' }} />
                              <div className="text-[10px] mt-2" style={{ color: 'rgba(167,139,250,0.6)' }}>Analyzing data patterns, correlations, and trends...</div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {(aiTypedText || '').split('\n\n').map((paragraph, pi) => {
                              if (!paragraph.trim()) return null
                              // Split paragraph into lines
                              const lines = paragraph.split('\n').filter(l => l.trim())
                              return (
                                <div key={pi} className="mb-2">
                                  {lines.map((line, li) => {
                                    // Render inline **bold** markers
                                    const parts = line.split(/\*\*(.*?)\*\*/g)
                                    const hasMarkup = parts.length > 1
                                    return (
                                      <p key={li} className={`text-sm leading-relaxed ${li > 0 ? 'mt-1' : ''}`} style={{ color: 'var(--ai-panel-text)' }}>
                                        {hasMarkup
                                          ? parts.map((part, xi) =>
                                              xi % 2 === 1
                                                ? <strong key={xi} style={{ color: '#a78bfa' }}>{part}</strong>
                                                : <span key={xi}>{part}</span>
                                            )
                                          : line
                                        }
                                      </p>
                                    )
                                  })}
                                </div>
                              )
                            })}
                            {aiTypedText.length < (aiInsight?.text?.length || 0) && (
                              <span className="inline-block w-0.5 h-4 ml-0.5 align-middle rounded-sm animate-pulse" style={{ background: '#a78bfa' }} />
                            )}
                          </div>

                        )}
                      </div>

                      {/* Footer shimmer bar */}
                      {!aiLoading && aiInsight && (
                        <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.5), transparent)' }} />
                      )}
                    </div>
                  </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Data Preview Overlay */}
            {dataPreview.length > 0 && (
              <div className="absolute bottom-4 left-4 right-4 max-w-2xl">
                <details className="glass rounded-xl overflow-hidden">
                  <summary className="px-4 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-2">
                    <Eye size={14} /> Data Preview (first 5 rows)
                  </summary>
                  <div className="overflow-x-auto max-h-48">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-dark-border">
                          {Object.keys(dataPreview[0] || {}).map(k => (
                            <th key={k} className="px-3 py-2 text-left text-slate-500 font-medium whitespace-nowrap">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dataPreview.map((row, i) => (
                          <tr key={i} className="border-b border-slate-200 dark:border-dark-border/50 hover:bg-slate-100 dark:hover:bg-white/3">
                            {Object.values(row).map((v, j) => (
                              <td key={j} className="px-3 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">{String(v)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            )}
          </div>

          {/* ── Browser-side Gesture Camera Panel ── */}
          <AnimatePresence>
            {cameraOn && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 320, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="flex-shrink-0 border-l border-dark-border flex flex-col overflow-hidden"
              >
                <div className="p-3 border-b border-dark-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full status-online" />
                    <span className="text-xs font-medium text-slate-400">Gesture Camera</span>
                  </div>
                  <span className="text-[10px] text-green-400 font-mono">LIVE ✦ LOCAL</span>
                </div>
                <div className="p-3 flex-1 flex flex-col gap-3">
                  {/* GestureCamera: browser webcam + MediaPipe JS */}
                  <div className="camera-feed rounded-lg overflow-hidden aspect-[4/3]">
                    <GestureCamera
                      active={cameraOn}
                      userId={user?.id || 'anonymous'}
                      onGestureDetected={handleGestureDetected}
                    />
                  </div>

                  {/* Current Gesture Display */}
                  {currentGesture ? (
                    <div className="glass rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Gesture</span>
                        <span className="text-sm font-semibold text-indigo-300">{currentGesture.gesture}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Confidence</span>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-dark-border rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-400 rounded-full transition-all" style={{ width: `${currentGesture.confidence}%` }} />
                          </div>
                          <span className="text-xs text-indigo-300">{currentGesture.confidence}%</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Action</span>
                        <span className="text-xs font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">{currentGesture.action}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="glass rounded-xl p-3 text-center">
                      <Hand size={20} className="text-slate-500 mx-auto mb-1" />
                      <p className="text-[10px] text-slate-500">Show a hand gesture to the camera</p>
                      <p className="text-[10px] text-slate-600 mt-1">Runs entirely in your browser ✦ No server needed</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
            {/* ── Chatbot Panel Overlay ── */}
            {chartData.length > 0 && (
              <div className="absolute bottom-6 right-6 z-30">
                <button
                  onClick={() => {
                    setIsChatOpen(!isChatOpen)
                    if (isChatOpen && window.speechSynthesis) window.speechSynthesis.cancel()
                  }}
                  className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg border transition-all ${
                    isChatOpen
                      ? 'bg-red-500/20 border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/30'
                      : 'bg-gradient-to-tr from-purple-600 to-indigo-600 border-indigo-400/30 text-white hover:scale-105 hover:shadow-indigo-500/30 animate-pulse-slow'
                  }`}
                  id="chatbot-toggle-btn"
                  title="Talk to Your Data Chatbot"
                >
                  {isChatOpen ? <X size={24} /> : <MessageSquare size={24} />}
                </button>
              </div>
            )}

            <AnimatePresence>
              {isChatOpen && chartData.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 50, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 50, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  className="absolute bottom-24 right-6 w-96 h-[460px] z-30 flex flex-col rounded-2xl overflow-hidden glass border border-white/10 shadow-2xl"
                  id="chatbot-panel"
                >
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-purple-500/10 to-indigo-500/10">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white">
                        <Bot size={12} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-800 dark:text-white">Data Analyst Chatbot</div>
                        <div className="text-[9px] text-slate-500 dark:text-slate-400">Ask questions or filter in real time</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          const initialMsgs = [
                            { sender: 'bot', text: 'Hello! I am your AI Data Assistant. Ask me anything about your dataset, or click the mic to speak!', timestamp: new Date() }
                          ]
                          if (chartData.length > 0 && columns.all.length > 0) {
                            let examplesText = "Here are some examples you can try with this dataset:\n\n"
                            if (columns.numeric.length > 0) {
                              examplesText += `* **"average ${columns.numeric[0]}"** or **"max ${columns.numeric[0]}"**\n`
                              const meanVal = dataStats?.[columns.numeric[0]]?.mean || 30
                              examplesText += `* **"${columns.numeric[0]} > ${meanVal.toFixed(0)}"**\n`
                            }
                            if (columns.numeric.length > 1) {
                              const meanVal2 = dataStats?.[columns.numeric[1]]?.mean || 50
                              examplesText += `* **"less than ${meanVal2.toFixed(0)} ${columns.numeric[1]}"**\n`
                            }
                            if (columns.categorical.length > 0 && uniqueLabels.length > 0) {
                              examplesText += `* **"filter for ${columns.categorical[0]} ${uniqueLabels[0]}"**\n`
                            }
                            examplesText += `\n**Voice Commands to Control 3D Canvas:**\n`
                            examplesText += `* **"rotate"** or **"spin"** (start rotating visual)\n`
                            examplesText += `* **"zoom in"** or **"zoom out"** (zoom canvas)\n`
                            examplesText += `* **"stop"** or **"freeze"** (stop rotation)\n`
                            examplesText += `* **"bar chart"** or **"scatter plot"** (switch chart types)\n`
                            examplesText += `* **"reset"** (to show all data)`
                            initialMsgs.push({
                              sender: 'bot',
                              text: examplesText,
                              timestamp: new Date()
                            })
                          }
                          setChatMessages(initialMsgs)
                          setFilteredPoints(chartData)
                          toast.success("Chat history cleared.")
                        }}
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                        title="Clear chat history and reset filters"
                      >
                        <Trash2 size={13} />
                      </button>
                      <button
                        onClick={() => {
                          setIsChatOpen(false)
                          if (window.speechSynthesis) window.speechSynthesis.cancel()
                        }}
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Message Log */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ scrollbarWidth: 'thin' }}>
                    {chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                            msg.sender === 'user'
                              ? 'bg-indigo-600 text-white rounded-br-none'
                              : 'bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-slate-200 border border-slate-200/50 dark:border-white/5 rounded-bl-none'
                          }`}
                        >
                          <div className="whitespace-pre-line">{msg.text}</div>
                          {msg.actionType && msg.actionType !== 'answer' && (
                            <span className="inline-block mt-1 text-[9px] font-mono text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded uppercase">
                              {msg.actionType}
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] text-slate-500 mt-1 px-1">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                    {isChatAnalyzing && (
                      <div className="flex items-start gap-2">
                        <Bot size={14} className="text-purple-600 dark:text-purple-400 mt-1 animate-pulse" />
                        <div className="bg-slate-100 dark:bg-white/5 rounded-2xl rounded-bl-none px-3.5 py-2 text-xs text-slate-600 dark:text-slate-400 border border-slate-200/50 dark:border-white/5">
                          <span className="animate-pulse">Analyzing dataset...</span>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Form Input */}
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                    className="p-3 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/2 flex items-center gap-2"
                  >
                    <button
                      type="button"
                      onClick={toggleSpeechRecognition}
                      className={`p-2 rounded-xl flex items-center justify-center transition-all ${
                        isListening
                          ? 'bg-red-500/20 border border-red-500/30 text-red-600 dark:text-red-400 animate-pulse'
                          : 'bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                      title={isListening ? "Listening... click to stop" : "Click to speak"}
                    >
                      {isListening ? <MicOff size={15} /> : <Mic size={15} />}
                    </button>
                    {isListening ? (
                      <div className="flex-1 flex items-center justify-between border border-red-500/20 rounded-xl px-3 py-1.5 bg-red-500/5 text-xs text-red-600 dark:text-red-400">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                          </span>
                          <span className="animate-pulse font-medium">Listening... ask your data</span>
                        </div>
                        {/* Animated equalizer waves */}
                        <div className="flex items-end gap-[2px] h-4 px-1 pb-[1px]">
                          <span className="w-[3px] h-3 bg-red-500 rounded-full animate-equalizer [animation-delay:0.1s]" />
                          <span className="w-[3px] h-5 bg-red-500 rounded-full animate-equalizer [animation-delay:0.3s]" />
                          <span className="w-[3px] h-4 bg-red-500 rounded-full animate-equalizer [animation-delay:0.5s]" />
                          <span className="w-[3px] h-2 bg-red-500 rounded-full animate-equalizer [animation-delay:0.2s]" />
                          <span className="w-[3px] h-4 bg-red-500 rounded-full animate-equalizer [animation-delay:0.4s]" />
                        </div>
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Ask your data..."
                        className="flex-1 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500/40 bg-slate-50 dark:bg-dark-default text-slate-800 dark:text-slate-100"
                        disabled={isChatAnalyzing}
                      />
                    )}
                    <button
                      type="submit"
                      disabled={isChatAnalyzing || !chatInput.trim() || isListening}
                      className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white flex items-center justify-center transition-colors"
                    >
                      <Send size={14} />
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
  )
}
