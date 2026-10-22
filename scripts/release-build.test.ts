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

test.each([
  pbxproj.replace('CURRENT_PROJECT_VERSION = 8;', 'CURRENT_PROJECT_VERSION = 7;'),
  pbxproj.replace('MARKETING_VERSION = 1.1;', 'MARKETING_VERSION = 1.2;'),
  'MARKETING_VERSION = 1.1;', 'CURRENT_PROJECT_VERSION = 8;',
  pbxproj.replaceAll('MARKETING_VERSION = 1.1;', 'MARKETING_VERSION = invalid;'),
  ...['0', '-1', '1.5', 'NaN'].map(build => pbxproj.replaceAll('CURRENT_PROJECT_VERSION = 8;', `CURRENT_PROJECT_VERSION = ${build};`)),
])('rejects missing, inconsistent, or invalid project settings: %j', value => {
  expect(() => readProjectRelease(value)).toThrow()
})

test('a new native marketing version resets the release counter after native build 1', () => {
  const old = { nativeVersion: '1.1', version: '1.1.99', build: 100 }
  expect(nextReleaseBuild('test', { version: '1.2', build: 1 }, old))
    .toEqual({ nativeVersion: '1.2', version: '1.2', build: 2 })
  expect(nextReleaseBuild('web', { version: '1.2', build: 1 }, old))
    .toEqual({ nativeVersion: '1.2', version: '1.2.1', build: 2 })
})

test('equivalent marketing versions do not reset prior test numbering', () => {
  expect(nextReleaseBuild('test', { version: '1.1.0', build: 8 }, { ...previous, build: 15 }))
    .toEqual({ nativeVersion: '1.1.0', version: '1.1.0', build: 16 })
})

test('a test after a numbered web release keeps that version and advances its build', () => {
  expect(nextReleaseBuild('test', project, { ...previous, version: '1.1.9', build: 15 }, { version: '1.1.10', build: 20 }))
    .toEqual({ nativeVersion: '1.1', version: '1.1.10', build: 21 })
})

test('web releases advance both the latest version and the highest test or published build', () => {
  const tests = { nativeVersion: '1.1', version: '1.1.3', build: 25 }
  expect(nextReleaseBuild('web', project, tests, { version: '1.1.4', build: 24 }))
    .toEqual({ nativeVersion: '1.1', version: '1.1.5', build: 26 })
  expect(nextReleaseBuild('web', project, tests, { version: '1.1.4', build: 30 }))
    .toEqual({ nativeVersion: '1.1', version: '1.1.5', build: 31 })
})

test.each([
  { version: 'invalid', build: 9 }, { version: '1.1', build: 0 }, { version: '1.1', build: -1 },
  { version: '1.1', build: 1.5 }, { version: '1.1', build: NaN }, { version: '1.1', build: Number.MAX_SAFE_INTEGER + 1 },
])('invalid versions/counters fail for project, previous, published, and replacement identities: %j', invalid => {
  expect(() => nextReleaseBuild('test', invalid, previous)).toThrow()
  expect(() => nextReleaseBuild('test', project, { ...previous, ...invalid })).toThrow()
  expect(() => nextReleaseBuild('web', project, previous, invalid)).toThrow()
  expect(() => withProjectRelease(pbxproj, invalid)).toThrow()
})

test('rejects invalid native epochs, older project versions, and exhausted build counters', () => {
  expect(() => nextReleaseBuild('test', project, { ...previous, nativeVersion: 'bad' })).toThrow('native version')
  expect(() => nextReleaseBuild('test', project, { ...previous, nativeVersion: '1.2' })).toThrow('older')
  expect(() => nextReleaseBuild('test', project, { ...previous, build: Number.MAX_SAFE_INTEGER })).toThrow()
})

test.each(['1.1.1', '1.1.3'])('a new native epoch %s must advance beyond the latest tracked app release version', version => {
  expect(() => nextReleaseBuild('test', { version, build: 1 },
    { nativeVersion: '1.1', version: '1.1.3', build: 20 })).toThrow()
})

