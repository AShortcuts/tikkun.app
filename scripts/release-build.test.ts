import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { allocateReleaseBuild, bundledAppRelease, nextReleaseBuild, publishedRelease,
  readProjectRelease, readReleaseBuildState, withProjectRelease } from './release-build.ts'
import { nativeUpdateContract } from './native-update-contract.mjs'

const project = { version: '1.1', build: 8 }
const previous = { nativeVersion: '1.1', version: '1.1', build: 9 }
const pbxproj = [
  '\tCODE_SIGN_STYLE = Automatic;',
  '\tCURRENT_PROJECT_VERSION = 8;',
  '\tMARKETING_VERSION = 1.1;',
  '\tCURRENT_PROJECT_VERSION = 8;',
  '\tMARKETING_VERSION = 1.1;',
  '',
].join('\n')
const roots: string[] = []
const { publicKey: key, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const publicKey = key.export({ type: 'spki', format: 'pem' }).toString().trim()
function envelope(value: unknown) {
  const payload = JSON.stringify(value)
  return JSON.stringify({ payload, signature: sign('sha256', Buffer.from(payload), privateKey).toString('base64') })
}
function signedFeed(patch: Record<string, unknown> = {}) {
  return envelope({ schema: 1, channel: 'production', nativeBuild: '8', bundleId: 'a'.repeat(64),
    checksum: 'a'.repeat(64), signature: 'YWJj', bytes: 100, rollout: 100,
    release: { version: '1.1.2', build: 12 }, ...patch })
}
beforeEach(() => {
  vi.stubEnv('TIKKUN_UPDATE_PUBLIC_KEY_FILE', undefined)
  vi.stubEnv('TIKKUN_NATIVE_MEDIA_ORIGIN', 'https://updates.example.test')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected real network request') }))
})
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'tikkun-release-build-test-'))
  roots.push(root)
  const put = async (file: string, contents: string) => {
    const destination = path.join(root, file)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, contents)
  }
  await put('config/update-public-key.pem', publicKey)
  await put('config/app-release.json', JSON.stringify(previous))
  await put('capacitor.config.ts', 'config')
  await put('scripts/update-config.mjs', 'config')
  await put('ios/App/App.xcodeproj/project.pbxproj', pbxproj)
  await put('ios/App/App/Main.swift', 'native code')
  await put('ios/App/CapApp-SPM/Package.swift', 'plugins')
  await put('package.json', JSON.stringify({ dependencies: { '@capacitor/core': '8.5.1' } }))
  const contract = await nativeUpdateContract(root, publicKey)
  await put('config/native-update-target.json', envelope({ schema: 1, kind: 'native-update-target', nativeBuild: '8', contract }))
  return { root, put }
}

test('reads and replaces every project version/build without changing unrelated settings', () => {
  expect(readProjectRelease(pbxproj)).toEqual(project)
  const updated = withProjectRelease(pbxproj, { version: '1.2', build: 1 })
  expect(readProjectRelease(updated)).toEqual({ version: '1.2', build: 1 })
  expect(withProjectRelease(updated, project)).toBe(pbxproj)
})

test.each([pbxproj.replace('CURRENT_PROJECT_VERSION = 8;', 'CURRENT_PROJECT_VERSION = 7;')])('rejects missing, inconsistent, or invalid project settings: %j', value => {
  expect(() => readProjectRelease(value)).toThrow()
})

test('a new native marketing version resets the release counter after native build 1', () => {
  const old = { nativeVersion: '1.1', version: '1.1.99', build: 100 }
  expect(nextReleaseBuild('test', { version: '1.2', build: 1 }, old))
    .toEqual({ nativeVersion: '1.2', version: '1.2', build: 2 })
  expect(nextReleaseBuild('web', { version: '1.2', build: 1 }, old))
    .toEqual({ nativeVersion: '1.2', version: '1.2.1', build: 2 })
})

test('web releases advance both the latest version and the highest test or published build', () => {
  const tests = { nativeVersion: '1.1', version: '1.1.3', build: 25 }
  expect(nextReleaseBuild('web', project, tests, { version: '1.1.4', build: 24 }))
    .toEqual({ nativeVersion: '1.1', version: '1.1.5', build: 26 })
  expect(nextReleaseBuild('web', project, tests, { version: '1.1.4', build: 30 }))
    .toEqual({ nativeVersion: '1.1', version: '1.1.5', build: 31 })
})

