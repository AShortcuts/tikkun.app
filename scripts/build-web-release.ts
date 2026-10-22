import { readFile, mkdir, writeFile, readdir, lstat, rename } from 'node:fs/promises'
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { updateConfig } from './update-config.mjs'
import { assertNativeTarget, readNativeTarget, targetFromArchive } from './native-update-target.ts'
import { compareReleaseVersions, nativeFeedKey, parseBundledAppRelease } from '../app/updates/release-identity.ts'
import { allocateReleaseBuild } from './release-build.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const option = (key: string) => args[args.indexOf(key) + 1]
const nativeBuild = args.includes('--native-build') ? option('--native-build') : ''
const rollout = Number(args.includes('--rollout') ? option('--rollout') : 0)
if (!/^\d+$/.test(nativeBuild) || !Number.isInteger(rollout) || rollout < 0 || rollout > 100) throw new Error('Use --native-build NUMBER [--rollout 0..100]')
if (!args.includes('--approve-web-only')) throw new Error('Review changes for native compatibility and store eligibility, then pass --approve-web-only')
if (args.includes('--target-archive') === args.includes('--target-record')) throw new Error('Supply exactly one --target-archive or --target-record from the distributed native archive')
const keyFile = process.env.TIKKUN_UPDATE_PRIVATE_KEY_FILE
if (!keyFile) throw new Error('Set TIKKUN_UPDATE_PRIVATE_KEY_FILE outside the public web tree')
const config = updateConfig()
if (!config.enabled) throw new Error('Set TIKKUN_UPDATE_PUBLIC_KEY_FILE to the key installed in the target binary')
const key = createPrivateKey(await readFile(keyFile))
if (createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString().trim() !== config.publicKey) throw new Error('Update signing keys do not match')
const source = path.join(root, 'dist-native')
await readFile(path.join(source, 'reader/index.html'))
const target = args.includes('--target-record')
  ? await readNativeTarget(path.resolve(option('--target-record')), config.publicKey)
  : await targetFromArchive(path.resolve(option('--target-archive')), nativeBuild, config.publicKey)
assertNativeTarget(target, JSON.parse(await readFile(path.join(source, 'native-update-contract.json'), 'utf8')), config.publicKey, nativeBuild)
const bundled = parseBundledAppRelease(JSON.parse(await readFile(path.join(source, 'app-release.json'), 'utf8')))
if (nativeFeedKey(bundled.target) !== nativeFeedKey(target)) throw new Error('Bundled app release targets another native archive')
const minimum = await allocateReleaseBuild(root, 'web', { local: true })
if (bundled.release.build < minimum.build || compareReleaseVersions(bundled.release.version, minimum.version) < 0) {
  throw new Error('Web release must advance its version and build beyond previous tests and releases; rebuild with --web-release')
}
let total = 0
async function inspect(directory: string) {
  for (const entry of await readdir(directory)) {
    const file = path.join(directory, entry)
    const stat = await lstat(file)
    if (stat.isSymbolicLink()) throw new Error('Web releases must not contain symlinks')
    if (stat.isDirectory()) await inspect(file)
    else { total += stat.size; if (/\.(pem|key|p12|p8|mp3|m4a)$/i.test(file)) throw new Error('Unexpected secret or audio in web release') }
  }
}
await inspect(source)
if (total > 50 * 1024 * 1024) console.warn(`Web release is ${total} bytes unpacked; recommended budget is 50 MiB`)
const output = path.join(root, '.asc/updates/web', nativeFeedKey(target))
await mkdir(output, { recursive: true })
const temporary = path.join(output, `package-${Date.now()}.zip`)
// Pages includes Python, but its build image does not include the zip executable.
const zip = spawnSync('python3', ['-m', 'zipfile', '-c', temporary, ...(await readdir(source)).sort()], { cwd: source, stdio: 'inherit' })
if (zip.error) throw zip.error
if (zip.status !== 0) throw new Error('Could not package native web assets')
const bytes = await readFile(temporary)
const checksum = createHash('sha256').update(bytes).digest('hex')
const signature = sign('sha256', bytes, key).toString('base64')
if (!verify('sha256', bytes, config.publicKey, Buffer.from(signature, 'base64'))) throw new Error('Release signature failed local verification')
const payload = JSON.stringify({ schema: 1, channel: 'production', nativeBuild,
  ...(target.nativeVersion ? { nativeVersion: target.nativeVersion } : {}), release: bundled.release, bundleId: checksum,
  checksum, signature, bytes: bytes.length, rollout })
await rename(temporary, path.join(output, `${checksum}.zip`))
await writeFile(path.join(output, 'latest.json'), `${JSON.stringify({ payload, signature: sign('sha256', Buffer.from(payload), key).toString('base64') })}\n`)
console.log(JSON.stringify({ output, nativeBuild, release: bundled.release, checksum, bytes: bytes.length, rollout, published: false }))
