import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { object } from '../app/updates/content-schema.ts'
import { verifyReleaseEnvelope } from '../app/updates/release-signature.ts'
import { signUpdateManifest } from './sign-update.ts'
import { updateConfig } from './update-config.mjs'
import { nativeFeedKey, parseBundledAppRelease, validReleaseVersion } from '../app/updates/release-identity.ts'

const digest = /^[a-f0-9]{64}$/
export interface NativeUpdateContract {
  schema: 1 | 2
  nativeDigest: string
  publicKeyDigest: string
}
export interface NativeUpdateTarget {
  schema: 1
  kind: 'native-update-target'
  nativeBuild: string
  nativeVersion?: string
  contract: NativeUpdateContract
}

function parseContract(value: unknown): NativeUpdateContract {
  if (!object(value) || (value.schema !== 1 && value.schema !== 2) || typeof value.nativeDigest !== 'string' || !digest.test(value.nativeDigest) ||
      typeof value.publicKeyDigest !== 'string' || !digest.test(value.publicKeyDigest)) throw new Error('Invalid native update contract')
  return { schema: value.schema === 1 ? 1 : 2, nativeDigest: value.nativeDigest, publicKeyDigest: value.publicKeyDigest }
}

export async function readNativeTarget(file: string, publicKey: string): Promise<NativeUpdateTarget> {
  const value = await verifyReleaseEnvelope(JSON.parse(await readFile(file, 'utf8')), publicKey)
  if (!object(value) || value.schema !== 1 || value.kind !== 'native-update-target' ||
      typeof value.nativeBuild !== 'string' || !/^\d+$/.test(value.nativeBuild)) throw new Error('Invalid native update target')
  if (value.nativeVersion !== undefined && !validReleaseVersion(value.nativeVersion)) throw new Error('Invalid native target version')
  return { schema: 1, kind: 'native-update-target', nativeBuild: value.nativeBuild,
    ...(value.nativeVersion ? { nativeVersion: value.nativeVersion } : {}), contract: parseContract(value.contract) }
}

export function assertNativeTarget(target: NativeUpdateTarget, source: unknown, publicKey: string, nativeBuild = target.nativeBuild) {
  const contract = parseContract(source)
  if (target.nativeBuild !== nativeBuild) throw new Error('Native target does not match the selected native build')
  if (target.contract.publicKeyDigest !== createHash('sha256').update(publicKey.trim()).digest('hex')) throw new Error('Signing key is not installed in the native target')
  if (target.contract.schema !== contract.schema || target.contract.nativeDigest !== contract.nativeDigest || target.contract.publicKeyDigest !== contract.publicKeyDigest) {
    throw new Error(`Native code, configuration or signing key differs from build ${nativeBuild}; ship a matching iOS build and export its target record`)
  }
}

type ReadPlist = (file: string, field: string) => string
const readPlist: ReadPlist = (file, field) => execFileSync('/usr/bin/plutil', ['-extract', field, 'raw', '-o', '-', file], { encoding: 'utf8' }).trim()

export async function targetFromArchive(archive: string, nativeBuild: string, publicKey: string, plist: ReadPlist = readPlist): Promise<NativeUpdateTarget> {
  if (!/^\d+$/.test(nativeBuild)) throw new Error('Use --native-build NUMBER')
  const app = path.join(archive, 'Products/Applications/App.app')
  const info = path.join(app, 'Info.plist')
  if (plist(info, 'CFBundleVersion') !== nativeBuild) throw new Error('Target archive does not match the selected native build')
  if (plist(info, 'CFBundleSupportedPlatforms.0') !== 'iPhoneOS') throw new Error('Target must be a device archive, not a Simulator app')
  const contract = parseContract(JSON.parse(await readFile(path.join(app, 'public/native-update-contract.json'), 'utf8')))
  const config = JSON.parse(await readFile(path.join(app, 'capacitor.config.json'), 'utf8'))
  if (config.plugins?.LiveUpdate?.publicKey !== publicKey.trim()) throw new Error('Signing key is not installed in the target archive')
  const target: NativeUpdateTarget = { schema: 1, kind: 'native-update-target', nativeBuild, contract }
  let metadata: string | undefined
  try { metadata = await readFile(path.join(app, 'public/app-release.json'), 'utf8') }
  catch (error) { if (!object(error) || error.code !== 'ENOENT') throw error }
  if (metadata !== undefined) {
    const bundled = parseBundledAppRelease(JSON.parse(metadata))
    if (bundled.target.nativeBuild !== nativeBuild) throw new Error('Archive is a test build for an existing native target; use the released native archive')
    if (bundled.target.nativeVersion) {
      if (bundled.target.nativeVersion !== plist(info, 'CFBundleShortVersionString')) throw new Error('Archive native version does not match its bundled target')
      target.nativeVersion = bundled.target.nativeVersion
    }
  }
  assertNativeTarget(target, contract, publicKey)
  return target
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: {
    'native-build': { type: 'string' }, 'target-archive': { type: 'string' }, output: { type: 'string' },
  } })
  if (!values['native-build'] || !values['target-archive']) throw new Error('Use updates:target -- --native-build NUMBER --target-archive PATH [--output PATH]')
  const target = await targetFromArchive(path.resolve(values['target-archive']), values['native-build'], updateConfig().publicKey)
  const output = path.resolve(values.output ?? fileURLToPath(new URL('../config/native-update-target.json', import.meta.url)))
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(await signUpdateManifest(target))}\n`)
  console.log(JSON.stringify({ output, nativeBuild: target.nativeBuild, nativeChannel: nativeFeedKey(target), exported: true, published: false }))
}
