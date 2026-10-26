// Finds a freely licensed recording of a sound on Wikimedia Commons or the
// Internet Archive and downloads it. Same approach as tape-studio's free-audio:
// only Creative Commons / public-domain files are accepted.

const AUDIO_EXT = /\.(mp3|ogg|oga|flac|wav|m4a|opus)$/i

const plain = (s) =>
  String(Array.isArray(s) ? s.join(', ') : s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')

// Archive lengths come as seconds ("83.5") or clock time ("1:23", "1:02:03").
export const seconds = (v) => String(v || '').split(':').reduce((t, part) => t * 60 + (Number(part) || 0), 0)

export const normalize = (s) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '')

export function freeLicense(raw) {
  try {
    const u = new URL(raw)
    if (!['creativecommons.org', 'www.creativecommons.org'].includes(u.hostname)) return false
    return /^\/(licenses\/(by|by-sa|by-nc|by-nc-sa|by-nd|by-nc-nd)\/\d\.\d|publicdomain\/(zero|mark)\/1\.0)\//.test(u.pathname)
  } catch {
    return false
  }
}

const licenseName = (url) =>
  url.includes('/publicdomain/') ? 'Public domain' : `CC ${url.match(/\/licenses\/([^/]+)/)?.[1].toUpperCase() || ''}`.trim()

// Every word of the query must appear in the file's title or name.
export function relevant(candidate, query) {
  const haystack = normalize(`${candidate.title} ${candidate.file}`)
  return query.split(/\s+/).filter(Boolean).every((w) => haystack.includes(normalize(w)))
}

export function commonsCandidates(data) {
  return Object.values(data.query?.pages || {}).flatMap((p) => {
    const info = p.imageinfo?.[0]
    const meta = info?.extmetadata
    if (!info || !meta || !/^(audio\/|application\/ogg)/.test(info.mime || '')) return []
    const licenseUrl = meta.LicenseUrl?.value || ''
    if (!freeLicense(licenseUrl)) return []
    const file = p.title.replace(/^File:/, '')
    return [{
      source: 'Wikimedia Commons',
      file,
      title: plain(meta.ObjectName?.value || file),
      url: info.url,
      page: info.descriptionurl,
      creator: plain(meta.Artist?.value || meta.Credit?.value),
      duration: Number(info.duration) || 0,
      license: plain(meta.LicenseShortName?.value) || licenseName(licenseUrl),
    }]
  })
}

export function archiveCandidates(id, data) {
  const meta = data.metadata || {}
  const licenseUrl = plain(meta.licenseurl)
  if (data.is_dark || meta.access_restricted === 'true' || !freeLicense(licenseUrl)) return []
  return (data.files || [])
    .filter((f) => !f.private && !f.restricted && AUDIO_EXT.test(f.name || '') && !/(sample|preview)/i.test(f.name))
    .map((f) => ({
      source: 'Internet Archive',
      file: f.name.split('/').pop(),
      title: plain(f.title || meta.title || f.name),
      url: `https://archive.org/download/${encodeURIComponent(id)}/${f.name.split('/').map(encodeURIComponent).join('/')}`,
      page: `https://archive.org/details/${encodeURIComponent(id)}`,
      creator: plain(f.creator || meta.creator),
      duration: seconds(f.length),
      license: licenseName(licenseUrl),
    }))
}

async function getJson(url, signal) {
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export async function searchFreeAudio(query, signal) {
  const q = query.replace(/["\\]/g, ' ')
  const results = []

  const commons = async () => {
    const u = new URL('https://commons.wikimedia.org/w/api.php')
    Object.entries({
      action: 'query', generator: 'search', gsrsearch: `${q} filetype:audio`, gsrnamespace: '6', gsrlimit: '10',
      prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', format: 'json', origin: '*',
    }).forEach(([k, v]) => u.searchParams.set(k, v))
    results.push(...commonsCandidates(await getJson(u.href, signal)))
  }

  const archive = async () => {
    const u = new URL('https://archive.org/advancedsearch.php')
    u.searchParams.set('q', `mediatype:audio AND licenseurl:* AND (${q})`)
    u.searchParams.set('output', 'json')
    u.searchParams.set('rows', '5')
    u.searchParams.append('fl[]', 'identifier')
    const docs = (await getJson(u.href, signal)).response?.docs || []
    await Promise.allSettled(
      docs
        .filter((d) => /^[\w.-]+$/.test(d.identifier))
        .map(async (d) => results.push(...archiveCandidates(d.identifier, await getJson(`https://archive.org/metadata/${d.identifier}`, signal)))),
    )
  }

  const outcomes = await Promise.allSettled([commons(), archive()])
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const matches = results.filter((c) => relevant(c, query))
  // Prefer MP3: it's what phones accept as a ringtone without converting.
  matches.sort((a, b) => Number(/\.mp3$/i.test(b.file)) - Number(/\.mp3$/i.test(a.file)))
  return { match: matches[0] || null, failed: outcomes.every((o) => o.status === 'rejected') }
}

export async function downloadFile(candidate, name, signal) {
  const r = await fetch(candidate.url, { signal })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const blob = await r.blob()
  const ext = candidate.file.match(AUDIO_EXT)?.[0] || '.mp3'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}${ext}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