test.each([
  '{', JSON.stringify({ ...previous, nativeVersion: 'bad' }), JSON.stringify({ ...previous, version: 'bad' }),
  JSON.stringify({ ...previous, build: '9' }), JSON.stringify({ ...previous, build: 0 }),
])('invalid tracked records fail without resetting the counter: %j', async contents => {
  const f = await fixture()
  await f.put('config/app-release.json', contents)
  await expect(readReleaseBuildState(f.root)).rejects.toThrow()
  expect(await readFile(path.join(f.root, 'config/app-release.json'), 'utf8')).toBe(contents)
})

test.each([
  { target: { nativeBuild: '8' }, key: '8' },
  { target: { nativeVersion: '1.2', nativeBuild: '1' }, key: '1.2-1' },
])('reads verified numbering from the exact $key feed', async ({ target, key: feedKey }) => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(signedFeed(target)))
  expect(await publishedRelease('/unused', target, publicKey, { fetcher })).toEqual({ version: '1.1.2', build: 12 })
  expect(fetcher).toHaveBeenCalledWith(`https://updates.example.test/updates/web/${feedKey}/latest.json`, expect.objectContaining({
    cache: 'no-store', credentials: 'omit', redirect: 'error',
  }))
})

test('missing and legacy unnumbered feeds provide no published counter', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response(signedFeed({ release: undefined })))
  await expect(publishedRelease('/unused', { nativeBuild: '8' }, publicKey, { fetcher })).resolves.toBeUndefined()
  await expect(publishedRelease('/unused', { nativeBuild: '8' }, publicKey, { fetcher })).resolves.toBeUndefined()
})

test.each(['signature', 'target', 'identity', 'http', 'html', 'oversize', 'offline'])('unverified published %s cannot supply a counter', async kind => {
  const fetcher = vi.fn<typeof fetch>(async () => {
    if (kind === 'offline') throw new Error('offline')
    if (kind === 'http') return new Response('unavailable', { status: 503 })
    if (kind === 'html') return new Response('<html>Home</html>')
    if (kind === 'oversize') return new Response(' '.repeat(16_385))
    if (kind === 'target') return new Response(signedFeed({ nativeVersion: '1.2' }))
    if (kind === 'identity') return new Response(signedFeed({ release: { version: '1.1', build: -1 } }))
    return new Response(signedFeed().replace('1.1.2', '1.1.3'))
  })
  await expect(publishedRelease('/unused', { nativeBuild: '8' }, publicKey, { fetcher })).rejects.toThrow()
})

