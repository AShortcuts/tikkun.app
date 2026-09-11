import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { createHash, verify } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { updateConfig } from './update-config.mjs'
import { verifyWebRelease } from '../app/updates/web-update.ts'
import { verifyReleaseEnvelope } from '../app/updates/release-signature.ts'
import { CONTENT_MAX_BYTES, contentCompatibility, object, parseContentSnapshot } from '../app/updates/content-schema.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const publicKey = updateConfig().publicKey
const args = process.argv.slice(2)
const nativeBuild = args[args.indexOf('--native-build') + 1]
if (!args.includes('--native-build') || !/^\d+$/.test(nativeBuild)) throw new Error('Use --native-build NUMBER')
const contract = JSON.parse(await readFile(path.join(root, 'generated/native-content-contract.json'), 'utf8'))
const compatibility: string = contract.compatibility
if (!/^[a-f0-9]{64}$/.test(compatibility)) throw new Error('Invalid content contract')

async function readRelease(channel: string, version: string) {
  const directory = path.join(root, '.asc/updates', channel, version)
  const manifest = await readFile(path.join(directory, 'latest.json'), 'utf8')
  return { directory, manifest, envelope: JSON.parse(manifest) }
}
const web = await readRelease('web', nativeBuild)
const release = await verifyWebRelease(web.envelope, publicKey)
if (release.nativeBuild !== nativeBuild) throw new Error('Web release build mismatch')
const zip = await readFile(path.join(web.directory, `${release.bundleId}.zip`))
if (zip.length !== release.bytes || createHash('sha256').update(zip).digest('hex') !== release.checksum ||
    !verify('sha256', zip, publicKey, Buffer.from(release.signature, 'base64'))) throw new Error('Invalid web ZIP')

const content = await readRelease('content', compatibility)
const metadata = await verifyReleaseEnvelope(content.envelope, publicKey)
if (!object(metadata) || metadata.schema !== 1 || typeof metadata.digest !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.digest) ||
    typeof metadata.bytes !== 'number' || !Number.isSafeInteger(metadata.bytes) || metadata.bytes <= 0) throw new Error('Invalid content manifest')
if (metadata.bytes > CONTENT_MAX_BYTES) console.warn(`Content release is ${metadata.bytes} bytes; recommended download budget is ${CONTENT_MAX_BYTES} bytes`)
const json = await readFile(path.join(content.directory, `${metadata.digest}.json`))
if (json.length !== metadata.bytes || createHash('sha256').update(json).digest('hex') !== metadata.digest) throw new Error('Invalid content bytes')
if (await contentCompatibility(parseContentSnapshot(JSON.parse(json.toString('utf8')))) !== compatibility) throw new Error('Content contract mismatch')

// Only verified public artifacts enter the website. Signing keys never do.
for (const item of [
  { channel: 'web', version: nativeBuild, name: `${release.bundleId}.zip`, bytes: zip, manifest: web.manifest },
  { channel: 'content', version: compatibility, name: `${metadata.digest}.json`, bytes: json, manifest: content.manifest },
]) {
  const destination = path.join(root, 'site/updates', item.channel, item.version)
  await mkdir(destination, { recursive: true })
  await writeFile(path.join(destination, item.name), item.bytes)
  await writeFile(path.join(destination, 'latest.json.tmp'), item.manifest)
  await rename(path.join(destination, 'latest.json.tmp'), path.join(destination, 'latest.json'))
}
console.log(JSON.stringify({ staged: true, published: false, nativeBuild, rollout: release.rollout, webBytes: zip.length, contentBytes: json.length }))
