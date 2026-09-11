import { readFile, mkdir, writeFile, readdir, lstat, rename } from 'node:fs/promises'
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { updateConfig } from './update-config.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const option = (key: string) => args[args.indexOf(key) + 1]
const nativeBuild = args.includes('--native-build') ? option('--native-build') : ''
const rollout = Number(args.includes('--rollout') ? option('--rollout') : 0)
if (!/^\d+$/.test(nativeBuild) || !Number.isInteger(rollout) || rollout < 0 || rollout > 100) throw new Error('Use --native-build NUMBER [--rollout 0..100]')
if (!args.includes('--approve-web-only')) throw new Error('Review changes for native compatibility and store eligibility, then pass --approve-web-only')
if (!args.includes('--target-archive')) throw new Error('Supply --target-archive pointing to the distributed native archive')
const keyFile = process.env.TIKKUN_UPDATE_PRIVATE_KEY_FILE
if (!keyFile) throw new Error('Set TIKKUN_UPDATE_PRIVATE_KEY_FILE outside the public web tree')
const config = updateConfig()
if (!config.enabled) throw new Error('Set TIKKUN_UPDATE_PUBLIC_KEY_FILE to the key installed in the target binary')
const key = createPrivateKey(await readFile(keyFile))
if (createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString().trim() !== config.publicKey) throw new Error('Update signing keys do not match')
const source = path.join(root, 'dist-native')
await readFile(path.join(source, 'reader/index.html'))
const targetApp = path.join(path.resolve(option('--target-archive')), 'Products/Applications/App.app')
const version = spawnSync('/usr/bin/plutil', ['-extract', 'CFBundleVersion', 'raw', '-o', '-', path.join(targetApp, 'Info.plist')], { encoding: 'utf8' })
if (version.status !== 0 || version.stdout.trim() !== nativeBuild) throw new Error('Target archive does not match the selected native build')
const platform = spawnSync('/usr/bin/plutil', ['-extract', 'CFBundleSupportedPlatforms.0', 'raw', '-o', '-', path.join(targetApp, 'Info.plist')], { encoding: 'utf8' })
if (platform.status !== 0 || platform.stdout.trim() !== 'iPhoneOS') throw new Error('Target must be a device archive, not a Simulator app')
const sourceContract = await readFile(path.join(source, 'native-update-contract.json'), 'utf8')
const targetContract = await readFile(path.join(targetApp, 'public/native-update-contract.json'), 'utf8')
if (sourceContract !== targetContract) throw new Error('Native code, configuration or signing key differs from the target archive; ship an App Store build')
const targetConfig = JSON.parse(await readFile(path.join(targetApp, 'capacitor.config.json'), 'utf8'))
if (targetConfig.plugins?.LiveUpdate?.publicKey !== config.publicKey) throw new Error('Signing key is not installed in the target archive')
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
const output = path.join(root, '.asc/updates/web', nativeBuild)
await mkdir(output, { recursive: true })
const temporary = path.join(output, `package-${Date.now()}.zip`)
const zip = spawnSync('/usr/bin/zip', ['-q', '-r', temporary, '.'], { cwd: source, stdio: 'inherit' })
if (zip.error) throw zip.error
if (zip.status !== 0) throw new Error('Could not package native web assets')
const bytes = await readFile(temporary)
const checksum = createHash('sha256').update(bytes).digest('hex')
const signature = sign('sha256', bytes, key).toString('base64')
if (!verify('sha256', bytes, config.publicKey, Buffer.from(signature, 'base64'))) throw new Error('Release signature failed local verification')
const payload = JSON.stringify({ schema: 1, channel: 'production', nativeBuild, bundleId: checksum,
  checksum, signature, bytes: bytes.length, rollout })
await rename(temporary, path.join(output, `${checksum}.zip`))
await writeFile(path.join(output, 'latest.json'), `${JSON.stringify({ payload, signature: sign('sha256', Buffer.from(payload), key).toString('base64') })}\n`)
console.log(JSON.stringify({ output, nativeBuild, checksum, bytes: bytes.length, rollout, published: false }))
