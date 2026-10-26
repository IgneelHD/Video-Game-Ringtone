import { useEffect, useRef, useState } from 'react'
import { DownloadIcon, ExternalIcon, PauseIcon, PlayIcon, SpinnerIcon } from './Icons.jsx'
import { downloadFile, searchFreeAudio } from '../lib/freeAudio.js'

export default function SoundCard({ sound, isPlaying, progress, onToggle }) {
  const isFree = sound.kind === 'free'
  const [status, setStatus] = useState('')

  return (
    <article className={`card card--${sound.category.toLowerCase()}`}>
      {isFree ? (
        <a
          className="card__download"
          href={sound.src}
          download={`${sound.title}.mp3`}
          aria-label={`Download ${sound.title}`}
          title="Download MP3"
        >
          <DownloadIcon />
        </a>
      ) : (
        <IconicDownload sound={sound} setStatus={setStatus} />
      )}

      <span className="card__tag">{sound.category}</span>
      <h3 className="card__title">{sound.title}</h3>
      <p className="card__game">
        {sound.game}
        {sound.year && <span> · {sound.year}</span>}
      </p>
      <p className="card__vibe">{sound.vibe}</p>

      <footer className="card__footer">
        {isFree ? (
          <>
            <button className="card__play" onClick={onToggle} aria-label={isPlaying ? 'Pause' : 'Play preview'}>
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <div className="card__progress" aria-hidden="true">
              <span style={{ width: `${isPlaying ? progress * 100 : 0}%` }} />
            </div>
            <span className="card__meta">{sound.duration.toFixed(1)}s</span>
          </>
        ) : (
          <span className="card__meta card__meta--source" role="status">
            {status || `via ${sound.source.name}`}
          </span>
        )}
      </footer>
    </article>
  )
}

// Searches for a freely licensed recording and downloads it. When none exists
// (or the host refuses the download), the button turns into a link to the
// public source page instead.
function IconicDownload({ sound, setStatus }) {
  const [state, setState] = useState({ phase: 'idle' })
  const controller = useRef(null)
  useEffect(() => () => controller.current?.abort(), [])

  const run = async () => {
    const c = new AbortController()
    controller.current = c
    setState({ phase: 'searching' })
    setStatus('Searching free sources…')
    try {
      const { match, failed } = await searchFreeAudio(sound.query, c.signal)
      if (!match) {
        setState({ phase: 'fallback', url: sound.source.url, label: `Open ${sound.source.name}` })
        setStatus(failed ? `Sources unreachable · try ${sound.source.name}` : `No free file found · try ${sound.source.name}`)
        return
      }
      setStatus(`Downloading from ${match.source}…`)
      try {
        await downloadFile(match, `${sound.game} - ${sound.title}`, c.signal)
        setState({ phase: 'idle' })
        setStatus(`Downloaded · ${match.license} · ${match.source}`)
      } catch {
        if (c.signal.aborted) return
        setState({ phase: 'fallback', url: match.url, label: 'Open the file directly' })
        setStatus(`${match.source} blocked the download · open the file directly`)
      }
    } catch {
      if (c.signal.aborted) return
      setState({ phase: 'fallback', url: sound.source.url, label: `Open ${sound.source.name}` })
      setStatus(`Search failed · try ${sound.source.name}`)
    }
  }

  if (state.phase === 'fallback') {
    return (
      <a
        className="card__download card__download--external"
        href={state.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${state.label} for ${sound.title}`}
        title={state.label}
      >
        <ExternalIcon />
      </a>
    )
  }

  return (
    <button
      className="card__download"
      onClick={run}
      disabled={state.phase === 'searching'}
      aria-label={`Find and download ${sound.title}`}
      title="Find a free recording and download it"
    >
      {state.phase === 'searching' ? <SpinnerIcon /> : <DownloadIcon />}
    </button>
  )
}
