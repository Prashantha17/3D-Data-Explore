/**
 * GestureCamera.jsx
 * Browser-side gesture detection using MediaPipe Hands JS.
 * Replaces the Python backend camera_worker + GestureEngine entirely.
 *
 * Features:
 *  - getUserMedia() to access the user's webcam locally
 *  - MediaPipe Hands (JS) for 21-landmark detection
 *  - Full port of gesture_engine.py classifier (open_palm, fist, thumbs_up/down,
 *    index_point, peace_zoom_in, pinky_thumb)
 *  - Adaptive per-gesture buffer (N consecutive frames before confirming)
 *  - Per-gesture cooldown timers
 *  - Canvas HUD overlay with finger-state bars + confidence bar
 *  - Emits gesture_event via SocketIO so backend can log to MongoDB
 *  - Calls onGestureDetected(result) prop so Dashboard updates immediately
 */

import { useEffect, useRef, useCallback } from 'react'
import * as mpHands from '@mediapipe/hands'
import * as mpDrawing from '@mediapipe/drawing_utils'
import { useSocket } from '../context/SocketContext'

// Safe bundler / window resolver for MediaPipe classes and functions
const HandsClass = mpHands.Hands || mpHands.default?.Hands || (typeof mpHands.default === 'function' ? mpHands.default : null) || window.Hands
const HAND_CONNECTIONS_VAL = mpHands.HAND_CONNECTIONS || mpHands.default?.HAND_CONNECTIONS || window.HAND_CONNECTIONS
const drawConnectorsFunc = mpDrawing.drawConnectors || mpDrawing.default?.drawConnectors || window.drawConnectors
const drawLandmarksFunc = mpDrawing.drawLandmarks || mpDrawing.default?.drawLandmarks || window.drawLandmarks

// ─── Landmark indices (same as Python) ──────────────────────────────────────
const WRIST       = 0
const THUMB_MCP   = 2;  const THUMB_IP  = 3;  const THUMB_TIP  = 4
const INDEX_MCP   = 5;  const INDEX_PIP = 6;  const INDEX_TIP  = 8
const MIDDLE_MCP  = 9;  const MIDDLE_TIP = 12
const RING_MCP    = 13; const RING_TIP   = 16
const PINKY_MCP   = 17; const PINKY_TIP  = 20

// ─── Per-gesture buffer sizes ───────────────────────────────────────────────
const GESTURE_BUFFERS = {
  open_palm:     4,
  fist:          4,
  thumbs_up:     5,
  thumbs_down:   5,
  index_point:   4,
  peace_zoom_in: 4,
  pinky_thumb:   5,
}

// ─── Per-action cooldown (ms) ───────────────────────────────────────────────
const GESTURE_COOLDOWNS = {
  FREEZE:       1200,
  ROTATE:       1200,
  NEXT:          800,
  PREV:          800,
  ZOOM_IN:       600,
  ZOOM_OUT:      600,
  SELECT_POINT: 1000,
}

const ACTION_MAP = {
  open_palm:     'FREEZE',
  fist:          'ROTATE',
  index_point:   'SELECT_POINT',
  peace_zoom_in: 'ZOOM_IN',
  pinky_thumb:   'ZOOM_OUT',
  thumbs_up:     'NEXT',
  thumbs_down:   'PREV',
}

