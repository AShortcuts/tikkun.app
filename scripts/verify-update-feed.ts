import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash, verify } from 'node:crypto'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { verifyWebRelease } from '../app/updates/web-update.ts'
import { verifyReleaseEnvelope } from '../app/updates/release-signature.ts'
import { contentCompatibility, object, parseContentSnapshot } from '../app/updates/content-schema.ts'
import { updateConfig } from './update-config.mjs'

const { values } = parseArgs({ options: {
  'native-build': { type: 'string' }, origin: { type: 'string', default: 'https://tikkunreader.com' },
} })
const build = values['native-build']
if (!build || !/^\d+$/.test(build)) throw new Error('Use --native-build NUMBER [--origin HTTPS_ORIGIN]')
const origin = new URL(values.origin!)
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
  throw new Error('Verification requires an HTTPS origin without credentials or a path')
}
const key = updateConfig().publicKey
const { compatibility } = JSON.parse(await readFile(fileURLToPath(new URL('../generated/native-content-contract.json', import.meta.url)), 'utf8'))
assert.match(compatibility, /^[a-f0-9]{64}$/)

async function download(path: string, maxBytes: number) {
  const response = await fetch(new URL(path, origin), { redirect: 'error', credentials: 'omit',
    cache: 'no-store', signal: AbortSignal.timeout(60_000), headers: { Origin: 'capacitor://localhost' } })
  assert.equal(response.status, 200, `HTTP status: ${path}`)
  assert.match(response.headers.get('content-type') ?? '', path.endsWith('.zip') ? /application\/zip/ : /application\/json/)
  assert.equal(response.headers.get('access-control-allow-origin'), 'capacitor://localhost')
  assert.match(response.headers.get('cache-control') ?? '', path.endsWith('/latest.json') ? /no-store/ : /immutable/)
  assert.ok(response.body, `Missing response body: ${path}`)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytes += chunk.value.byteLength
    if (bytes > maxBytes) { await reader.cancel(); throw new Error(`Response exceeds signed/manifest byte limit: ${path}`) }
    chunks.push(chunk.value)
  }
  return Buffer.concat(chunks)
}

const webPrefix = `/updates/web/${build}`
const web = await verifyWebRelease(JSON.parse((await download(`${webPrefix}/latest.json`, 16_384)).toString('utf8')), key)
assert.equal(web.nativeBuild, build)
const zip = await download(`${webPrefix}/${web.bundleId}.zip`, web.bytes)
assert.equal(zip.length, web.bytes)
assert.equal(createHash('sha256').update(zip).digest('hex'), web.checksum)
assert.ok(verify('sha256', zip, key, Buffer.from(web.signature, 'base64')), 'Web ZIP signature')

const contentPrefix = `/updates/content/${compatibility}`
const content = await verifyReleaseEnvelope(JSON.parse((await download(`${contentPrefix}/latest.json`, 4096)).toString('utf8')), key)
if (!object(content) || content.schema !== 1 || typeof content.digest !== 'string' || !/^[a-f0-9]{64}$/.test(content.digest) ||
    typeof content.bytes !== 'number' || !Number.isSafeInteger(content.bytes) || content.bytes <= 0) throw new Error('Invalid content release')
const snapshot = await download(`${contentPrefix}/${content.digest}.json`, content.bytes)
assert.equal(snapshot.length, content.bytes)
assert.equal(createHash('sha256').update(snapshot).digest('hex'), content.digest)
assert.equal(await contentCompatibility(parseContentSnapshot(JSON.parse(snapshot.toString('utf8')))), compatibility)

const missing = await fetch(new URL('/updates/web/invalid/latest.json', origin), { redirect: 'error', signal: AbortSignal.timeout(15_000) })
assert.equal(missing.status, 404, 'Missing feed must not return homepage HTML')
await missing.body?.cancel()
console.log(JSON.stringify({ verified: true, origin: origin.origin, nativeBuild: build, bundleId: web.bundleId,
  contentDigest: content.digest, rollout: web.rollout, webBytes: zip.length, contentBytes: snapshot.length, missingFeed: 404 }))
