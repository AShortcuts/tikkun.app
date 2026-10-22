import { createHash, verify } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { contentCompatibility, object, parseContentSnapshot } from '../app/updates/content-schema.ts'
import { verifyReleaseEnvelope } from '../app/updates/release-signature.ts'
import { verifyWebRelease } from '../app/updates/web-update.ts'
import { nativeFeedKey, updateFeedPath as feedPath } from '../app/updates/release-identity.ts'

const digestPattern = /^[a-f0-9]{64}$/
const maxFileBytes = 25 * 1024 * 1024
const maxIndexBytes = 2 * 1024 * 1024
export interface FeedFile { path: string; bytes: number; checksum: string }
interface FeedIndex { schema: 1; kind: 'update-feed-index'; files: FeedFile[] }
const checksum = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

async function regularFile(file: string) {
  if (!(await lstat(file)).isFile()) throw new Error(`Update asset must be a regular file: ${file}`)
  return readFile(file)
}

export async function inspectUpdateFeeds(directory: string, publicKey: string): Promise<FeedIndex> {
  const files: FeedFile[] = []
  async function visit(prefix = '') {
    for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) { await visit(relative); continue }
      if (!entry.isFile()) throw new Error(`Unexpected update asset: ${relative}`)
      if (relative === 'index.json') continue
      if (!feedPath.test(relative)) throw new Error(`Unexpected update asset: ${relative}`)
      const data = await regularFile(path.join(directory, relative))
      const hash = checksum(data)
      if (data.length === 0 || data.length > maxFileBytes) throw new Error(`Update asset exceeds Pages file limits: ${relative}`)
      if (!relative.endsWith('/latest.json') && path.basename(relative).split('.')[0] !== hash) throw new Error(`Corrupted immutable update: ${relative}`)
      files.push({ path: relative, bytes: data.length, checksum: hash })
    }
  }
  await visit()
  const byPath = new Map(files.map(file => [file.path, file]))
  for (const file of files.filter(file => file.path.endsWith('/latest.json'))) {
    const envelope = JSON.parse(await readFile(path.join(directory, file.path), 'utf8'))
    const folder = path.posix.dirname(file.path)
    if (file.path.startsWith('web/')) {
      const release = await verifyWebRelease(envelope, publicKey)
      const zip = byPath.get(`${folder}/${release.bundleId}.zip`)
      if (folder !== `web/${nativeFeedKey(release)}` || zip?.bytes !== release.bytes || zip.checksum !== release.checksum) throw new Error(`Invalid web feed: ${file.path}`)
      if (!verify('sha256', await readFile(path.join(directory, `${folder}/${release.bundleId}.zip`)), publicKey, Buffer.from(release.signature, 'base64'))) throw new Error(`Invalid web ZIP signature: ${file.path}`)
    } else {
      const release = await verifyReleaseEnvelope(envelope, publicKey)
      if (!object(release) || release.schema !== 1 || typeof release.digest !== 'string' || !digestPattern.test(release.digest) ||
          byPath.get(`${folder}/${release.digest}.json`)?.bytes !== release.bytes) throw new Error(`Invalid content feed: ${file.path}`)
      const snapshot = parseContentSnapshot(JSON.parse(await readFile(path.join(directory, `${folder}/${release.digest}.json`), 'utf8')))
      if (folder !== `content/${await contentCompatibility(snapshot)}`) throw new Error(`Invalid content compatibility: ${file.path}`)
    }
  }
  return { schema: 1, kind: 'update-feed-index', files: files.sort((a, b) => a.path.localeCompare(b.path, 'en')) }
}

async function download(url: URL, fetcher: typeof fetch, limit: number, allowMissing = false) {
  const response = await fetcher(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000) })
  if (response.status === 404 && allowMissing) return null
  if (!response.ok || !response.body || response.headers.get('content-type')?.includes('text/html')) throw new Error(`Could not retain update asset: ${url.pathname} (HTTP ${response.status})`)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) { await reader.cancel(); throw new Error(`Update download exceeds expected size: ${url.pathname}`) }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

function parseIndex(value: unknown): FeedIndex {
  if (!object(value) || value.schema !== 1 || value.kind !== 'update-feed-index' || !Array.isArray(value.files)) throw new Error('Invalid update history index')
  const seen = new Set<string>()
  const files = value.files.map((file: unknown): FeedFile => {
    if (!object(file) || typeof file.path !== 'string' || !feedPath.test(file.path) || seen.has(file.path) ||
        typeof file.bytes !== 'number' || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || file.bytes > maxFileBytes ||
        typeof file.checksum !== 'string' || !digestPattern.test(file.checksum)) throw new Error('Invalid update history entry')
    seen.add(file.path)
    return { path: file.path, bytes: file.bytes, checksum: file.checksum }
  })
  return { schema: 1, kind: 'update-feed-index', files }
}

export async function restoreUpdateFeeds(directory: string, origin: string, publicKey: string, options: {
  fetcher?: typeof fetch
  manual?: boolean
} = {}) {
  const base = new URL(origin)
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('Update history requires an HTTPS origin')
  const fetcher = options.fetcher ?? fetch
  const indexBytes = await download(new URL('/updates/index.json', base), fetcher, maxIndexBytes, true)
  // The first automated deployment bootstraps from the verified feeds in Git.
  if (!indexBytes) return { restored: 0, bootstrap: true }
  const index = parseIndex(await verifyReleaseEnvelope(JSON.parse(indexBytes.toString('utf8')), publicKey))
  for (const file of index.files) {
    const destination = path.join(directory, file.path)
    let local: Buffer | null = null
    try { local = await regularFile(destination) }
    catch (error) { if (!object(error) || error.code !== 'ENOENT') throw error }
    if (local && options.manual && file.path.endsWith('/latest.json')) continue
    if (local && local.length === file.bytes && checksum(local) === file.checksum) continue
    const bytes = await download(new URL(`/updates/${file.path}`, base), fetcher, file.bytes)
    if (!bytes || bytes.length !== file.bytes || checksum(bytes) !== file.checksum) throw new Error(`Corrupted retained update: ${file.path}`)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, bytes)
  }
  return { restored: index.files.length, bootstrap: false }
}
