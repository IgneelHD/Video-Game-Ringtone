import { useEffect, useRef, useState } from 'react'
import { DownloadIcon, ExternalIcon, PauseIcon, PlayIcon, SpinnerIcon } from './Icons.jsx'
import { downloadFile, searchFreeAudio } from '../lib/freeAudio.js'
import { hostName, modeOf } from '../data/sounds.js'
import Visualizer from './Visualizer.jsx'

export default function SoundCard({ sound, isPlaying, progress, analyser, onToggle }) {
  const mode = modeOf(sound)
  const isFree = mode === 'file'
  const [status, setStatus] = useState('')
  const ext = sound.file?.match(/\.[a-z0-9]+$/i)?.[0] || '.mp3'

  return (
    <article
      className={`card card--${sound.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${isPlaying ? ' card--playing' : ''}`}
      style={sound.color ? { '--tone': sound.color } : undefined}
    >
      {sound.external && <RemoteDownload sound={sound} />}
      {mode === 'file' && !sound.external && (
        <a
          className="card__download"
          href={sound.src}
          download={`${sound.title}${ext}`}
          aria-label={`Download ${sound.title}`}
          title="Download"
        >
          <DownloadIcon />
        </a>
      )}
      {mode === 'link' && (
        <a
          className="card__download"
          href={sound.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Download ${sound.title} from ${hostName(sound.downloadUrl)}`}
          title={`Download from ${hostName(sound.downloadUrl)}`}
        >
          <DownloadIcon />
        </a>
      )}
      {mode === 'search' && <IconicDownload sound={sound} setStatus={setStatus} />}

      {sound.image ? (
        <div className="card__head">
          <img className="card__cover" src={sound.image} alt="" loading="lazy" />
          <span className="card__tag">{sound.category}</span>
        </div>
      ) : (
        <span className="card__tag">{sound.category}</span>
      )}
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
            {isPlaying ? (
              <Visualizer analyser={analyser} progress={progress} />
            ) : (
              <div className="card__progress" aria-hidden="true">
                <span style={{ width: 0 }} />
              </div>
            )}
            {sound.duration > 0 && <span className="card__meta">{sound.duration.toFixed(1)}s</span>}
          </>
        ) : (
          <span className="card__meta card__meta--source" role="status">
            {status || `via ${mode === 'link' ? hostName(sound.downloadUrl) : sound.sourceName || 'free sources'}`}
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

  const fallBack = (reason) => {
    if (!sound.sourceUrl) {
      setState({ phase: 'idle' })
      setStatus(reason)
      return
    }
    const name = sound.sourceName || hostName(sound.sourceUrl)
    setState({ phase: 'fallback', url: sound.sourceUrl, label: `Open ${name}` })
    setStatus(`${reason} · try ${name}`)
  }

  const run = async () => {
    const c = new AbortController()
    controller.current = c
    setState({ phase: 'searching' })
    setStatus('Searching free sources…')
    try {
      const { match, failed } = await searchFreeAudio(sound.query || sound.title, c.signal)
      if (!match) {
        fallBack(failed ? 'Sources unreachable' : 'No free file found')
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
      fallBack('Search failed')
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

// A file on another site: download it in-page when that site allows it,
// otherwise open the file in a new tab so it can be saved from there.
function RemoteDownload({ sound }) {
  const [state, setState] = useState('idle')
  const controller = useRef(null)
  useEffect(() => () => controller.current?.abort(), [])

  const run = async () => {
    const c = new AbortController()
    controller.current = c
    setState('busy')
    try {
      await downloadFile(sound, `${sound.title}${sound.creator ? ` - ${sound.creator}` : ''}`, c.signal)
      setState('idle')
    } catch {
      if (!c.signal.aborted) setState('blocked')
    }
  }

  if (state === 'blocked') {
    return (
      <a
        className="card__download card__download--external"
        href={sound.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${sound.title} on ${sound.source} to save it`}
        title={`${sound.source} blocks direct downloads. Open the file and save it from there.`}
      >
        <ExternalIcon />
      </a>
    )
  }
  return (
    <button
      className="card__download"
      onClick={run}
      disabled={state === 'busy'}
      aria-label={`Download ${sound.title} from ${sound.source}`}
      title={`Download from ${sound.source} · ${sound.license}`}
    >
      {state === 'busy' ? <SpinnerIcon /> : <DownloadIcon />}
    </button>
  )
}
