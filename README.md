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

## Admin tools

Open `admin.html` on the live site (https://igneelhd.github.io/Video-Game-Ringtone/admin.html).

**First time:** create a fine-grained GitHub token with **Contents: Read and write** on this repository
(optionally **Actions: Read** to see publish status), paste it once, and choose a username and password.
The token is encrypted in the browser (AES-GCM, key from PBKDF2-SHA256 with 600k rounds) and saved as
`public/admin-key.json`. After that, sign in with just your username and password. That file is public,
so use a strong, unique password. When the token expires, use "Set up again" with a new token.

From there you can:

- edit a sound's title, game, year, category, description and card color;
- upload your own MP3/M4A/OGG/WAV (max 15 MB), which visitors can play and download;
- set a custom download link, or let the button search free sources;
- add, delete and reorder sounds.

**Save & publish** writes `src/data/sounds.json` and any uploaded files to the repo in one commit,
and the Pages workflow republishes the site in about a minute. Change the username/password under **Account**.

## Editing by hand

The sound list is `src/data/sounds.json`. Each sound uses one download mode: `file` (path under `public/`),
`downloadUrl` (external link), or `query` + `sourceName`/`sourceUrl` (free-source search with a fallback page).
To make more original tones, add a melody to `scripts/generate-sounds.mjs` and run `npm run sounds`.
