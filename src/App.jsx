import { useEffect, useMemo, useState } from 'react'
import { useAudioPlayer } from './lib/useAudioPlayer.js'
import SoundCard from './components/SoundCard.jsx'
import { MoonIcon, SearchIcon, SunIcon } from './components/Icons.jsx'
import { CATEGORIES, SOUNDS } from './data/sounds.js'
import { EXTERNAL_SITES, MAX_SECONDS, searchOpenSources } from './lib/openSearch.js'

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
  const { playingId, progress, analyser, toggle } = useAudioPlayer()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('theme', theme) } catch {}
  }, [theme])

  const open = useOpenSearch(query)

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
                analyser={analyser}
                onToggle={() => toggle(s.id, s.src)}
              />
            ))}
          </div>
        ) : (
          <p className="empty">No sounds match on this site{query.trim().length >= 2 ? '. Check the open sources below.' : '. Try another search or filter.'}</p>
        )}

        {query.trim().length >= 2 && (
          <OpenResults
            query={query.trim()}
            open={open}
            playingId={playingId}
            progress={progress}
            analyser={analyser}
            toggle={toggle}
          />
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

const PAGE = 12

// Debounced search across open sound libraries for the current query.
function useOpenSearch(query) {
  const [state, setState] = useState({ status: 'idle', results: [], failed: [] })
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setState({ status: 'idle', results: [], failed: [] })
      return
    }
    const c = new AbortController()
    setState((s) => ({ ...s, status: 'loading' }))
    const timer = setTimeout(() => {
      searchOpenSources(q, c.signal)
        .then(({ results, failed }) => setState({ status: 'done', results: results.map(toCard), failed }))
        .catch(() => { if (!c.signal.aborted) setState({ status: 'done', results: [], failed: ['all sources'] }) })
    }, 500)
    return () => { clearTimeout(timer); c.abort() }
  }, [query])
  return state
}

const toCard = (r) => ({
  ...r,
  external: true,
  game: r.creator || 'Unknown artist',
  category: r.source,
  vibe: [r.album, r.license].filter(Boolean).join(' · '),
  src: r.url,
})

function OpenResults({ query, open, playingId, progress, analyser, toggle }) {
  const [shown, setShown] = useState(PAGE)
  useEffect(() => setShown(PAGE), [query])
  const { status, results, failed } = open

  return (
    <section className="open-results" aria-labelledby="open-results-title">
      <div className="open-results__head">
        <h2 id="open-results-title">From around the web</h2>
        <p className="count">
          {status === 'loading' ? 'Searching Deezer, iTunes and Openverse sound effects…'
            : `${results.length} result${results.length === 1 ? '' : 's'} for “${query}” · Deezer & iTunes give 30s previews, Openverse clips up to ${MAX_SECONDS}s`}
        </p>
      </div>

      {status === 'done' && failed.length > 0 && (
        <p className="count">Couldn’t reach: {failed.join(', ')}.</p>
      )}

      {status === 'done' && results.length > 0 && (
        <div className="grid">
          {results.slice(0, shown).map((s) => (
            <SoundCard
              key={s.id}
              sound={s}
              isPlaying={playingId === s.id}
              progress={progress}
              analyser={analyser}
              onToggle={() => toggle(s.id, s.src, { external: true })}
            />
          ))}
        </div>
      )}
      {status === 'done' && results.length > shown && (
        <button className="chip open-results__more" onClick={() => setShown((n) => n + PAGE)}>
          Show more ({results.length - shown})
        </button>
      )}
      {status === 'done' && !results.length && <p className="empty">No open-source results.</p>}

      <div className="open-results__sites">
        <span className="count">Search “{query}” on:</span>
        {EXTERNAL_SITES.map((site) => (
          <a key={site.name} className="chip" href={site.url(query)} target="_blank" rel="noopener noreferrer">
            {site.name} ↗
          </a>
        ))}
      </div>
    </section>
  )
}
