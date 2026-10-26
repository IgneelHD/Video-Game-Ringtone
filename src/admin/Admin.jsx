import { useEffect, useMemo, useRef, useState } from 'react'
import SoundCard from '../components/SoundCard.jsx'
import { MoonIcon, SearchIcon, SunIcon } from '../components/Icons.jsx'
import { fileUrl, modeOf } from '../data/sounds.js'
import { GitHub, OWNER, REPO } from './github.js'
import { fetchVault, lockToken, passwordProblem, unlockToken } from './vault.js'

const TOKEN_KEY = 'gt-admin-token'
const VAULT_PATH = 'public/admin-key.json'
const MAX_UPLOAD = 15 * 1024 * 1024
const MODES = [
  { id: 'file', label: 'Upload file' },
  { id: 'link', label: 'Download link' },
  { id: 'search', label: 'Search free sources' },
]
const DEFAULT_TONES = { Ringtone: '#5b5bf0', Notification: '#0f9d74', Alarm: '#e5484d', Message: '#d97706' }

const storage = {
  get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch {} },
}

// The unlocked token lives for the browser tab, or on the device if "keep me signed in".
const tokenStore = {
  get: () => { try { return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '' } catch { return '' } },
  set: (t, keep) => {
    try {
      sessionStorage.setItem(TOKEN_KEY, t)
      keep ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY)
    } catch {}
  },
  kept: () => { try { return !!localStorage.getItem(TOKEN_KEY) } catch { return false } },
  clear: () => { try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_KEY) } catch {} },
}

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'sound'
const isHttpUrl = (s) => { try { return ['http:', 'https:'].includes(new URL(s).protocol) } catch { return false } }

function validate(sound) {
  const errors = []
  if (!sound.title.trim()) errors.push('Title is required.')
  const mode = modeOf(sound)
  if (mode === 'file' && !sound.file) errors.push('Upload a file.')
  if (mode === 'link' && !isHttpUrl(sound.downloadUrl)) errors.push('Download link must start with https://')
  if (mode === 'search' && !sound.query?.trim()) errors.push('Search phrase is required.')
  if (mode === 'search' && sound.sourceUrl && !isHttpUrl(sound.sourceUrl)) errors.push('Fallback page must start with https://')
  return errors
}

// Strips fields that don't belong to the sound's download mode, so sounds.json stays tidy.
function withMode(sound, mode) {
  const { file, duration, downloadUrl, query, sourceName, sourceUrl, ...rest } = sound
  if (mode === 'file') return { ...rest, file: file || '', duration: duration || 0 }
  if (mode === 'link') return { ...rest, downloadUrl: downloadUrl || '' }
  return { ...rest, query: query ?? rest.title, sourceName: sourceName || '', sourceUrl: sourceUrl || '' }
}

const audioDuration = (url) =>
  new Promise((resolve) => {
    const a = new Audio()
    a.preload = 'metadata'
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? Math.round(a.duration * 10) / 10 : 0)
    a.onerror = () => resolve(0)
    a.src = url
  })