test.each([false, true])('allocation uses verified published numbering, local=%s, without rewriting tracked state', async local => {
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

test('repeated manual preparation advances beyond an unpushed local feed while production stays unchanged', async () => {
  const f = await fixture()
  const fetcher = vi.fn<typeof fetch>(async () => new Response(signedFeed()))
  const first = await allocateReleaseBuild(f.root, 'web', { fetcher })
  expect(first).toEqual({ nativeVersion: '1.1', version: '1.1.3', build: 13 })
  await f.put('site/updates/web/8/latest.json', signedFeed({ release: { version: first.version, build: first.build } }))
  expect(await allocateReleaseBuild(f.root, 'web', { fetcher }))
    .toEqual({ nativeVersion: '1.1', version: '1.1.4', build: 14 })
  expect(await allocateReleaseBuild(f.root, 'test', { fetcher }))
    .toEqual({ nativeVersion: '1.1', version: '1.1.3', build: 14 })
  expect(fetcher).toHaveBeenCalledTimes(3)
  expect(await readReleaseBuildState(f.root)).toEqual(previous)
})

test.each([
  { local: { version: '1.1.5', build: 14 }, remote: { version: '1.1.3', build: 18 } },
  { local: { version: '1.1.3', build: 18 }, remote: { version: '1.1.5', build: 14 } },
])('allocation independently merges the highest local/remote version and build: %j', async ({ local, remote }) => {
  const f = await fixture()
  await f.put('site/updates/web/8/latest.json', signedFeed({ release: local }))
  const fetcher = vi.fn<typeof fetch>(async () => new Response(signedFeed({ release: remote })))
  expect(await allocateReleaseBuild(f.root, 'web', { fetcher }))
    .toEqual({ nativeVersion: '1.1', version: '1.1.6', build: 19 })
})

test.each(['signature', 'target', 'identity'])('an invalid local %s is rejected despite a valid remote feed', async kind => {
  const f = await fixture()
  const contents = kind === 'signature' ? signedFeed().replace('1.1.2', '1.1.3')
    : kind === 'target' ? signedFeed({ nativeVersion: '1.2' })
      : signedFeed({ release: { version: '1.1.3', build: '14' } })
  await f.put('site/updates/web/8/latest.json', contents)
  const fetcher = vi.fn<typeof fetch>(async () => new Response(signedFeed()))
  await expect(allocateReleaseBuild(f.root, 'web', { fetcher })).rejects.toThrow()
  expect(await readReleaseBuildState(f.root)).toEqual(previous)
  expect(await readFile(path.join(f.root, 'site/updates/web/8/latest.json'), 'utf8')).toBe(contents)
})

test('a retained local feed survives remote 404 but cannot hide a remote failure', async () => {
  const f = await fixture()
  await f.put('site/updates/web/8/latest.json', signedFeed({ release: { version: '1.1.4', build: 14 } }))
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
  expect(await allocateReleaseBuild(f.root, 'web', { fetcher }))
    .toEqual({ nativeVersion: '1.1', version: '1.1.5', build: 15 })
  await expect(allocateReleaseBuild(f.root, 'web', { fetcher })).rejects.toThrow('503')
})

test('new native epochs use the retained versioned feed without inheriting legacy target counters', async () => {
  const f = await fixture()
  await f.put('ios/App/App.xcodeproj/project.pbxproj', withProjectRelease(pbxproj, { version: '1.2', build: 1 }))
  await f.put('site/updates/web/8/latest.json', signedFeed({ release: { version: '1.1.99', build: 100 } }))
  await f.put('site/updates/web/1.2-1/latest.json', signedFeed({ nativeVersion: '1.2', nativeBuild: '1',
    release: { version: '1.2.2', build: 7 } }))
  const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 404 }))
  expect(await allocateReleaseBuild(f.root, 'web', { fetcher }))
    .toEqual({ nativeVersion: '1.2', version: '1.2.3', build: 8 })
  expect(fetcher).toHaveBeenCalledWith('https://updates.example.test/updates/web/1.2-1/latest.json', expect.any(Object))
})

test.each([false, true])('unchanged native source embeds legacy target 8 even for build 10, testBuild=%s', async testBuild => {
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
  expect(await bundledAppRelease(f.root))
    .toEqual({ release: { version: '1.2', build: 1 }, target: { nativeVersion: '1.2', nativeBuild: '1' } })
  fetcher.mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
  await expect(allocateReleaseBuild(f.root, 'test', { fetcher })).rejects.toThrow('503')
})

test('a new native epoch still advances above already published numbering on that exact target', async () => {
  const f = await fixture()
  await f.put('ios/App/App.xcodeproj/project.pbxproj', withProjectRelease(pbxproj, { version: '1.2', build: 1 }))
  const fetcher = vi.fn<typeof fetch>(async () => new Response(signedFeed({ nativeVersion: '1.2', nativeBuild: '1',
    release: { version: '1.2.3', build: 15 } })))
  expect(await allocateReleaseBuild(f.root, 'test', { fetcher }))
    .toEqual({ nativeVersion: '1.2', version: '1.2.3', build: 16 })
})

test.each([false, true])('mismatched native contract selects project or isolated test target, testBuild=%s', async testBuild => {
  const f = await fixture()
  await f.put('ios/App/App.xcodeproj/project.pbxproj', withProjectRelease(pbxproj, { version: '1.2', build: 1 }))
  expect(await bundledAppRelease(f.root, { version: '1.2', build: 2 }, testBuild))
    .toEqual({ release: { version: '1.2', build: 2 }, target: { nativeVersion: '1.2', nativeBuild: testBuild ? '2' : '1' } })
})
