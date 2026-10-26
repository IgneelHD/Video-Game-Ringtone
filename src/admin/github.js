// Minimal GitHub REST client for the admin page. The site is static, so the
// repository is the database: edits are saved as one commit, and the Pages
// workflow redeploys the site from it.

export const OWNER = 'IgneelHD'
export const REPO = 'Video-Game-Ringtone'
export const DATA_PATH = 'src/data/sounds.json'
export const UPLOAD_DIR = 'public/sounds'

const API = `https://api.github.com/repos/${OWNER}/${REPO}`

const toBase64 = (bytes) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const fromBase64 = (b64) => Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0))

export class GitHub {
  constructor(token) {
    this.token = token
  }

  async request(path, options = {}) {
    const r = await fetch(path.startsWith('http') ? path : API + path, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    if (!r.ok) {
      const detail = await r.json().catch(() => ({}))
      const message =
        r.status === 401 ? 'GitHub rejected the token. Check it is correct and not expired.'
        : r.status === 403 || r.status === 404 ? 'This token cannot access the repository. It needs "Contents: Read and write" on ' + `${OWNER}/${REPO}.`
        : detail.message || `GitHub error ${r.status}`
      throw Object.assign(new Error(message), { status: r.status })
    }
    return r.status === 204 ? null : r.json()
  }

  async load() {
    const repo = await this.request('')
    if (!repo.permissions?.push) throw new Error(`This token can read ${OWNER}/${REPO} but cannot write to it.`)
    const branch = repo.default_branch
    const file = await this.request(`/contents/${DATA_PATH}?ref=${encodeURIComponent(branch)}`)
    const data = JSON.parse(new TextDecoder().decode(fromBase64(file.content)))
    return { branch, data, dataSha: file.sha }
  }

  // Writes sounds.json, adds uploaded files and removes deleted ones in one commit.
  async save({ branch, dataSha, data, uploads, deletes, message }) {
    const current = await this.request(`/contents/${DATA_PATH}?ref=${encodeURIComponent(branch)}`)
    if (current.sha !== dataSha) {
      throw new Error('The sound list was changed somewhere else since you opened it. Reload to get the latest version (your unsaved edits will be lost).')
    }
    const ref = await this.request(`/git/ref/heads/${encodeURIComponent(branch)}`)
    const head = await this.request(`/git/commits/${ref.object.sha}`)

    const blob = async (content, encoding) => (await this.request('/git/blobs', { method: 'POST', body: { content, encoding } })).sha
    const tree = [
      { path: DATA_PATH, mode: '100644', type: 'blob', sha: await blob(JSON.stringify(data, null, 2) + '\n', 'utf-8') },
    ]
    for (const u of uploads) {
      const bytes = new Uint8Array(await u.file.arrayBuffer())
      tree.push({ path: u.path, mode: '100644', type: 'blob', sha: await blob(toBase64(bytes), 'base64') })
    }
    for (const path of deletes) tree.push({ path, mode: '100644', type: 'blob', sha: null })

    const newTree = await this.request('/git/trees', { method: 'POST', body: { base_tree: head.tree.sha, tree } })
    const commit = await this.request('/git/commits', {
      method: 'POST',
      body: { message, tree: newTree.sha, parents: [ref.object.sha] },
    })
    await this.request(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: { sha: commit.sha } })
    const saved = await this.request(`/contents/${DATA_PATH}?ref=${encodeURIComponent(commit.sha)}`)
    return { commit: commit.sha, dataSha: saved.sha }
  }

  // Creates or replaces one text file in a single commit.
  async putFile(branch, path, text, message) {
    let sha
    try {
      sha = (await this.request(`/contents/${path}?ref=${encodeURIComponent(branch)}`)).sha
    } catch (e) {
      if (e.status !== 404) throw e
    }
    const bytes = new TextEncoder().encode(text)
    await this.request(`/contents/${path}`, { method: 'PUT', body: { message, content: toBase64(bytes), branch, sha } })
  }

  // Latest Pages deploy for a commit; needs "Actions: Read" on the token, so failures are ignored.
  async deployStatus(sha) {
    try {
      const runs = await this.request(`/actions/runs?head_sha=${sha}&per_page=1`)
      const run = runs.workflow_runs?.[0]
      return run ? { status: run.status, conclusion: run.conclusion, url: run.html_url } : null
    } catch {
      return null
    }
  }
}