// ─── Math helpers ────────────────────────────────────────────────────────────
function dist3(a, b) {
  return Math.sqrt(
    (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2
  )
}

// ─── Gesture classification (ported from gesture_engine.py) ─────────────────
function getFingerStates(lm) {
  const palmSize = dist3(lm[WRIST], lm[MIDDLE_MCP]) + 1e-6
  const pairs = [
    [INDEX_TIP,  INDEX_MCP,  INDEX_PIP - 2],   // INDEX_PIP=6 → pip_idx=6
    [MIDDLE_TIP, MIDDLE_MCP, 10],
    [RING_TIP,   RING_MCP,   14],
    [PINKY_TIP,  PINKY_MCP,  18],
  ]
  // Override pip indices to match Python: tip - 2
  const pipMap = { [INDEX_TIP]: 6, [MIDDLE_TIP]: 10, [RING_TIP]: 14, [PINKY_TIP]: 18 }

  return pairs.map(([tip, mcp]) => {
    const pipIdx = pipMap[tip]
    const tipToMcp    = dist3(lm[tip], lm[mcp])
    const tipToWrist  = dist3(lm[tip], lm[WRIST])
    const pipToWrist  = dist3(lm[pipIdx], lm[WRIST])
    const extended = (tipToMcp / palmSize > 0.65) && (tipToWrist > pipToWrist * 0.95)
    return extended
  })
}

function getThumbState(lm) {
  const palmSize        = dist3(lm[WRIST], lm[MIDDLE_MCP]) + 1e-6
  const thumbExtension  = dist3(lm[THUMB_TIP], lm[INDEX_MCP]) / palmSize
  const verticalOffset  = (lm[THUMB_MCP].y - lm[THUMB_TIP].y) / palmSize
  const horizontalOffset = Math.abs(lm[THUMB_TIP].x - lm[INDEX_MCP].x) / palmSize

  const thumbIsUp   = verticalOffset >  0.4 && thumbExtension > 0.50
  const thumbIsDown = verticalOffset < -0.4 && thumbExtension > 0.50
  const thumbIsOpen = horizontalOffset > 0.35 || thumbExtension > 0.65
  return { thumbIsUp, thumbIsDown, thumbIsOpen }
}

function classifyGesture(lm) {
  const fingers = getFingerStates(lm)
  const [index, middle, ring, pinky] = fingers
  const { thumbIsUp, thumbIsDown, thumbIsOpen } = getThumbState(lm)
  const fingersExtended = fingers.filter(Boolean).length
  const palmSize = dist3(lm[WRIST], lm[MIDDLE_MCP]) + 1e-6

  // Open Palm
  if (fingersExtended >= 4) {
    const conf = 0.90 + 0.05 * ((thumbIsOpen || thumbIsUp) ? 1 : 0)
    return { gesture: 'open_palm', confidence: Math.min(conf, 0.97) }
  }

  // Fist / Thumbs
  if (fingersExtended === 0) {
    if (thumbIsUp) {
      const boost = lm[THUMB_TIP].y < lm[INDEX_MCP].y - 0.05 * palmSize ? 0.94 : 0.88
      return { gesture: 'thumbs_up', confidence: boost }
    }
    if (thumbIsDown) {
      const boost = lm[THUMB_TIP].y > lm[PINKY_MCP].y + 0.02 * palmSize ? 0.93 : 0.87
      return { gesture: 'thumbs_down', confidence: boost }
    }
    const tipCluster = [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP].filter(
      t => dist3(lm[t], lm[WRIST]) / palmSize < 1.2
    ).length
    return { gesture: 'fist', confidence: 0.88 + 0.03 * (tipCluster >= 3 ? 1 : 0) }
  }

  // Peace / Zoom In
  if (index && middle && !ring && !pinky) {
    const spread = dist3(lm[INDEX_TIP], lm[MIDDLE_TIP]) / palmSize
    return { gesture: 'peace_zoom_in', confidence: Math.min(0.90 + 0.06 * spread, 0.97) }
  }

  // Index Point
  if (index && !middle && !ring && !pinky) {
    const idxExt = dist3(lm[INDEX_TIP], lm[INDEX_MCP]) / palmSize
    return { gesture: 'index_point', confidence: Math.max(0.88 + 0.08 * (idxExt - 0.6), 0.88) }
  }

  // Pinky + Thumb (Shaka / Zoom Out)
  if (pinky && !index && !middle && !ring) {
    const thumbToWrist = dist3(lm[THUMB_TIP], lm[WRIST]) / palmSize
    const { thumbIsOpen: tOpen } = getThumbState(lm)
    const thumbExtended = thumbToWrist > 0.55 || tOpen
    if (thumbExtended) {
      const spread = dist3(lm[PINKY_TIP], lm[THUMB_TIP]) / palmSize
      return { gesture: 'pinky_thumb', confidence: Math.max(0.88 + 0.07 * (spread - 0.6), 0.88) }
    }
    return { gesture: 'pinky_thumb', confidence: 0.82 }
  }

  return { gesture: 'unknown', confidence: 0.0 }
}

// ─── Draw HUD on canvas ──────────────────────────────────────────────────────
function drawHUD(ctx, w, h, rawGesture, rawConf, fingerStates, bufferLen, bufferRequired) {
  // Dark header bar
  ctx.fillStyle = 'rgba(8,10,20,0.75)'
  ctx.fillRect(0, 0, w, 75)

  // Confidence color
  let color = rawConf >= 0.85 ? '#00DC64' : rawConf >= 0.70 ? '#FFB400' : '#6060C8'

  // Gesture label
  ctx.fillStyle = color
  ctx.font = 'bold 14px monospace'
  ctx.fillText(`${rawGesture.replace(/_/g, ' ').toUpperCase()}  ${Math.round(rawConf * 100)}%`, 12, 26)

  // Finger state bars (I M R P)
  const labels = ['I', 'M', 'R', 'P']
  fingerStates.forEach((ext, i) => {
    const bx = w - 115 + i * 26
    ctx.fillStyle = 'rgba(30,30,40,1)'
    ctx.fillRect(bx, 10, 18, 55)
    const fillH = ext ? 55 : 15
    ctx.fillStyle = ext ? '#00DC64' : 'rgba(80,40,40,1)'
    ctx.fillRect(bx, 65 - fillH, 18, fillH)
    ctx.fillStyle = 'rgba(180,180,180,1)'
    ctx.font = '10px monospace'
    ctx.fillText(labels[i], bx + 4, 8)
  })

  // Buffer progress dots
  for (let i = 0; i < bufferRequired; i++) {
    ctx.beginPath()
    ctx.arc(w - 145 + i * 16, 72, 5, 0, Math.PI * 2)
    ctx.fillStyle = i < bufferLen ? '#00DC64' : 'rgba(45,45,55,1)'
    ctx.fill()
  }

  // Confidence bar
  ctx.fillStyle = 'rgba(30,30,40,1)'
  ctx.fillRect(10, 68, w - 20, 3)
  ctx.fillStyle = color
  ctx.fillRect(10, 68, Math.round((w - 20) * rawConf), 3)
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function GestureCamera({ active, userId, onGestureDetected }) {
  const videoRef      = useRef(null)
  const canvasRef     = useRef(null)
  const streamRef     = useRef(null)
  const handsRef      = useRef(null)
  const animFrameRef  = useRef(null)
  const mountedRef    = useRef(true)   // tracks if component is still mounted
  const startingRef   = useRef(false)  // prevents duplicate startCamera calls
  const stateRef      = useRef({
    gestureBuffer:    [],
    lastTriggered:    '',
    lastTriggerTime:  0,
    fingerStates:     [false, false, false, false],
  })
  const { emit } = useSocket()

  // ── Apply buffer filter ────────────────────────────────────────────────────
  const applyFilter = useCallback((gesture, confidence) => {
    const s = stateRef.current
    const CONF_THRESHOLD = 0.80

    if (confidence < CONF_THRESHOLD || gesture === 'unknown') {
      s.gestureBuffer = []
      return null
    }

    s.gestureBuffer.push(gesture)
    const required = GESTURE_BUFFERS[gesture] || 5
    if (s.gestureBuffer.length > required) {
      s.gestureBuffer = s.gestureBuffer.slice(-required)
    }

    if (
      s.gestureBuffer.length === required &&
      new Set(s.gestureBuffer).size === 1
    ) {
      const action   = ACTION_MAP[gesture] || 'NONE'
      const cooldown = GESTURE_COOLDOWNS[action] || 1000
      const now      = Date.now()
      if (gesture === s.lastTriggered && (now - s.lastTriggerTime) < cooldown) {
        return null
      }
      s.lastTriggered   = gesture
      s.lastTriggerTime = now
      s.gestureBuffer   = []
      return { gesture, confidence, action, timestamp: now / 1000 }
    }
    return null
  }, [])

  // ── MediaPipe results callback ─────────────────────────────────────────────
  const onResults = useCallback((results) => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    canvas.width  = video.videoWidth  || 640
    canvas.height = video.videoHeight || 480
    const { width: w, height: h } = canvas

    // Mirror + draw video
    ctx.save()
    ctx.scale(-1, 1)
    ctx.drawImage(video, -w, 0, w, h)
    ctx.restore()

    let rawGesture = 'none'
    let rawConf    = 0.0

    if (results.multiHandLandmarks?.length) {
      const lm = results.multiHandLandmarks[0]

      // Draw landmarks
      if (drawConnectorsFunc && HAND_CONNECTIONS_VAL) {
        drawConnectorsFunc(ctx, lm, HAND_CONNECTIONS_VAL, { color: '#667EEA', lineWidth: 2 })
      }
      if (drawLandmarksFunc) {
        drawLandmarksFunc(ctx, lm, { color: '#764BA2', lineWidth: 1, radius: 3 })
      }

      // Classify
      const { gesture, confidence } = classifyGesture(lm)
      rawGesture = gesture
      rawConf    = confidence

      // Update finger states for HUD
      stateRef.current.fingerStates = getFingerStates(lm)

      // Apply buffer filter
      const confirmed = applyFilter(gesture, confidence)
      if (confirmed) {
        const result = {
          gesture:    confirmed.gesture,
          confidence: Math.round(confirmed.confidence * 100 * 10) / 10,
          action:     confirmed.action,
          timestamp:  confirmed.timestamp,
        }
        // Notify Dashboard (immediate local update)
        onGestureDetected?.(result)
        // Send to backend for MongoDB logging
        emit('gesture_event', { user_id: userId, ...result })
      }
    } else {
      stateRef.current.gestureBuffer  = []
      stateRef.current.fingerStates   = [false, false, false, false]
    }

    // Draw HUD
    const s = stateRef.current
    drawHUD(
      ctx, w, h,
      rawGesture, rawConf,
      s.fingerStates,
      s.gestureBuffer.length,
      GESTURE_BUFFERS[rawGesture] || 5
    )
  }, [applyFilter, emit, onGestureDetected, userId])

  // ── Start camera ───────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    // Prevent duplicate concurrent starts
    if (startingRef.current || streamRef.current) return
    startingRef.current = true

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user', frameRate: { ideal: 30 } },
        audio: false,
      })

      // Bail if component was unmounted or deactivated while awaiting getUserMedia
      if (!mountedRef.current) {
        stream.getTracks().forEach(t => t.stop())
        return
      }

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream

        // ─── Wait for metadata before play() ─────────────────────────────
        // This prevents "play() interrupted by new load request" AbortError
        await new Promise((resolve) => {
          if (videoRef.current.readyState >= 1) {
            resolve()
          } else {
            videoRef.current.onloadedmetadata = resolve
          }
        })

        // Guard: component may have stopped while we waited for metadata
        if (!mountedRef.current || !streamRef.current) return

        try {
          await videoRef.current.play()
        } catch (playErr) {
          // AbortError is harmless — means stop() was called before play finished
          if (playErr.name !== 'AbortError') throw playErr
          return
        }
      }

      const HandsConstructor = HandsClass || window.Hands
      if (!HandsConstructor) {
        throw new Error('MediaPipe Hands library is loading or blocked by browser extensions. Please refresh.')
      }

      const hands = new HandsConstructor({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      })
      hands.setOptions({
        maxNumHands:            1,
        modelComplexity:        1,
        minDetectionConfidence: 0.75,
        minTrackingConfidence:  0.75,
      })
      hands.onResults(onResults)
      handsRef.current = hands

      // Processing loop — guarded so it stops cleanly on unmount/stop
      let warmup = 0
      const process = async () => {
        if (!streamRef.current || !mountedRef.current) return
        if (videoRef.current?.readyState === 4) {
          if (warmup < 5) { warmup++; animFrameRef.current = requestAnimationFrame(process); return }
          try {
            await handsRef.current?.send({ image: videoRef.current })
          } catch (_) { /* hands may be closed during stop */ }
        }
        animFrameRef.current = requestAnimationFrame(process)
      }
      animFrameRef.current = requestAnimationFrame(process)
    } catch (err) {
      if (!mountedRef.current) return  // Ignore errors after unmount
      console.error('Camera error:', err)
      onGestureDetected?.({ error: 'Camera access denied or unavailable: ' + err.message })
    } finally {
      startingRef.current = false
    }
  }, [onResults, onGestureDetected])


  // ── Stop camera ────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current)
    handsRef.current?.close()
    handsRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    stateRef.current.gestureBuffer  = []
    stateRef.current.lastTriggered  = ''
    stateRef.current.lastTriggerTime = 0
    stateRef.current.fingerStates   = [false, false, false, false]
    // Clear canvas
    const canvas = canvasRef.current
    if (canvas) {
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [])

  // ── React to active prop ───────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (active) {
      startCamera()
    } else {
      stopCamera()
    }
    return () => stopCamera()
  }, [active, startCamera, stopCamera])

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
      {/* Hidden video element — feed for MediaPipe */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none"
        playsInline
        muted
      />
      {/* Canvas with mirrored video + landmark overlay + HUD */}
      <canvas
        ref={canvasRef}
        className="w-full h-full object-cover"
      />
    </div>
  )
}
