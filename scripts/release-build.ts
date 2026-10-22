import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { object } from '../app/updates/content-schema.ts'
import { compareReleaseVersions, nativeFeedKey, nextReleaseVersion, parseReleaseIdentity, validReleaseVersion } from '../app/updates/release-identity.ts'
import type { BundledAppRelease, NativeReleaseTarget, ReleaseIdentity } from '../app/updates/release-identity.ts'
import { verifyWebRelease } from '../app/updates/web-update.ts'
import { readBoundedResponse } from '../app/updates/download-response.ts'
import { nativeUpdateContract } from './native-update-contract.mjs'
import { readNativeTarget } from './native-update-target.ts'
import { updateConfig } from './update-config.mjs'

export interface ReleaseBuildState extends ReleaseIdentity { nativeVersion: string }
const setting = (name: string) => new RegExp(`^(\\s*${name} = )([^;]+)(;)$`, 'gm')
const configuration = (root: string) => updateConfig({ ...process.env,
  TIKKUN_UPDATE_PUBLIC_KEY_FILE: process.env.TIKKUN_UPDATE_PUBLIC_KEY_FILE ?? path.join(root, 'config/update-public-key.pem') })

export function readProjectRelease(pbxproj: string): ReleaseIdentity {
  const read = (name: string) => {
    const values = new Set([...pbxproj.matchAll(setting(name))].map(match => match[2]))
    if (values.size !== 1) throw new Error(`Expected one ${name} value in project.pbxproj`)
    return [...values][0]
  }
  return parseReleaseIdentity({ version: read('MARKETING_VERSION'), build: Number(read('CURRENT_PROJECT_VERSION')) })
}

export function withProjectRelease(pbxproj: string, release: ReleaseIdentity): string {
  readProjectRelease(pbxproj)
  parseReleaseIdentity(release)
  return pbxproj.replace(setting('CURRENT_PROJECT_VERSION'), (_match, start, _value, end) => `${start}${release.build}${end}`)
    .replace(setting('MARKETING_VERSION'), (_match, start, _value, end) => `${start}${release.version}${end}`)
}

export function nextReleaseBuild(kind: 'test' | 'web', project: ReleaseIdentity, previous: ReleaseBuildState,
  published?: ReleaseIdentity): ReleaseBuildState {
  parseReleaseIdentity(project)
  parseReleaseIdentity(previous)
  if (!validReleaseVersion(previous.nativeVersion)) throw new Error('Invalid native version in app-release.json')
  const epoch = compareReleaseVersions(project.version, previous.nativeVersion)
  if (epoch < 0) throw new Error('Native project version is older than the recorded release; use the current source')
  if (epoch > 0 && compareReleaseVersions(project.version, previous.version) <= 0) {
    throw new Error('A new native release must advance beyond the latest tracked app release version')
  }
  const candidates = [project, ...(epoch === 0 ? [previous] : []), ...(published ? [parseReleaseIdentity(published)] : [])]
  const version = candidates.reduce((latest, item) => compareReleaseVersions(item.version, latest) > 0 ? item.version : latest, project.version)
  const release = parseReleaseIdentity({ version: kind === 'web' ? nextReleaseVersion(version) : version,
    build: Math.max(...candidates.map(item => item.build)) + 1 })
  return { nativeVersion: project.version, ...release }
}

export async function readReleaseBuildState(root: string): Promise<ReleaseBuildState> {
  const value: unknown = JSON.parse(await readFile(path.join(root, 'config/app-release.json'), 'utf8'))
  if (!object(value) || !validReleaseVersion(value.nativeVersion)) throw new Error('Invalid app release build record')
  return { nativeVersion: value.nativeVersion, ...parseReleaseIdentity(value) }
}

export async function writeReleaseBuildState(root: string, state: ReleaseBuildState) {
  await writeFile(path.join(root, 'config/app-release.json'), `${JSON.stringify(state, null, 2)}\n`)
}

export async function publishedRelease(root: string, target: NativeReleaseTarget, publicKey: string,
  options: { local?: boolean; fetcher?: typeof fetch } = {}): Promise<ReleaseIdentity | undefined> {
  const key = nativeFeedKey(target)
  let contents: string
  if (options.local) {
    try { contents = await readFile(path.join(root, 'site/updates/web', key, 'latest.json'), 'utf8') }
    catch (error) { if (object(error) && error.code === 'ENOENT') return; throw error }
  } else {
    const origin = process.env.TIKKUN_NATIVE_MEDIA_ORIGIN ?? 'https://tikkunreader.com'
    const response = await (options.fetcher ?? fetch)(`${origin}/updates/web/${key}/latest.json`, {
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15_000),
    })
    if (response.status === 404) { await response.body?.cancel(); return }
    contents = await readBoundedResponse(response, 16_384)
  }
  const release = await verifyWebRelease(JSON.parse(contents), publicKey)
  if (nativeFeedKey(release) !== key) throw new Error('Published release targets another native build')
  return release.release
}

export async function allocateReleaseBuild(root: string, kind: 'test' | 'web', options: { local?: boolean; fetcher?: typeof fetch } = {}) {
  const { release: project, target } = await bundledAppRelease(root)
  const previous = await readReleaseBuildState(root)
  const { publicKey, enabled } = configuration(root)
  const candidates = enabled ? await Promise.all([
    publishedRelease(root, target, publicKey, { local: true }),
    ...(options.local ? [] : [publishedRelease(root, target, publicKey, options)]),
  ]) : []
  const published = candidates.reduce<ReleaseIdentity | undefined>((latest, release) => {
    if (!release) return latest
    if (!latest) return release
    return { version: compareReleaseVersions(release.version, latest.version) > 0 ? release.version : latest.version,
      build: Math.max(release.build, latest.build) }
  }, undefined)
  return nextReleaseBuild(kind, project, previous, published)
}

export async function bundledAppRelease(root: string, identity?: ReleaseIdentity, testBuild = false): Promise<BundledAppRelease> {
  const project = readProjectRelease(await readFile(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8'))
  const release = identity ? parseReleaseIdentity(identity) : project
  let target: NativeReleaseTarget = { nativeVersion: project.version, nativeBuild: String(testBuild ? release.build : project.build) }
  const { publicKey, enabled } = configuration(root)
  if (enabled) {
    let existing
    try { existing = await readNativeTarget(path.join(root, 'config/native-update-target.json'), publicKey) }
    catch (error) { if (!object(error) || error.code !== 'ENOENT') throw error }
    const contract = await nativeUpdateContract(root, publicKey)
    if (existing && existing.contract.nativeDigest === contract.nativeDigest &&
        existing.contract.publicKeyDigest === contract.publicKeyDigest && existing.contract.schema === contract.schema) {
      target = { nativeBuild: existing.nativeBuild, ...(existing.nativeVersion ? { nativeVersion: existing.nativeVersion } : {}) }
    }
  }
  return { release, target }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const identity = process.env.TIKKUN_RELEASE_IDENTITY
    ? parseReleaseIdentity(JSON.parse(process.env.TIKKUN_RELEASE_IDENTITY))
    : process.argv.includes('--web-release') ? await allocateReleaseBuild(root, 'web') : undefined
  console.log(JSON.stringify(await bundledAppRelease(root, identity, process.env.TIKKUN_TEST_BUILD === '1')))
}
