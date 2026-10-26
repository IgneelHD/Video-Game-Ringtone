import { useCallback, useEffect, useRef, useState } from 'react'

// Shared playback, so only a single sound plays at a time. Sounds hosted on this
// site go through a Web Audio analyser that feeds the card visualizer. Sounds
// from other sites use a plain element: without CORS headers the analyser
// would silence them.
export function useAudioPlayer() {
  const audio = useRef(null)
  const plain = useRef(null)
  const active = useRef(null)
  const graph = useRef(null)
  const [playingId, setPlayingId] = useState(null)
  const [progress, setProgress] = useState(0)
  const [analyser, setAnalyser] = useState(null)
  const [analysed, setAnalysed] = useState(false)

  useEffect(() => {
    const make = () => {
      const a = new Audio()
      a.addEventListener('timeupdate', () => { if (active.current === a) setProgress(a.duration ? a.currentTime / a.duration : 0) })
      a.addEventListener('ended', () => { if (active.current === a) { setPlayingId(null); setProgress(0) } })
      return a
    }
    audio.current = make()
    plain.current = make()
    return () => {
      audio.current.pause()
      plain.current.pause()
      graph.current?.ctx.close()
    }
  }, [])

  // The AudioContext must be created from a user gesture, so it starts on first play.
  const connect = () => {
    if (graph.current) return graph.current
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    try {
      const ctx = new Ctx()
      const node = ctx.createAnalyser()
      node.fftSize = 256
      node.smoothingTimeConstant = 0.75
      ctx.createMediaElementSource(audio.current).connect(node)
      node.connect(ctx.destination)
      graph.current = { ctx, node }
      setAnalyser(node)
      return graph.current
    } catch {
      return null
    }
  }

  const toggle = useCallback((id, src, { external = false } = {}) => {
    if (playingId === id) {
      active.current?.pause()
      setPlayingId(null)
      return
    }
    active.current?.pause()
    const a = external ? plain.current : audio.current
    active.current = a
    if (!external) connect()?.ctx.resume()
    setAnalysed(!external)
    a.src = src
    a.currentTime = 0
    setProgress(0)
    a.play().then(() => setPlayingId(id)).catch(() => setPlayingId(null))
  }, [playingId])

  return { playingId, progress, analyser: analysed ? analyser : null, toggle }
}
