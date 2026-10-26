// Synthesizes the original 8-bit ringtones in public/sounds/.
// All melodies here are original compositions, released under CC0.
//
// Usage: npm run sounds   (needs ffmpeg on PATH for MP3 output)

import { writeFileSync, mkdirSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sounds')
const RATE = 44100

const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 }

function freq(note) {
  const [, name, octave] = note.match(/^([A-G]#?)(\d)$/)
  const midi = (Number(octave) + 1) * 12 + NOTE_INDEX[name]
  return 440 * 2 ** ((midi - 69) / 12)
}

const waves = {
  square: (p, duty = 0.5) => (p % 1 < duty ? 1 : -1),
  triangle: (p) => 1 - 4 * Math.abs((p % 1) - 0.5),
  saw: (p) => 2 * (p % 1) - 1,
}

// Renders one voice. `notes` is a string like "C5:1 E5:1 R:2 G5:2" (duration in beats).
function renderVoice(notes, { bpm, wave = 'square', duty = 0.5, gain = 0.3, decay = 6, slide = 0, vibrato = 0, release = 0.02 }) {
  const beat = 60 / bpm
  const out = []
  for (const token of notes.trim().split(/\s+/)) {
    const [note, beats = '1'] = token.split(':')
    const len = Math.round(Number(beats) * beat * RATE)
    const f0 = note === 'R' ? 0 : freq(note)
    let phase = 0
    for (let i = 0; i < len; i++) {
      if (!f0) { out.push(0); continue }
      const t = i / RATE
      const f = f0 * (1 + slide * t) * (1 + vibrato * Math.sin(2 * Math.PI * 6 * t))
      phase += f / RATE
      const tail = Math.min(1, (len - i) / (release * RATE))
      const attack = Math.min(1, i / (0.004 * RATE))
      const env = attack * tail * Math.exp(-decay * t)
      out.push(waves[wave](phase, duty) * env * gain)
    }
  }
  return out
}

function mix(...voices) {
  const len = Math.max(...voices.map((v) => v.length))
  const out = new Float32Array(len)
  for (const v of voices) v.forEach((s, i) => (out[i] += s))
  return out
}

function repeat(samples, times, gapSeconds = 0) {
  const gap = new Array(Math.round(gapSeconds * RATE)).fill(0)
  let out = []
  for (let i = 0; i < times; i++) out = out.concat(Array.from(samples), i < times - 1 ? gap : [])
  return Float32Array.from(out)
}

function toWav(samples) {
  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2))
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

const sounds = {
  'coin-chime': () => repeat(mix(
    renderVoice('B5:0.5 E6:3', { bpm: 400, duty: 0.25, decay: 3 }),
  ), 3, 0.35),

  'level-up': () => mix(
    renderVoice('C5:1 E5:1 G5:1 C6:1 E5:1 G5:1 C6:1 E6:1 G6:6', { bpm: 600, duty: 0.25, decay: 1.2 }),
    renderVoice('R:8 C4:6', { bpm: 600, wave: 'triangle', gain: 0.4, decay: 1 }),
  ),

  'power-up': () => mix(
    renderVoice('C5:1 G4:1 C5:1 E5:1 G5:1 E5:1 G5:1 C6:1 E6:1 C6:1 E6:1 G6:4', { bpm: 720, duty: 0.125, decay: 0.8 }),
  ),

  'extra-life': () => repeat(mix(
    renderVoice('E5:1 G5:1 E6:1 C6:1 D6:1 G6:3', { bpm: 420, duty: 0.5, decay: 0.6, gain: 0.25 }),
  ), 2, 0.4),

  'quest-complete': () => mix(
    renderVoice('G4:1 C5:1 E5:1 G5:2 E5:1 G5:5', { bpm: 360, duty: 0.25, decay: 0.5 }),
    renderVoice('C4:3 E4:2 C4:1 G3:5', { bpm: 360, wave: 'triangle', gain: 0.45, decay: 0.4 }),
  ),

  'victory-fanfare': () => mix(
    renderVoice('C5:1 C5:1 C5:1 C5:3 G#4:3 A#4:3 C5:2 A#4:1 C5:8', { bpm: 540, duty: 0.25, decay: 0.3, vibrato: 0.004 }),
    renderVoice('C4:6 G#3:3 A#3:3 C4:11', { bpm: 540, wave: 'triangle', gain: 0.45, decay: 0.2 }),
  ),

  'boss-alert': () => repeat(mix(
    renderVoice('A5:1 R:0.25 A5:1 R:0.25 A5:2', { bpm: 360, wave: 'saw', gain: 0.22, decay: 1 }),
    renderVoice('A3:4.5', { bpm: 360, wave: 'square', duty: 0.5, gain: 0.18, decay: 0.5 }),
  ), 3, 0.25),

  'low-hp-alarm': () => repeat(mix(
    renderVoice('B5:1 R:1 B5:1 R:5', { bpm: 600, duty: 0.5, gain: 0.25, decay: 0 }),
  ), 5, 0),

  'save-point': () => mix(
    renderVoice('E5:1 B5:1 G#5:1 E6:1 B5:1 G#6:6', { bpm: 300, wave: 'triangle', gain: 0.45, decay: 0.5, vibrato: 0.006 }),
    renderVoice('R:1 E5:1 B5:1 G#5:1 E6:1 B5:6', { bpm: 300, duty: 0.125, gain: 0.12, decay: 0.8 }),
  ),

  'treasure-chest': () => mix(
    renderVoice('G4:1 A4:1 B4:1 C5:1 D5:1 E5:1 F#5:1 G5:1 R:1 G5:1 B5:1 D6:8', { bpm: 660, duty: 0.25, decay: 0.6 }),
    renderVoice('R:9 G3:8', { bpm: 660, wave: 'triangle', gain: 0.45, decay: 0.5 }),
  ),

  'menu-select': () => repeat(mix(
    renderVoice('A5:1 E6:2', { bpm: 900, duty: 0.25, decay: 8 }),
  ), 2, 0.12),

  'pixel-phone': () => repeat(mix(
    renderVoice('E6:0.5 C6:0.5 E6:0.5 C6:0.5 E6:0.5 C6:0.5 E6:0.5 C6:0.5 E6:0.5 C6:0.5 E6:0.5 C6:0.5', { bpm: 240, duty: 0.5, gain: 0.22, decay: 0 }),
  ), 3, 0.8),

  'dungeon-theme': () => mix(
    renderVoice('A4:2 C5:2 E5:2 D5:1 C5:1 B4:2 G#4:2 A4:4 R:2 E5:2 F5:2 E5:1 D5:1 C5:2 B4:2 A4:6', { bpm: 280, duty: 0.25, gain: 0.22, decay: 0.3, vibrato: 0.003 }),
    renderVoice('A2:4 A2:4 E2:4 A2:6 D3:4 A2:4 E2:2 A2:6', { bpm: 280, wave: 'triangle', gain: 0.45, decay: 0.2 }),
  ),

  'space-blaster': () => repeat(mix(
    renderVoice('C7:1', { bpm: 400, wave: 'square', duty: 0.25, slide: -6, decay: 10, gain: 0.25 }),
  ), 4, 0.08),
}

mkdirSync(OUT_DIR, { recursive: true })
for (const [name, build] of Object.entries(sounds)) {
  const wav = join(OUT_DIR, `${name}.wav`)
  writeFileSync(wav, toWav(build()))
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '128k', join(OUT_DIR, `${name}.mp3`)])
    unlinkSync(wav)
    console.log(`✓ ${name}.mp3`)
  } catch {
    console.warn(`! ffmpeg unavailable, kept ${name}.wav`)
  }
}