export default function Admin() {
  const [theme, setTheme] = useState(() => storage.get('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
  const [token, setToken] = useState(tokenStore.get)
  const [vault, setVault] = useState(undefined) // undefined while loading, null when no login is set up
  const [needsSetup, setNeedsSetup] = useState(false)
  const [account, setAccount] = useState(false)
  const [session, setSession] = useState(null) // { branch, dataSha }
  const [data, setData] = useState(null)
  const [savedJson, setSavedJson] = useState('')
  const [uploads, setUploads] = useState({}) // path under public/ -> { file, url, saved }
  const [selectedId, setSelectedId] = useState(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null)
  const gh = useMemo(() => new GitHub(token), [token])
  const pollTimer = useRef(null)
  useEffect(() => () => clearTimeout(pollTimer.current), [])
  useEffect(() => {
    document.querySelector('.admin__row--active')?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    storage.set('theme', theme)
  }, [theme])

  const dirty = !!data && (JSON.stringify(data) !== savedJson || Object.values(uploads).some((u) => !u.saved))
  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [dirty])

  const enter = (t, result, keep) => {
    tokenStore.set(t, keep)
    setToken(t)
    setSession({ branch: result.branch, dataSha: result.dataSha })
    setData(result.data)
    setSavedJson(JSON.stringify(result.data))
    setUploads({})
    setSelectedId((id) => (result.data.sounds.some((s) => s.id === id) ? id : result.data.sounds[0]?.id ?? null))
  }

  const tokenFailed = (e) => {
    if (e.status === 401 || e.status === 403 || e.status === 404) {
      tokenStore.clear()
      setNeedsSetup(true)
      setError('The saved GitHub token has expired or lost access to the repository. Set up the login again with a new token.')
    } else {
      setError(e.message)
    }
  }

  const login = async (username, password, keep) => {
    setBusy('Signing in…')
    setError('')
    try {
      const t = await unlockToken(vault, username, password)
      setBusy('Loading sounds…')
      try {
        enter(t, await new GitHub(t).load(), keep)
      } catch (e) {
        tokenFailed(e)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  const setup = async (t, username, password, keep) => {
    setBusy('Checking the token…')
    setError('')
    try {
      const github = new GitHub(t)
      const result = await github.load()
      setBusy('Saving your login…')
      const next = await lockToken(username, password, t)
      await github.putFile(result.branch, VAULT_PATH, JSON.stringify(next, null, 2) + '\n', 'Set admin login')
      setVault(next)
      setNeedsSetup(false)
      enter(t, result, keep)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  const changeLogin = async (username, password) => {
    const next = await lockToken(username, password, token)
    await gh.putFile(session.branch, VAULT_PATH, JSON.stringify(next, null, 2) + '\n', 'Change admin login')
    setVault(next)
  }

  useEffect(() => {
    fetchVault().then(setVault)
    const t = tokenStore.get()
    if (!t) return
    setBusy('Loading sounds…')
    new GitHub(t).load()
      .then((result) => enter(t, result, tokenStore.kept()))
      .catch(tokenFailed)
      .finally(() => setBusy(''))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = () => {
    if (dirty && !confirm('Discard unsaved changes and sign out?')) return
    tokenStore.clear()
    setToken('')
    setSession(null)
    setData(null)
    setAccount(false)
  }

  if (!session || !data) {
    return (
      <SignIn
        theme={theme}
        setTheme={setTheme}
        busy={busy}
        error={error}
        vault={vault}
        needsSetup={needsSetup}
        onLogin={login}
        onSetup={setup}
      />
    )
  }

  const sounds = data.sounds
  const selected = sounds.find((s) => s.id === selectedId)
  const invalid = sounds.filter((s) => validate(s).length)

  const update = (id, patch) => setData((d) => ({ ...d, sounds: d.sounds.map((s) => (s.id === id ? { ...s, ...patch } : s)) }))
  const replace = (id, next) => setData((d) => ({ ...d, sounds: d.sounds.map((s) => (s.id === id ? next : s)) }))

  const add = () => {
    const id = `sound-${Date.now().toString(36)}`
    const sound = { id, title: 'New sound', game: '', category: data.categories[0], vibe: '', color: '', file: '', duration: 0 }
    setData((d) => ({ ...d, sounds: [sound, ...d.sounds] }))
    setSelectedId(id)
    setFilter('')
  }

  const remove = (id) => {
    const s = sounds.find((x) => x.id === id)
    if (!confirm(`Delete "${s.title}"? This takes effect when you save.`)) return
    const index = sounds.indexOf(s)
    setData((d) => ({ ...d, sounds: d.sounds.filter((x) => x.id !== id) }))
    setSelectedId(sounds[index + 1]?.id ?? sounds[index - 1]?.id ?? null)
  }

  const move = (id, delta) =>
    setData((d) => {
      const list = [...d.sounds]
      const i = list.findIndex((s) => s.id === id)
      const j = i + delta
      if (j < 0 || j >= list.length) return d
      ;[list[i], list[j]] = [list[j], list[i]]
      return { ...d, sounds: list }
    })

  const upload = async (sound, file) => {
    if (!file) return
    if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|m4r|ogg|wav|aac|flac)$/i.test(file.name)) {
      setError('That file is not an audio file.')
      return
    }
    if (file.size > MAX_UPLOAD) {
      setError(`That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is 15 MB, which is plenty for a ringtone.`)
      return
    }
    setError('')
    const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || '.mp3').toLowerCase()
    const path = `sounds/${slug(sound.title)}-${Date.now().toString(36)}${ext}`
    const url = URL.createObjectURL(file)
    setUploads((u) => {
      const next = { ...u }
      if (sound.file && next[sound.file] && !next[sound.file].saved) { URL.revokeObjectURL(next[sound.file].url); delete next[sound.file] }
      next[path] = { file, url }
      return next
    })
    update(sound.id, { file: path, duration: await audioDuration(url) })
  }

  const save = async () => {
    if (invalid.length) {
      setSelectedId(invalid[0].id)
      setError(`Fix "${invalid[0].title || 'Untitled'}" first: ${validate(invalid[0]).join(' ')}`)
      return
    }
    setBusy('Saving to GitHub…')
    setError('')
    setNotice(null)
    try {
      const referenced = new Set(sounds.map((s) => s.file).filter(Boolean))
      const before = new Set(JSON.parse(savedJson).sounds.map((s) => s.file).filter(Boolean))
      const pending = Object.entries(uploads).filter(([path, u]) => !u.saved && referenced.has(path))
      const deletes = [...before].filter((p) => !referenced.has(p) && p.startsWith('sounds/')).map((p) => `public/${p}`)
      const count = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
      const message = `Update sounds from admin${pending.length ? ` (${count(pending.length, 'upload')})` : ''}${deletes.length ? ` (${count(deletes.length, 'removed file')})` : ''}`
      const result = await gh.save({
        branch: session.branch,
        dataSha: session.dataSha,
        data,
        uploads: pending.map(([path, u]) => ({ path: `public/${path}`, file: u.file })),
        deletes,
        message,
      })
      setSession((s) => ({ ...s, dataSha: result.dataSha }))
      setSavedJson(JSON.stringify(data))
      // Keep blob URLs so previews work until the redeployed files are live.
      setUploads((u) => Object.fromEntries(Object.entries(u).filter(([p]) => referenced.has(p)).map(([p, x]) => [p, { ...x, saved: true }])))
      setNotice({ commit: result.commit, deploy: null })
      pollDeploy(result.commit)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  const pollDeploy = (sha, tries = 0) => {
    clearTimeout(pollTimer.current)
    pollTimer.current = setTimeout(async () => {
      const deploy = await gh.deployStatus(sha)
      setNotice((n) => (n?.commit === sha ? { ...n, deploy } : n))
      if ((!deploy || deploy.status !== 'completed') && tries < 30) pollDeploy(sha, tries + 1)
    }, tries ? 8000 : 4000)
  }
  const q = filter.trim().toLowerCase()
  const visible = sounds.filter((s) => !q || `${s.title} ${s.game}`.toLowerCase().includes(q))

  return (
    <div className="admin">
      <header className="admin__bar">
        <div className="admin__brand">
          <span className="logo">🎮 Game Tones</span>
          <span className="admin__badge">Admin</span>
        </div>
        <div className="admin__actions">
          <a className="btn btn--ghost" href="./" target="_blank" rel="noopener">View site</a>
          <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode">
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="btn btn--ghost" onClick={() => setAccount((a) => !a)} aria-expanded={account}>Account</button>
          <button className="btn btn--ghost" onClick={signOut}>Sign out</button>
          <button className="btn btn--primary" onClick={save} disabled={!dirty || !!busy}>
            {busy ? 'Saving…' : dirty ? 'Save & publish' : 'Saved'}
          </button>
        </div>
      </header>

      {error && <p className="admin__msg admin__msg--error" role="alert">{error}</p>}
      {notice && <DeployNotice notice={notice} onClose={() => setNotice(null)} />}
      {account && <AccountPanel onSave={changeLogin} onClose={() => setAccount(false)} />}

      <div className="admin__layout">
        <aside className="admin__list">
          <div className="admin__list-head">
            <label className="search">
              <SearchIcon />
              <input type="search" placeholder="Find a sound…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </label>
            <button className="btn btn--primary" onClick={add}>+ Add</button>
          </div>
          <p className="count">{sounds.length} sounds{dirty && ' · unsaved changes'}</p>
          <ul>
            {visible.map((s) => (
              <li key={s.id}>
                <button
                  className={`admin__row ${s.id === selectedId ? 'admin__row--active' : ''}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <span className="admin__dot" style={{ background: s.color || DEFAULT_TONES[s.category] || 'var(--accent)' }} />
                  <span className="admin__row-text">
                    <b>{s.title || 'Untitled'}</b>
                    <small>{s.game || '—'} · {MODES.find((m) => m.id === modeOf(s)).label}</small>
                  </span>
                  {validate(s).length > 0 && <span className="admin__warn" title={validate(s).join(' ')}>!</span>}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="admin__editor">
          {selected ? (
            <Editor
              key={selected.id}
              sound={selected}
              categories={data.categories}
              uploads={uploads}
              index={sounds.indexOf(selected)}
              total={sounds.length}
              onChange={(patch) => update(selected.id, patch)}
              onMode={(mode) => replace(selected.id, withMode(selected, mode))}
              onUpload={(file) => upload(selected, file)}
              onMove={(d) => move(selected.id, d)}
              onDelete={() => remove(selected.id)}
            />
          ) : (
            <p className="empty">No sound selected. Add one to get started.</p>
          )}
        </main>
      </div>
    </div>
  )
}

function Editor({ sound, categories, uploads, index, total, onChange, onMode, onUpload, onMove, onDelete }) {
  const mode = modeOf(sound)
  const errors = validate(sound)
  const pending = sound.file && uploads[sound.file]
  const src = pending ? pending.url : sound.file ? fileUrl(sound.file) : undefined
  const tone = sound.color || DEFAULT_TONES[sound.category] || '#5b5bf0'
  const fileInput = useRef(null)

  // Preview playback, independent of the public site's player.
  const audio = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const a = new Audio()
    a.ontimeupdate = () => setProgress(a.duration ? a.currentTime / a.duration : 0)
    a.onended = () => { setPlaying(false); setProgress(0) }
    audio.current = a
    return () => a.pause()
  }, [])
  const toggle = () => {
    const a = audio.current
    if (playing) { a.pause(); setPlaying(false); return }
    a.src = src
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }

  return (
    <div className="editor">
      <div className="editor__form">
        <div className="editor__head">
          <h2>Edit sound</h2>
          <div className="editor__tools">
            <button className="btn btn--ghost" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">↑</button>
            <button className="btn btn--ghost" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Move down">↓</button>
            <button className="btn btn--danger" onClick={onDelete}>Delete</button>
          </div>
        </div>

        <Field label="Title">
          <input value={sound.title} onChange={(e) => onChange({ title: e.target.value })} />
        </Field>
        <div className="editor__two">
          <Field label="Game">
            <input value={sound.game} onChange={(e) => onChange({ game: e.target.value })} />
          </Field>
          <Field label="Year">
            <input
              inputMode="numeric"
              value={sound.year ?? ''}
              onChange={(e) => {
                const year = e.target.value.replace(/\D/g, '').slice(0, 4)
                onChange({ year: year ? Number(year) : undefined })
              }}
            />
          </Field>
        </div>
        <div className="editor__two">
          <Field label="Category">
            <select value={sound.category} onChange={(e) => onChange({ category: e.target.value })}>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Color">
            <div className="editor__color">
              <input type="color" value={tone} onChange={(e) => onChange({ color: e.target.value })} aria-label="Card color" />
              <span>{sound.color ? sound.color : `Category default`}</span>
              {sound.color && <button className="link-btn" onClick={() => onChange({ color: '' })}>Reset</button>}
            </div>
          </Field>
        </div>
        <Field label="Description">
          <textarea rows={2} value={sound.vibe} onChange={(e) => onChange({ vibe: e.target.value })} />
        </Field>

        <Field label="Download" as="div">
          <div className="segmented" role="group" aria-label="Download type">
            {MODES.map((m) => (
              <button key={m.id} type="button" className={mode === m.id ? 'active' : ''} onClick={() => onMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
        </Field>

        {mode === 'file' && (
          <div className="editor__panel">
            <p className="hint">Upload an MP3 (or M4A, OGG, WAV). Visitors can play it on the site and download it with the corner button. Max 15 MB.</p>
            <div className="editor__upload">
              <button className="btn btn--primary" onClick={() => fileInput.current.click()}>
                {sound.file ? 'Replace file' : 'Upload file'}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="audio/*,.mp3,.m4a,.m4r,.ogg,.wav"
                hidden
                onChange={(e) => { onUpload(e.target.files[0]); e.target.value = '' }}
              />
              <span className="editor__file">
                {sound.file ? sound.file.split('/').pop() : 'No file yet'}
                {pending && !pending.saved && <em> · not saved yet</em>}
                {sound.duration > 0 && ` · ${sound.duration.toFixed(1)}s`}
              </span>
            </div>
          </div>
        )}

        {mode === 'link' && (
          <div className="editor__panel">
            <p className="hint">The corner button opens this link in a new tab. Use a direct file link or a download page.</p>
            <Field label="Download link">
              <input type="url" placeholder="https://…" value={sound.downloadUrl} onChange={(e) => onChange({ downloadUrl: e.target.value.trim() })} />
            </Field>
          </div>
        )}

        {mode === 'search' && (
          <div className="editor__panel">
            <p className="hint">
              The corner button searches Wikimedia Commons and the Internet Archive for a freely licensed recording. Every word of the
              search phrase must appear in the file name. If none is found, it opens the fallback page.
            </p>
            <Field label="Search phrase">
              <input value={sound.query} onChange={(e) => onChange({ query: e.target.value })} />
            </Field>
            <div className="editor__two">
              <Field label="Fallback page name">
                <input placeholder="MyInstants" value={sound.sourceName} onChange={(e) => onChange({ sourceName: e.target.value })} />
              </Field>
              <Field label="Fallback page link">
                <input type="url" placeholder="https://…" value={sound.sourceUrl} onChange={(e) => onChange({ sourceUrl: e.target.value.trim() })} />
              </Field>
            </div>
          </div>
        )}

        {errors.length > 0 && <p className="admin__msg admin__msg--error">{errors.join(' ')}</p>}
      </div>

      <div className="editor__preview">
        <p className="count">Preview</p>
        <SoundCard sound={{ ...sound, src }} isPlaying={playing} progress={progress} onToggle={toggle} />
      </div>
    </div>
  )
}

function Field({ label, children, as: Tag = 'label' }) {
  return (
    <Tag className="field">
      <span>{label}</span>
      {children}
    </Tag>
  )
}

function DeployNotice({ notice, onClose }) {
  const d = notice.deploy
  const text =
    !d ? 'Saved to GitHub. The site will update in about a minute.'
    : d.status !== 'completed' ? 'Saved. Publishing the site…'
    : d.conclusion === 'success' ? 'Published! Your changes are live.'
    : 'Saved, but publishing failed. Open the run on GitHub for details.'
  return (
    <p className={`admin__msg ${d?.status === 'completed' && d.conclusion !== 'success' ? 'admin__msg--error' : 'admin__msg--ok'}`} role="status">
      {text}{' '}
      <a href={d?.url || `https://github.com/${OWNER}/${REPO}/commit/${notice.commit}`} target="_blank" rel="noopener noreferrer">
        {d ? 'View run' : 'View commit'}
      </a>
      <button className="link-btn" onClick={onClose} aria-label="Dismiss">✕</button>
    </p>
  )
}

function AccountPanel({ onSave, onClose }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [state, setState] = useState({ busy: false, error: '', done: false })
  const submit = async (e) => {
    e.preventDefault()
    const problem = passwordProblem(username, password, confirmPw)
    if (problem) return setState({ busy: false, error: problem, done: false })
    setState({ busy: true, error: '', done: false })
    try {
      await onSave(username, password)
      setPassword('')
      setConfirmPw('')
      setState({ busy: false, error: '', done: true })
    } catch (err) {
      setState({ busy: false, error: err.message, done: false })
    }
  }
  return (
    <form className="account" onSubmit={submit}>
      <div className="editor__head">
        <h2>Change username &amp; password</h2>
        <button type="button" className="link-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <p className="hint">Other devices pick up the new login after the site republishes (about a minute).</p>
      <div className="account__fields">
        <Field label="New username">
          <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="New password">
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm password">
          <input type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
        </Field>
        <button className="btn btn--primary" disabled={state.busy}>{state.busy ? 'Saving…' : 'Save login'}</button>
      </div>
      {state.error && <p className="admin__msg admin__msg--error" role="alert">{state.error}</p>}
      {state.done && <p className="admin__msg admin__msg--ok" role="status">Login updated.</p>}
    </form>
  )
}

function SignIn({ theme, setTheme, busy, error, vault, needsSetup, onLogin, onSetup }) {
  const [mode, setMode] = useState(null) // null = pick automatically
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [token, setToken] = useState('')
  const [keep, setKeep] = useState(false)
  const [problem, setProblem] = useState('')
  const current = mode || (needsSetup || vault === null ? 'setup' : 'login')

  const submit = (e) => {
    e.preventDefault()
    setProblem('')
    if (current === 'login') return onLogin(username, password, keep)
    const p = passwordProblem(username, password, confirmPw)
    if (p) return setProblem(p)
    if (!token.trim()) return setProblem('Paste the GitHub token.')
    onSetup(token.trim(), username, password, keep)
  }

  return (
    <div className="signin">
      <div className="signin__card">
        <div className="admin__brand">
          <span className="logo">🎮 Game Tones</span>
          <span className="admin__badge">Admin</span>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode">
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>

        {vault === undefined && !busy ? (
          <p className="hint" style={{ marginTop: 24 }}>Loading…</p>
        ) : current === 'login' ? (
          <>
            <h1>Sign in</h1>
            <p className="hint">Enter your admin username and password.</p>
          </>
        ) : (
          <>
            <h1>Set up your login</h1>
            <p className="hint">
              One-time setup. Changes are saved to the <b>{OWNER}/{REPO}</b> repository, which needs a GitHub token. Paste it once here and
              choose a username and password. The token is stored encrypted with your password, so from then on you only need those.
            </p>
            <ol className="hint signin__steps">
              <li>
                Open{' '}
                <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">
                  new fine-grained token
                </a>
                . Set expiration to the longest you're comfortable with.
              </li>
              <li>Repository access: <b>Only select repositories</b> → {REPO}.</li>
              <li>Permissions: <b>Contents: Read and write</b> (optionally <b>Actions: Read</b> to see publish status).</li>
              <li>Generate, copy and paste it below.</li>
            </ol>
          </>
        )}

        {(vault !== undefined || busy) && (
          <form onSubmit={submit}>
            {current === 'setup' && (
              <Field label="GitHub token">
                <input type="password" autoComplete="off" placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
              </Field>
            )}
            <Field label="Username">
              <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Password">
              <input
                type="password"
                autoComplete={current === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {current === 'setup' && (
              <>
                <Field label="Confirm password">
                  <input type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
                </Field>
                <p className="hint">At least 10 characters. Use a strong, unique password: the encrypted key file is public.</p>
              </>
            )}
            <label className="check">
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              Keep me signed in on this device
            </label>
            {(problem || error) && <p className="admin__msg admin__msg--error" role="alert">{problem || error}</p>}
            <button className="btn btn--primary btn--block" disabled={!!busy || !username || !password}>
              {busy || (current === 'login' ? 'Sign in' : 'Save login & sign in')}
            </button>
            {vault && (
              <p className="hint signin__switch">
                {current === 'login' ? (
                  <button type="button" className="link-btn" onClick={() => { setMode('setup'); setProblem('') }}>
                    Forgot your password or token expired? Set up again
                  </button>
                ) : (
                  <button type="button" className="link-btn" onClick={() => { setMode('login'); setProblem('') }}>
                    Back to sign in
                  </button>
                )}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
