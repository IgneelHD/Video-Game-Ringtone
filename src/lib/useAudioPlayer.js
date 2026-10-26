import { useCallback, useEffect, useRef, useState } from 'react'

// One shared <audio> element, so only a single sound plays at a time, routed
// through a Web Audio analyser that feeds the card visualizer.
export function useAudioPlayer() {
  const audio = useRef(null)
  const graph = useRef(null)
  const [playingId, setPlayingId] = useState(null)
  const [progress, setProgress] = useState(0)
  const [analyser, setAnalyser] = useState(null)

  useEffect(() => {
    const a = new Audio()
    a.addEventListener('timeupdate', () => setProgress(a.duration ? a.currentTime / a.duration : 0))
    a.addEventListener('ended', () => { setPlayingId(null); setProgress(0) })
    audio.current = a
    return () => {
      a.pause()
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

  const toggle = useCallback((id, src) => {
    const a = audio.current
    if (playingId === id) {
      a.pause()
      setPlayingId(null)
      return
    }
    connect()?.ctx.resume()
    a.src = src
    a.currentTime = 0
    setProgress(0)
    a.play().then(() => setPlayingId(id)).catch(() => setPlayingId(null))
  }, [playingId])

  return { playingId, progress, analyser, toggle }
}
