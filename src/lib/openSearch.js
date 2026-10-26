// Searches open sound libraries straight from the browser. Only services
// with a public, CORS-enabled API can be queried this way:
//  - Openverse: one index over Freesound, Jamendo, ccMixter, Wikimedia and more
//  - Wikimedia Commons
//  - Internet Archive
// Popular sites without such an API are offered as "search there" links.
import { archiveCandidates, commonsCandidates } from './freeAudio.js'

const OPENVERSE_SOURCES = {
  freesound: 'Freesound',
  jamendo: 'Jamendo',
  ccmixter: 'ccMixter',
  wikimedia_audio: 'Wikimedia Commons',
  europeana: 'Europeana',
}

export const SOURCE_COLORS = {
  Freesound: '#e5484d',
  Jamendo: '#d6336c',
  ccMixter: '#7c5cff',
  'Wikimedia Commons': '#0f9d74',
  'Internet Archive': '#d97706',
  Europeana: '#0b7bd6',
}

export const EXTERNAL_SITES = [
  { name: 'MyInstants', url: (q) => `https://www.myinstants.com/en/search/?name=${encodeURIComponent(q)}` },
  { name: 'Freesound', url: (q) => `https://freesound.org/search/?q=${encodeURIComponent(q)}` },
  { name: 'Pixabay', url: (q) => `https://pixabay.com/sound-effects/search/${encodeURIComponent(q)}/` },
  { name: 'Zedge', url: (q) => `https://www.zedge.net/find/ringtones/${encodeURIComponent(q)}` },
  { name: 'The Sounds Resource', url: (q) => `https://www.sounds-resource.com/search/?q=${encodeURIComponent(q)}` },
  { name: 'Internet Archive', url: (q) => `https://archive.org/search?query=${encodeURIComponent(q)}&sin=&and[]=mediatype%3A%22audio%22` },
]

async function getJson(url, signal) {
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

const licenseLabel = (code, version) =>
  code === 'cc0' ? 'CC0' : code === 'pdm' ? 'Public domain' : `CC ${code.toUpperCase()}${version ? ` ${version}` : ''}`

async function openverse(q, signal) {
  const u = new URL('https://api.openverse.org/v1/audio/')
  u.searchParams.set('q', q)
  u.searchParams.set('page_size', '20')
  const data = await getJson(u.href, signal)
  return (data.results || [])
    .filter((r) => r.url)
    .map((r) => ({
      title: r.title || 'Untitled',
      creator: r.creator || '',
      source: OPENVERSE_SOURCES[r.source] || r.source_name || r.source || 'Openverse',
      license: licenseLabel(r.license || '', r.license_version),
      url: r.url,
      page: r.foreign_landing_url || r.url,
      duration: r.duration ? r.duration / 1000 : 0,
      file: r.url.split('?')[0].split('/').pop() || `${r.id}.${r.filetype || 'mp3'}`,
    }))
}

async function commons(q, signal) {
  const u = new URL('https://commons.wikimedia.org/w/api.php')
  Object.entries({
    action: 'query', generator: 'search', gsrsearch: `${q} filetype:audio`, gsrnamespace: '6', gsrlimit: '12',
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', format: 'json', origin: '*',
  }).forEach(([k, v]) => u.searchParams.set(k, v))
  return commonsCandidates(await getJson(u.href, signal))
}

async function archive(q, signal) {
  const u = new URL('https://archive.org/advancedsearch.php')
  u.searchParams.set('q', `(${q}) AND mediatype:audio AND licenseurl:*`)
  u.searchParams.set('output', 'json')
  u.searchParams.set('rows', '6')
  u.searchParams.append('fl[]', 'identifier')
  const docs = ((await getJson(u.href, signal)).response?.docs || []).filter((d) => /^[\w.-]+$/.test(d.identifier))
  const items = await Promise.allSettled(docs.map((d) => getJson(`https://archive.org/metadata/${d.identifier}`, signal).then((m) => archiveCandidates(d.identifier, m))))
  // Albums can hold dozens of files; keep the first two per item, MP3 first.
  return items.flatMap((r) =>
    r.status === 'fulfilled'
      ? r.value.sort((a, b) => Number(/\.mp3$/i.test(b.file)) - Number(/\.mp3$/i.test(a.file))).slice(0, 2)
      : [],
  )
}

const SEARCHERS = { Openverse: openverse, 'Wikimedia Commons': commons, 'Internet Archive': archive }

// Returns results interleaved across sources, so no single library floods the list.
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
      if (!item || seen.has(item.url)) continue
      seen.add(item.url)
      results.push({
        ...item,
        id: `ext-${results.length}-${item.url}`,
        color: SOURCE_COLORS[item.source] || '',
      })
    }
  }
  return { results, failed }
}
