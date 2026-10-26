import { useEffect, useMemo, useRef, useState } from 'react'
import SoundCard from './components/SoundCard.jsx'
import { MoonIcon, SearchIcon, SunIcon } from './components/Icons.jsx'
import { CATEGORIES, SOUNDS } from './data/sounds.js'

const SOURCES = [
  { id: 'all', label: 'All sounds' },
  { id: 'free', label: 'Free download' },
  { id: 'iconic', label: 'Iconic classics' },
]

function initialTheme() {
  try {
    const saved = localStorage.getItem('theme')
    if (saved) return saved
  } catch {}
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function App() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [source, setSource] = useState('all')
  const [theme, setTheme] = useState(initialTheme)
  const [playingId, setPlayingId] = useState(null)
  const [progress, setProgress] = useState(0)
  const audioRef = useRef(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('theme', theme) } catch {}
  }, [theme])

  // One shared player so only a single preview plays at a time.
  useEffect(() => {
    const audio = new Audio()
    audio.addEventListener('timeupdate', () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0))
    audio.addEventListener('ended', () => { setPlayingId(null); setProgress(0) })
    audioRef.current = audio
    return () => audio.pause()
  }, [])

  const toggle = (sound) => {
    const audio = audioRef.current
    if (playingId === sound.id) {
      audio.pause()
      setPlayingId(null)
      return
    }
    audio.src = sound.src
    audio.currentTime = 0
    setProgress(0)
    audio.play().then(() => setPlayingId(sound.id)).catch(() => setPlayingId(null))
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return SOUNDS.filter((s) =>
      (category === 'All' || s.category === category) &&
      (source === 'all' || s.kind === source) &&
      (!q || `${s.title} ${s.game} ${s.vibe}`.toLowerCase().includes(q)),
    )
  }, [query, category, source])

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__top">
          <span className="logo">🎮 Game Tones</span>
          <button
            className="icon-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle dark mode"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
        <h1>Video game sounds that make <em>perfect</em> ringtones</h1>
        <p className="hero__sub">
          {SOUNDS.length} hand-picked tones for calls, texts and alarms. Preview the free originals right here,
          or grab the iconic classics from public sound archives.
        </p>
      </header>

      <section className="controls" aria-label="Filters">
        <label className="search">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search by sound or game…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="chips" role="group" aria-label="Category">
          {['All', ...CATEGORIES].map((c) => (
            <button key={c} className={`chip ${category === c ? 'chip--active' : ''}`} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Source">
          {SOURCES.map((s) => (
            <button key={s.id} className={source === s.id ? 'active' : ''} onClick={() => setSource(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <main>
        <p className="count">{visible.length} sound{visible.length === 1 ? '' : 's'}</p>
        {visible.length ? (
          <div className="grid">
            {visible.map((s) => (
              <SoundCard
                key={s.id}
                sound={s}
                isPlaying={playingId === s.id}
                progress={progress}
                onToggle={() => toggle(s)}
              />
            ))}
          </div>
        ) : (
          <p className="empty">No sounds match. Try another search or filter.</p>
        )}
      </main>

      <footer className="site-footer">
        <p>
          <strong>Free download</strong> tones are original chiptunes made for this site and released under CC0,
          so use them however you like.
        </p>
        <p>
          <strong>Iconic classics</strong> belong to their publishers. We don’t host them; the corner button opens a
          public archive (MyInstants, The Sounds Resource, Internet Archive) where you can find them.
          Use them for personal ringtones only.
        </p>
        <p className="tip">
          Tip: Android accepts MP3 directly (Settings → Sound → Ringtone). On iPhone, import the file into GarageBand
          and export it as a ringtone.
        </p>
      </footer>
    </div>
  )
}
