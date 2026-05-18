import React, { useState, useRef, useEffect } from 'react'
import styles from './Capture.module.css'

const Capture: React.FC = () => {
  const [isSelecting, setIsSelecting] = useState(false)
  const [startPos, setStartPos] = useState({ x: 0, y: 0 })
  const [endPos, setEndPos] = useState({ x: 0, y: 0 })
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 })
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = viewport.width * dpr
    canvas.height = viewport.height * dpr
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const draw = () => {
      ctx.clearRect(0, 0, viewport.width, viewport.height)
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.fillRect(0, 0, viewport.width, viewport.height)

      if (isSelecting) {
        const x = Math.min(startPos.x, endPos.x)
        const y = Math.min(startPos.y, endPos.y)
        const w = Math.abs(startPos.x - endPos.x)
        const h = Math.abs(startPos.y - endPos.y)

        ctx.clearRect(x, y, w, h)
        
        ctx.strokeStyle = '#0078d7'
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, w, h)
        
        ctx.fillStyle = '#0078d7'
        ctx.font = '12px sans-serif'
        ctx.fillText(`${w} × ${h}`, x + w + 8, y + h + 16)
      }
      
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cursorPos.x - 10, cursorPos.y)
      ctx.lineTo(cursorPos.x + 10, cursorPos.y)
      ctx.moveTo(cursorPos.x, cursorPos.y - 10)
      ctx.lineTo(cursorPos.x, cursorPos.y + 10)
      ctx.stroke()
    }

    draw()
  }, [isSelecting, startPos, endPos, cursorPos, viewport])

  useEffect(() => {
    const prevBackground = document.body.style.background
    const prevMargin = document.body.style.margin
    const prevCursor = document.body.style.cursor
    const prevUserSelect = document.body.style.userSelect
    document.body.style.background = 'transparent'
    document.body.style.margin = '0'
    document.body.style.cursor = 'crosshair'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.background = prevBackground
      document.body.style.margin = prevMargin
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevUserSelect
    }
  }, [])

  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    const rafId = requestAnimationFrame(updateViewport)
    window.addEventListener('resize', updateViewport)
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', updateViewport)
    }
  }, [])

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsSelecting(true)
    setStartPos({ x: e.clientX, y: e.clientY })
    setEndPos({ x: e.clientX, y: e.clientY })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isSelecting) {
      setEndPos({ x: e.clientX, y: e.clientY })
    }
    setCursorPos({ x: e.clientX, y: e.clientY })
  }

  const handleMouseUp = async () => {
    if (isSelecting) {
      setIsSelecting(false)
      const x = Math.min(startPos.x, endPos.x)
      const y = Math.min(startPos.y, endPos.y)
      const w = Math.abs(startPos.x - endPos.x)
      const h = Math.abs(startPos.y - endPos.y)

      if (w > 5 && h > 5) {
        const api = (window as any).api
        if (api) {
          const result = await api.doCapture({ x, y, w, h })
          if (result) {
            // We can still send it via event if needed, but App.tsx will now handle the loop
            // For now, let's trigger the event manually so App.tsx onCaptureImage still works
            // or just let App.tsx handle it. 
            // Wait, App.tsx needs to know it's a NEW manual capture to start the loop.
            window.dispatchEvent(new CustomEvent('manual-capture', { detail: result }))
          }
        }
      }
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      const api = (window as any).api
      if (api) {
        api.closeCapture()
      }
    }
  }

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className={styles.captureCanvas}
    />
  )
}

export default Capture