test.each([{ version: 'invalid', build: 9 }])('invalid versions/counters fail for project, previous, published, and replacement identities: %j', invalid => {
  expect(() => nextReleaseBuild('test', invalid, previous)).toThrow()
  expect(() => nextReleaseBuild('test', project, { ...previous, ...invalid })).toThrow()
  expect(() => nextReleaseBuild('web', project, previous, invalid)).toThrow()
  expect(() => withProjectRelease(pbxproj, invalid)).toThrow()
})

test.each([{ target: { nativeBuild: '8' }, key: '8' }])('reads verified numbering from the exact $key feed', async ({ target, key: feedKey }) => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(signedFeed(target)))
  expect(await publishedRelease('/unused', target, publicKey, { fetcher })).toEqual({ version: '1.1.2', build: 12 })
  expect(fetcher).toHaveBeenCalledWith(`https://updates.example.test/updates/web/${feedKey}/latest.json`, expect.objectContaining({
    cache: 'no-store', credentials: 'omit', redirect: 'error',
  }))
})

test.each([false])('allocation uses verified published numbering, local=%s, without rewriting tracked state', async local => {
  const f = await fixture()
  await f.put('site/updates/web/8/latest.json', signedFeed())
  const fetcher = vi.fn<typeof fetch>(async () => new Response(signedFeed()))
  expect(await allocateReleaseBuild(f.root, 'test', { local, fetcher }))
    .toEqual({ nativeVersion: '1.1', version: '1.1.2', build: 13 })
  expect(await allocateReleaseBuild(f.root, 'web', { local, fetcher }))
    .toEqual({ nativeVersion: '1.1', version: '1.1.3', build: 13 })
  expect(fetcher).toHaveBeenCalledTimes(local ? 0 : 2)
  expect(await readReleaseBuildState(f.root)).toEqual(previous)
  expect(await readFile(path.join(f.root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')).toBe(pbxproj)
})

test.each([false])('unchanged native source embeds legacy target 8 even for build 10, testBuild=%s', async testBuild => {
  const f = await fixture()
  expect(await bundledAppRelease(f.root, { version: '1.1.1', build: 10 }, testBuild))
    .toEqual({ release: { version: '1.1.1', build: 10 }, target: { nativeBuild: '8' } })
})

test('new native version build 1 queries its versioned feed and resets only after a real 404', async () => {
  const f = await fixture()
  await f.put('ios/App/App.xcodeproj/project.pbxproj', withProjectRelease(pbxproj, { version: '1.2', build: 1 }))
  const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 404 }))
  expect(await allocateReleaseBuild(f.root, 'test', { fetcher }))
    .toEqual({ nativeVersion: '1.2', version: '1.2', build: 2 })
  expect(fetcher).toHaveBeenCalledWith('https://updates.example.test/updates/web/1.2-1/latest.json', expect.any(Object))
  // Production web updates stay on the installed App Store build's channel.
  expect(await bundledAppRelease(f.root))
    .toEqual({ release: { version: '1.2', build: 1 }, target: { nativeBuild: '8' } })
  fetcher.mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
  await expect(allocateReleaseBuild(f.root, 'test', { fetcher })).rejects.toThrow('503')
})

test('changed native code keeps production on the App Store channel and gives Sqim tests their own', async () => {
  const f = await fixture()
  await f.put('ios/App/App.xcodeproj/project.pbxproj', withProjectRelease(pbxproj, { version: '1.2', build: 1 }))
  await f.put('ios/App/App/Main.swift', 'changed native code')
  expect(await bundledAppRelease(f.root, { version: '1.2', build: 2 }, false))
    .toEqual({ release: { version: '1.2', build: 2 }, target: { nativeBuild: '8' } })
  expect(await bundledAppRelease(f.root, { version: '1.2', build: 2 }, true))
    .toEqual({ release: { version: '1.2', build: 2 }, target: { nativeVersion: '1.2', nativeBuild: '2' } })
})
