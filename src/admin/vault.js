// Keeps the GitHub token encrypted with the admin's username + password in this
// browser's localStorage only — it is never uploaded anywhere. Signing in on a
// new device means pasting the token once there.

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

const VAULT_KEY = 'gt-admin-vault'

export function loadVault() {
  try {
    const vault = JSON.parse(localStorage.getItem(VAULT_KEY))
    return vault?.data && vault?.salt && vault?.iv ? vault : null
  } catch {
    return null
  }
}

export function saveVault(vault) {
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(vault))
  } catch {
    throw new Error('This browser blocks saving data (private mode?), so the login cannot be remembered here.')
  }
}

export function passwordProblem(username, password, confirm) {
  if (username.trim().length < 3) return 'Username must be at least 3 characters.'
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (password.toLowerCase().includes(username.trim().toLowerCase())) return 'Password must not contain the username.'
  if (password !== confirm) return 'Passwords do not match.'
  return ''
}
