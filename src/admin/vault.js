// Keeps the GitHub token encrypted with the admin's username + password, so
// signing in only needs those. The encrypted file (public/admin-key.json) is
// public, so the password must be strong: PBKDF2 slows down guessing, but
// cannot save a weak password.

const ITERATIONS = 600000
const enc = new TextEncoder()
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function deriveKey(username, password, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', enc.encode(`${username.trim().toLowerCase()}\n${password}`), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function lockToken(username, password, token) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(username, password, salt, ITERATIONS)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(token))
  return { version: 1, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(data) }
}

// Throws when the username or password is wrong (AES-GCM authentication fails).
export async function unlockToken(vault, username, password) {
  const key = await deriveKey(username, password, unb64(vault.salt), vault.iterations)
  try {
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(vault.iv) }, key, unb64(vault.data))
    return new TextDecoder().decode(data)
  } catch {
    throw new Error('Wrong username or password.')
  }
}

export async function fetchVault() {
  try {
    const r = await fetch(`./admin-key.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return null
    const vault = await r.json()
    return vault?.data && vault?.salt && vault?.iv ? vault : null
  } catch {
    return null
  }
}

export function passwordProblem(username, password, confirm) {
  if (username.trim().length < 3) return 'Username must be at least 3 characters.'
  if (password.length < 10) return 'Password must be at least 10 characters. Longer is safer, since the encrypted key file is public.'
  if (password.toLowerCase().includes(username.trim().toLowerCase())) return 'Password must not contain the username.'
  if (password !== confirm) return 'Passwords do not match.'
  return ''
}
