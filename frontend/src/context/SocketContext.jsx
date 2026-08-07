import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { io } from 'socket.io-client'

const SocketContext = createContext(null)

export function SocketProvider({ children }) {
  const socketRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Lazy connection: only connect when initSocket() is called (e.g., on dashboard mount)
  const initSocket = useCallback(() => {
    if (socketRef.current) return // Already initialized

    const targetUrl = import.meta.env.VITE_API_URL || window.location.origin
    const socket = io(targetUrl, {
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      autoConnect: true,
      upgrade: true,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      console.log('✅ Socket connected, transport:', socket.io.engine?.transport?.name)
    })
    socket.on('disconnect', (reason) => {
      setConnected(false)
      console.log('🔌 Socket disconnected, reason:', reason)
    })
    socket.on('connect_error', (err) => {
      console.warn('⚠️ Socket connect error:', err.message)
      setConnected(false)
    })
    socket.io.on('reconnect', (attempt) => {
      console.log('🔄 Socket reconnected after', attempt, 'attempts')
      setConnected(true)
    })
    socket.io.on('reconnect_error', (err) => {
      console.warn('🔄 Socket reconnect error:', err.message)
    })

    setInitialized(true)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.removeAllListeners()
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [])

  const emit = useCallback((event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data)
    } else {
      console.warn('Socket not connected, cannot emit:', event)
    }
  }, [])

  // Safe on() — registers listener and returns cleanup fn
  const on = useCallback((event, handler) => {
    if (!socketRef.current) return () => {}
    socketRef.current.on(event, handler)
    return () => {
      if (socketRef.current) socketRef.current.off(event, handler)
    }
  }, [])

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners()
      socketRef.current.disconnect()
      socketRef.current = null
      setConnected(false)
      setInitialized(false)
    }
  }, [])

  return (
    <SocketContext.Provider value={{
      socketRef,       // expose ref so consumers can access current socket
      connected,
      initialized,
      initSocket,
      disconnectSocket,
      emit,
      on,
    }}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error('useSocket must be used within SocketProvider')
  return ctx
}