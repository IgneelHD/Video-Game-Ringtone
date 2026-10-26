// Searches real sound catalogs straight from the browser, like tape-studio:
//  - Deezer and iTunes: the music catalogs, including game soundtracks. Each
//    track has an official 30-second preview clip, a ringtone-sized length.
//    Both are queried over JSONP, which they document for cross-site use.
//  - Openverse: freely licensed sound effects and music (Freesound, Jamendo,
//    ccMixter…), limited to those categories so podcasts and spoken word
//    recordings stay out.
// Popular sites without a public search API are offered as "search there" links.
import { normalize } from './freeAudio.js'

export const MAX_SECONDS = 60

export const SOURCE_COLORS = {
  Deezer: '#a238ff',
  iTunes: '#fa2d48',
  Freesound: '#e5484d',
  Jamendo: '#d6336c',
  ccMixter: '#7c5cff',
  'Wikimedia Commons': '#0f9d74',
}

const OPENVERSE_SOURCES = {
  freesound: 'Freesound',
  jamendo: 'Jamendo',
  ccmixter: 'ccMixter',
  wikimedia_audio: 'Wikimedia Commons',
}

export const EXTERNAL_SITES = [
  { name: 'MyInstants', url: (q) => `https://www.myinstants.com/en/search/?name=${encodeURIComponent(q)}` },
  { name: 'Zedge', url: (q) => `https://www.zedge.net/find/ringtones/${encodeURIComponent(q)}` },
  { name: 'Pixabay', url: (q) => `https://pixabay.com/sound-effects/search/${encodeURIComponent(q)}/` },
  { name: 'Freesound', url: (q) => `https://freesound.org/search/?q=${encodeURIComponent(q)}` },
  { name: 'The Sounds Resource', url: (q) => `https://www.sounds-resource.com/search/?q=${encodeURIComponent(q)}` },
  { name: 'KHInsider', url: (q) => `https://downloads.khinsider.com/search?search=${encodeURIComponent(q)}` },
]

// JSONP for the two fixed catalog hosts only, as in tape-studio's catalog-client.
function jsonp(url, signal) {
  const u = new URL(url)
  if (!['itunes.apple.com', 'api.deezer.com'].includes(u.hostname)) return Promise.reject(new Error('Unsupported host'))
  return new Promise((resolve, reject) => {
    const name = `gtCatalog_${Math.random().toString(36).slice(2)}`
    const script = document.createElement('script')
    const clean = () => { script.remove(); clearTimeout(timer); delete window[name]; signal?.removeEventListener('abort', abort) }
    const abort = () => { clean(); reject(new DOMException('Aborted', 'AbortError')) }
    const timer = setTimeout(() => { clean(); reject(new Error('Timed out')) }, 12000)
    window[name] = (data) => { clean(); resolve(data) }
    u.searchParams.set('callback', name)
    if (u.hostname === 'api.deezer.com') u.searchParams.set('output', 'jsonp')
    script.src = u.href
    script.onerror = () => { clean(); reject(new Error('Network error')) }
    signal?.addEventListener('abort', abort)
    document.head.appendChild(script)
  })
}

async function getJson(url, signal) {
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

async function deezer(q, signal) {
  const data = await jsonp(`https://api.deezer.com/search/track?q=${encodeURIComponent(q)}&limit=25`, signal)
  if (data.error) throw new Error(data.error.message || 'Deezer error')
  return (data.data || [])
    .filter((t) => t.preview)
    .map((t) => ({
      title: t.title,
      creator: t.artist?.name || '',
      album: t.album?.title || '',
      image: t.album?.cover_medium || '',
      source: 'Deezer',
      license: '30s official preview',
      url: t.preview,
      page: t.link,
      duration: 30,
      file: `${t.id}.mp3`,
    }))
}

async function itunes(q, signal) {
  const data = await jsonp(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=25&country=US`, signal)
  return (data.results || [])
    .filter((t) => t.previewUrl)
    .map((t) => ({
      title: t.trackName,
      creator: t.artistName || '',
      album: t.collectionName || '',
      image: t.artworkUrl100 || '',
      source: 'iTunes',
      license: '30s official preview',
      url: t.previewUrl,
      page: t.trackViewUrl,
      duration: 30,
      file: `${t.trackId}.m4a`,
    }))
}

const licenseLabel = (code, version) =>
  code === 'cc0' ? 'CC0' : code === 'pdm' ? 'Public domain' : `CC ${code.toUpperCase()}${version ? ` ${version}` : ''}`

async function openverse(q, signal) {
  const u = new URL('https://api.openverse.org/v1/audio/')
  u.searchParams.set('q', q)
  u.searchParams.set('category', 'sound_effect,music')
  u.searchParams.set('page_size', '40')
  const data = await getJson(u.href, signal)
  return (data.results || [])
    .filter((r) => r.url && r.duration > 0 && r.duration / 1000 <= MAX_SECONDS)
    .map((r) => ({
      title: r.title || 'Untitled',
      creator: r.creator || '',
      album: '',
      image: r.thumbnail || '',
      source: OPENVERSE_SOURCES[r.source] || r.source_name || 'Openverse',
      license: licenseLabel(r.license || '', r.license_version),
      url: r.url,
      page: r.foreign_landing_url || r.url,
      duration: r.duration / 1000,
      file: r.url.split('?')[0].split('/').pop() || `${r.id}.${r.filetype || 'mp3'}`,
    }))
}

const SEARCHERS = { Deezer: deezer, iTunes: itunes, Openverse: openverse }

// Interleaves the sources so none floods the list, and drops a track that both
// Deezer and iTunes return.
export async function searchOpenSources(query, signal) {
  const names = Object.keys(SEARCHERS)
  const settled = await Promise.allSettled(names.map((n) => SEARCHERS[n](query, signal)))
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const failed = names.filter((_, i) => settled[i].status === 'rejected')
  const lists = settled.map((r) => (r.status === 'fulfilled' ? r.value : []))
  const seen = new Set()
  const results = []
  for (let i = 0; lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      const item = list[i]
      if (!item) continue
      const key = item.source === 'Deezer' || item.source === 'iTunes' ? `track|${normalize(item.title)}|${normalize(item.creator)}` : item.url
      if (seen.has(key)) continue
      seen.add(key)
      results.push({ ...item, id: `ext-${results.length}-${item.url}`, color: SOURCE_COLORS[item.source] || '' })
    }
  }
  return { results, failed }
}
