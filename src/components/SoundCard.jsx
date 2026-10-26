import { DownloadIcon, ExternalIcon, PauseIcon, PlayIcon } from './Icons.jsx'

export default function SoundCard({ sound, isPlaying, progress, onToggle }) {
  const isFree = sound.kind === 'free'

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
        <a
          className="card__download card__download--external"
          href={sound.source.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Get ${sound.title} from ${sound.source.name}`}
          title={`Get it on ${sound.source.name}`}
        >
          <ExternalIcon />
        </a>
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
          <span className="card__meta card__meta--source">via {sound.source.name}</span>
        )}
      </footer>
    </article>
  )
}
