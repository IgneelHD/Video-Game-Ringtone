# 🎮 Game Tones

A flat, modern React + Vite site listing video game sounds that make great ringtones,
each with a download button in its top-right corner.

- **Free download**: 14 original chiptune tones (`public/sounds/*.mp3`), playable in-page and
  downloadable directly. Composed for this project and released under **CC0**.
- **Iconic classics**: 22 famous game sounds (Mario coin, Zelda secret, MGS alert…). These are
  copyrighted, so they are not hosted here; the corner button opens a public archive
  (MyInstants, The Sounds Resource, Internet Archive) where they can be found.

Filter by category (Ringtone / Notification / Alarm / Message), by source, or search. Light and dark themes.

## Develop

```bash
npm install
npm run dev       # local dev server
npm run build     # production build in dist/ (relative paths, works on GitHub Pages)
npm run sounds    # regenerate the original tones (needs ffmpeg for MP3)
```

## Adding sounds

Edit `src/data/sounds.js`. For a new original tone, add a melody to `scripts/generate-sounds.mjs`,
run `npm run sounds`, then add a `free(...)` entry. For a well-known game sound, add an `iconic(...)` entry
with a search query for the public source.
