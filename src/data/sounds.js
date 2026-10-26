// The sound list lives in sounds.json so the admin page (admin.html) can edit it
// through the GitHub API. Each sound has exactly one download mode:
//  - file:        an MP3 hosted in public/ — playable in-page, downloaded directly.
//  - downloadUrl: a custom link the corner button opens.
//  - query:       searches Wikimedia Commons / Internet Archive for a freely licensed
//                 recording, falling back to sourceUrl.
import data from './sounds.json'

export const CATEGORIES = data.categories

// Mode is decided by which field is present (it may still be empty while editing).
export function modeOf(sound) {
  if ('file' in sound) return 'file'
  if ('downloadUrl' in sound) return 'link'
  return 'search'
}

export const fileUrl = (path) => (/^https?:/.test(path) ? path : `${import.meta.env.BASE_URL}${path}`)

export function hostName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'external link'
  }
}

export const SOUNDS = data.sounds.map((s) => ({
  ...s,
  kind: modeOf(s) === 'file' ? 'free' : 'iconic',
  src: s.file ? fileUrl(s.file) : undefined,
}))
