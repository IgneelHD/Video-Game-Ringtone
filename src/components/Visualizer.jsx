import { useEffect, useRef } from 'react'

const BARS = 28

// Live frequency bars in the card's tone color. Bars left of the playhead are
// fully colored and the rest are faded, so it doubles as the progress bar:
// press and drag on it (mouse or touch) to scrub, or use the arrow keys.
export default function Visualizer({ analyser, progress, onSeek, label }) {
  const canvas = useRef(null)
  const dragging = useRef(false)
  const progressRef = useRef(progress)
  progressRef.current = progress

  useEffect(() => {
    const el = canvas.current
    const g = el.getContext('2d')
    const bins = new Uint8Array(analyser ? analyser.frequencyBinCount : 0)
    const levels = new Float32Array(BARS)
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame

    const draw = (t) => {
      const dpr = window.devicePixelRatio || 1
      const w = el.clientWidth
      const h = el.clientHeight
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr)
        el.height = Math.round(h * dpr)
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, w, h)

      const css = getComputedStyle(el)
      const tone = css.getPropertyValue('--tone').trim() || '#5b5bf0'
      if (analyser) analyser.getByteFrequencyData(bins)

      const gap = 2
      const barW = (w - gap * (BARS - 1)) / BARS
      const played = progressRef.current * BARS
      for (let i = 0; i < BARS; i++) {
        let target
        if (still) target = 0.35
        else if (bins.length) {
          // Spread bars over the lower ~70% of the spectrum on a curve, where chiptunes live.
          const a = Math.floor(Math.pow(i / BARS, 1.6) * bins.length * 0.7)
          const b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / BARS, 1.6) * bins.length * 0.7))
          let sum = 0
          for (let k = a; k < b; k++) sum += bins[k]
          target = sum / (b - a) / 255
        } else {
          // No Web Audio available: a gentle idle wave instead.
          target = 0.3 + 0.25 * Math.sin(t / 180 + i * 0.6)
        }
        levels[i] += (target - levels[i]) * 0.35
        const barH = Math.max(3, levels[i] * h)
        g.globalAlpha = i < played ? 1 : 0.3
        g.fillStyle = tone
        g.beginPath()
        g.roundRect(i * (barW + gap), h - barH, barW, barH, Math.min(2, barW / 2))
        g.fill()
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [analyser])

  const seekTo = (e) => {
    const r = canvas.current.getBoundingClientRect()
    onSeek?.((e.clientX - r.left) / r.width)
  }
  const pointerDown = (e) => {
    if (e.button !== 0 || !onSeek) return
    e.preventDefault()
    dragging.current = true
    canvas.current.setPointerCapture(e.pointerId)
    seekTo(e)
  }
  const pointerMove = (e) => { if (dragging.current) seekTo(e) }
  const pointerUp = (e) => {
    dragging.current = false
    if (canvas.current.hasPointerCapture(e.pointerId)) canvas.current.releasePointerCapture(e.pointerId)
  }
  const keyDown = (e) => {
    const step = { ArrowLeft: -0.05, ArrowDown: -0.05, ArrowRight: 0.05, ArrowUp: 0.05 }[e.key]
    if (e.key === 'Home') onSeek?.(0)
    else if (step) onSeek?.(progressRef.current + step)
    else return
    e.preventDefault()
  }

  return (
    <canvas
      ref={canvas}
      className={`visualizer${onSeek ? ' visualizer--seekable' : ''}`}
      role={onSeek ? 'slider' : undefined}
      tabIndex={onSeek ? 0 : undefined}
      aria-label={onSeek ? `Seek in ${label || 'sound'}` : undefined}
      aria-valuemin={onSeek ? 0 : undefined}
      aria-valuemax={onSeek ? 100 : undefined}
      aria-valuenow={onSeek ? Math.round(progress * 100) : undefined}
      aria-hidden={onSeek ? undefined : true}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
      onKeyDown={keyDown}
    />
  )
}
