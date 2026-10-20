import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { createHash, verify } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { updateConfig } from './update-config.mjs'
import { verifyWebRelease } from '../app/updates/web-update.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const publicKey = updateConfig().publicKey
const args = process.argv.slice(2)
const nativeBuild = args[args.indexOf('--native-build') + 1]
if (!args.includes('--native-build') || !/^\d+$/.test(nativeBuild)) throw new Error('Use --native-build NUMBER')

const directory = path.join(root, '.asc/updates/web', nativeBuild)
const manifest = await readFile(path.join(directory, 'latest.json'), 'utf8')
const release = await verifyWebRelease(JSON.parse(manifest), publicKey)
if (release.nativeBuild !== nativeBuild) throw new Error('Web release build mismatch')
const zip = await readFile(path.join(directory, `${release.bundleId}.zip`))
if (zip.length !== release.bytes || createHash('sha256').update(zip).digest('hex') !== release.checksum ||
    !verify('sha256', zip, publicKey, Buffer.from(release.signature, 'base64'))) throw new Error('Invalid web ZIP')

// Only verified public artifacts enter the website. Signing keys never do.
// The ZIP carries the Reader's text, cues and catalog; older content feeds stay as retained files.
const destination = path.join(root, 'site/updates/web', nativeBuild)
await mkdir(destination, { recursive: true })
await writeFile(path.join(destination, `${release.bundleId}.zip`), zip)
await writeFile(path.join(destination, 'latest.json.tmp'), manifest)
await rename(path.join(destination, 'latest.json.tmp'), path.join(destination, 'latest.json'))
console.log(JSON.stringify({ staged: true, published: false, nativeBuild, rollout: release.rollout, webBytes: zip.length }))
