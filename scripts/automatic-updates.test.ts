import { execFileSync } from 'node:child_process'
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, test, vi } from 'vitest'
import { contentCompatibility, parseContentSnapshot } from '../app/updates/content-schema.ts'
import { verifyReleaseEnvelope } from '../app/updates/release-signature.ts'
import { verifyWebRelease } from '../app/updates/web-update.ts'
import { buildPagesUpdates } from './build-pages-updates.ts'
import { nativeUpdateContract } from './native-update-contract.mjs'
import { assertNativeTarget, readNativeTarget, targetFromArchive } from './native-update-target.ts'
import type { NativeUpdateTarget } from './native-update-target.ts'
import { inspectUpdateFeeds, restoreUpdateFeeds } from './update-feed-history.ts'

const roots: string[] = []
const { privateKey, publicKey: key } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const publicKey = key.export({ type: 'spki', format: 'pem' }).toString().trim()
const secret = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const envelope = (value: unknown) => {
  const payload = JSON.stringify(value)
  return JSON.stringify({ payload, signature: sign('sha256', Buffer.from(payload), privateKey).toString('base64') })
}
const snapshot = parseContentSnapshot({ schema: 1, pages: { 'torah/1': [] }, cues: {}, recordings: [
  { id: 'test-1', narratorId: 'test', reading: { kind: 'parsha', id: 'test', name: 'Test' },
    parshaSlug: 'test', parshaName: 'Test', aliyah: 1, title: 'Test', format: 'm4a', status: 'available',
    playSrc: '/audio/test/1.m4a', downloadSrc: '/audio/test/1.m4a', mediaIdentity: { algorithm: 'sha256', digest: 'a'.repeat(64), byteLength: 10 } },
] })
const content = JSON.stringify(snapshot)
const compatibility = await contentCompatibility(snapshot)
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'tikkun-automatic-update-test-'))
  roots.push(root)
  const put = async (name: string, contents: string) => {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true })
    await writeFile(path.join(root, name), contents)
  }
  await put('config/update-public-key.pem', publicKey)
  await put('capacitor.config.ts', 'config')
  await put('scripts/update-config.mjs', 'config')
  await put('ios/App/CapApp-SPM/Package.swift', 'plugins')
  await put('ios/App/App/Main.swift', 'native code')
  await put('ios/App/App.xcodeproj/project.pbxproj', 'MARKETING_VERSION = 1.1;\nCURRENT_PROJECT_VERSION = 7;\n')
  await put('config/app-release.json', JSON.stringify({ nativeVersion: '1.1', version: '1.1', build: 9 }))
  await put('package.json', JSON.stringify({ type: 'module', dependencies: { '@capacitor/core': '8.5.1' } }))
  const contract = await nativeUpdateContract(root, publicKey)
  const target: NativeUpdateTarget = { schema: 1, kind: 'native-update-target', nativeBuild: '7', contract: { ...contract, schema: 2 } }
  await put('config/native-update-target.json', envelope(target))
  const feed = async (zip: string, build = '7', rollout = 100, release?: { version: string; build: number }) => {
    await put(`site/updates/web/${build}/${hash(zip)}.zip`, zip)
    await put(`site/updates/web/${build}/latest.json`, envelope({ schema: 1, channel: 'production', nativeBuild: build,
      bundleId: hash(zip), checksum: hash(zip), bytes: Buffer.byteLength(zip), rollout, ...(release ? { release } : {}),
      signature: sign('sha256', Buffer.from(zip), privateKey).toString('base64') }))
  }
  await feed('old ZIP')
  // Builds 6 and 7 still read this published content feed; new builds no longer create one.
  await put(`site/updates/content/${compatibility}/${hash(content)}.json`, content)
  await put(`site/updates/content/${compatibility}/latest.json`, envelope({ schema: 1, digest: hash(content), bytes: Buffer.byteLength(content) }))
  const directory = path.join(root, 'site/updates')
  const index = await inspectUpdateFeeds(directory, publicKey)
  const files = new Map<string, Buffer>(await Promise.all(index.files.map(async (file): Promise<[string, Buffer]> => [file.path, await readFile(path.join(directory, file.path))])))
  files.set('index.json', Buffer.from(envelope(index)))
  const fetcher = vi.fn<typeof fetch>(async input => {
    const bytes = files.get(new URL(String(input)).pathname.replace('/updates/', ''))
    return bytes ? new Response(new Uint8Array(bytes)) : new Response(null, { status: 404 })
  })
  const environment = { CF_PAGES: '1', CF_PAGES_BRANCH: 'develop', TIKKUN_UPDATE_PRIVATE_KEY: secret }
  const calls: string[] = []
  const temporaryKeys: string[] = []
  const state = { failure: '', changedNativeAfterBuild: false }
  const run = async (args: string[], env: NodeJS.ProcessEnv) => {
    const command = args[1]
    calls.push(command)
    expect(env.TIKKUN_UPDATE_PRIVATE_KEY).toBeUndefined()
    if (command === 'updates:web') {
      expect(await readFile(env.TIKKUN_UPDATE_PRIVATE_KEY_FILE!, 'utf8')).toBe(secret)
      expect((await stat(env.TIKKUN_UPDATE_PRIVATE_KEY_FILE!)).mode & 0o077).toBe(0)
      temporaryKeys.push(env.TIKKUN_UPDATE_PRIVATE_KEY_FILE!)
    } else expect(env.TIKKUN_UPDATE_PRIVATE_KEY_FILE).toBeUndefined()
    if (command === state.failure) throw new Error(`Failed ${command}`)
    if (command === 'build:native') await put('dist-native/native-update-contract.json', JSON.stringify({ ...contract,
      ...(state.changedNativeAfterBuild ? { nativeDigest: '0'.repeat(64) } : {}) }))
    if (command === 'updates:stage') await feed('new ZIP', '7', 100, JSON.parse(env.TIKKUN_RELEASE_IDENTITY!))
    if (command === 'build') await cp(directory, path.join(root, 'dist/updates'), { recursive: true })
  }
  const services = { root, environment, run, fetcher, log: vi.fn() }
  return { root, put, feed, directory, contract, target, files, fetcher, calls, temporaryKeys, state, services }
}

test('portable contract ignores cap sync and Xcode user files but detects native plugin changes', async () => {
  const f = await fixture()
  await f.put('ios/App/App/capacitor.config.json', 'generated local config')
  await f.put('ios/App/App.xcodeproj/xcuserdata/user/scheme.plist', 'machine local')
  expect(await nativeUpdateContract(f.root, publicKey)).toEqual(f.contract)
  await f.put('ios/App/CapApp-SPM/Package.swift', 'new plugin')
  expect((await nativeUpdateContract(f.root, publicKey)).nativeDigest).not.toBe(f.contract.nativeDigest)
})

test('archive export requires exact device build and embedded public key', async () => {
  const f = await fixture()
  const app = 'archive/Products/Applications/App.app'
  await f.put(`${app}/public/native-update-contract.json`, JSON.stringify(f.contract))
  await f.put(`${app}/capacitor.config.json`, JSON.stringify({ plugins: { LiveUpdate: { publicKey } } }))
  const plist = (_file: string, field: string) => field === 'CFBundleVersion' ? '7' : 'iPhoneOS'
  expect(await targetFromArchive(path.join(f.root, 'archive'), '7', publicKey, plist)).toEqual(f.target)
  await expect(targetFromArchive(path.join(f.root, 'archive'), '8', publicKey, plist)).rejects.toThrow('selected native build')
  await expect(targetFromArchive(path.join(f.root, 'archive'), '7', publicKey, (_file, field) => field === 'CFBundleVersion' ? '7' : 'iPhoneSimulator')).rejects.toThrow('Simulator')
  await f.put(`${app}/capacitor.config.json`, '{}')
  await expect(targetFromArchive(path.join(f.root, 'archive'), '7', publicKey, plist)).rejects.toThrow('not installed')
})

test('target records require valid signatures and cannot authorize changed native code', async () => {
  const f = await fixture()
  const file = path.join(f.root, 'config/native-update-target.json')
  expect(await readNativeTarget(file, publicKey)).toEqual(f.target)
  expect(() => assertNativeTarget(f.target, { ...f.contract, nativeDigest: '0'.repeat(64) }, publicKey)).toThrow('ship a matching')
  await f.put('config/native-update-target.json', envelope(f.target).replace('native-update-target', 'other-update-target'))
  await expect(readNativeTarget(file, publicKey)).rejects.toThrow('signature mismatch')
})

test('actual web packager creates a verifiable ZIP from a target record without an archive or macOS tools', async () => {
  const f = await fixture()
  const repo = fileURLToPath(new URL('..', import.meta.url))
  for (const file of ['build-web-release.ts', 'native-update-target.ts', 'update-config.mjs', 'sign-update.ts', 'release-build.ts', 'native-update-contract.mjs']) {
    await cp(path.join(repo, 'scripts', file), path.join(f.root, 'scripts', file))
  }
  await symlink(path.join(repo, 'node_modules'), path.join(f.root, 'node_modules'), 'dir')
  await symlink(path.join(repo, 'app'), path.join(f.root, 'app'), 'dir')
  await f.put('dist-native/reader/index.html', '<!doctype html><title>Test reader</title>')
  await f.put('dist-native/.well-known/test.json', '{"included":true}')
  await f.put('dist-native/native-update-contract.json', JSON.stringify(f.contract))
  await f.put('dist-native/app-release.json', JSON.stringify({ release: { version: '1.1.1', build: 10 }, target: { nativeBuild: '7' } }))
  await f.put('private.pem', secret)
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/build-web-release.ts', '--native-build', '7',
    '--target-record', 'config/native-update-target.json', '--rollout', '100', '--approve-web-only'], {
    cwd: f.root, env: { ...process.env, TIKKUN_UPDATE_PRIVATE_KEY_FILE: path.join(f.root, 'private.pem'), TIKKUN_UPDATE_PUBLIC_KEY_FILE: path.join(f.root, 'config/update-public-key.pem') },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const release = await verifyWebRelease(JSON.parse(await readFile(path.join(f.root, '.asc/updates/web/7/latest.json'), 'utf8')), publicKey)
  const zip = await readFile(path.join(f.root, `.asc/updates/web/7/${release.bundleId}.zip`))
  expect(hash(zip)).toBe(release.bundleId)
  expect(verify('sha256', zip, publicKey, Buffer.from(release.signature, 'base64'))).toBe(true)
  const contents = JSON.parse(execFileSync('python3', ['-c',
    'import json, sys, zipfile\nwith zipfile.ZipFile(sys.argv[1]) as archive:\n assert archive.testzip() is None\n print(json.dumps({name: archive.read(name).decode() for name in archive.namelist() if not name.endswith("/")}))',
    path.join(f.root, `.asc/updates/web/7/${release.bundleId}.zip`)], { encoding: 'utf8' }))
  expect(contents['reader/index.html']).toBe('<!doctype html><title>Test reader</title>')
  expect(contents['.well-known/test.json']).toBe('{"included":true}')
  expect(JSON.parse(contents['native-update-contract.json'])).toEqual(f.contract)
  expect(JSON.parse(contents['app-release.json']).release).toEqual(release.release)
})

test.each([{ CF_PAGES: '1', CF_PAGES_BRANCH: 'feature' }, { CF_PAGES_BRANCH: 'develop' }])('preview and local builds never prepare or sign updates', async environment => {
  const f = await fixture()
  expect(await buildPagesUpdates({ ...f.services, environment: { ...environment, TIKKUN_UPDATE_PRIVATE_KEY: secret } })).toEqual({ mode: 'website' })
  expect(f.calls).toEqual(['build'])
  expect(f.fetcher).not.toHaveBeenCalled()
})

test('automatic production builds retain downloads, including legacy content feeds, and emit the signed app update', async () => {
  const f = await fixture()
  await rm(f.directory, { recursive: true })
  expect(await buildPagesUpdates(f.services)).toMatchObject({ mode: 'automatic', nativeBuild: '7', files: 5 })
  expect(f.calls).toEqual(['verify:quick', 'build:native', 'updates:web', 'updates:stage', 'build'])
  const output = path.join(f.root, 'dist/updates')
  expect(await readFile(path.join(output, `web/7/${hash('old ZIP')}.zip`), 'utf8')).toBe('old ZIP')
  expect(await readFile(path.join(output, `content/${compatibility}/${hash(content)}.json`), 'utf8')).toBe(content)
  const latest = await verifyReleaseEnvelope(JSON.parse(await readFile(path.join(output, 'web/7/latest.json'), 'utf8')), publicKey)
  expect(latest).toMatchObject({ bundleId: hash('new ZIP'), release: { version: '1.1.1', build: 10 } })
  expect(await verifyReleaseEnvelope(JSON.parse(await readFile(path.join(output, 'index.json'), 'utf8')), publicKey)).toEqual(await inspectUpdateFeeds(output, publicKey))
  for (const file of f.temporaryKeys) await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' })
})

test('manual fallback publishes locally prepared manifests while retaining remote downloads', async () => {
  const f = await fixture()
  await f.feed('manual ZIP', '7', 10)
  await buildPagesUpdates({ ...f.services, environment: { ...f.services.environment, TIKKUN_UPDATE_MODE: 'manual' } })
  expect(f.calls).toEqual(['build'])
  expect(await readFile(path.join(f.root, `dist/updates/web/7/${hash('old ZIP')}.zip`), 'utf8')).toBe('old ZIP')
  const latest = await verifyReleaseEnvelope(JSON.parse(await readFile(path.join(f.root, 'dist/updates/web/7/latest.json'), 'utf8')), publicKey)
  expect(latest).toMatchObject({ bundleId: hash('manual ZIP'), rollout: 10 })
})

test('production advances beyond both the recorded tests and the published web release', async () => {
  const f = await fixture()
  await f.feed('latest ZIP', '7', 100, { version: '1.1.3', build: 20 })
  const index = await inspectUpdateFeeds(f.directory, publicKey)
  for (const file of index.files) f.files.set(file.path, await readFile(path.join(f.directory, file.path)))
  f.files.set('index.json', Buffer.from(envelope(index)))
  await buildPagesUpdates(f.services)
  const latest = await verifyWebRelease(JSON.parse(await readFile(path.join(f.root, 'dist/updates/web/7/latest.json'), 'utf8')), publicKey)
  expect(latest.release).toEqual({ version: '1.1.4', build: 21 })
})

test('version-qualified build-1 feeds coexist and retain the legacy feeds', async () => {
  const f = await fixture()
  for (const version of ['1.2', '1.3']) {
    const zip = `native ${version} ZIP`
    const prefix = `site/updates/web/${version}-1`
    await f.put(`${prefix}/${hash(zip)}.zip`, zip)
    await f.put(`${prefix}/latest.json`, envelope({ schema: 1, channel: 'production', nativeBuild: '1', nativeVersion: version,
      release: { version: `${version}.1`, build: 2 }, bundleId: hash(zip), checksum: hash(zip), bytes: Buffer.byteLength(zip), rollout: 100,
      signature: sign('sha256', Buffer.from(zip), privateKey).toString('base64') }))
  }
  const index = await inspectUpdateFeeds(f.directory, publicKey)
  expect(index.files.filter(file => file.path.endsWith('/latest.json')).map(file => file.path)).toContain('web/7/latest.json')
  expect(index.files.filter(file => file.path.startsWith('web/1.')).map(file => file.path)).toContain('web/1.2-1/latest.json')
  expect(index.files.filter(file => file.path.startsWith('web/1.')).map(file => file.path)).toContain('web/1.3-1/latest.json')
})

test('new native archive exports its versioned target and refuses a test archive for an existing target', async () => {
  const f = await fixture()
  const app = 'archive/Products/Applications/App.app'
  await f.put(`${app}/public/native-update-contract.json`, JSON.stringify(f.contract))
  await f.put(`${app}/capacitor.config.json`, JSON.stringify({ plugins: { LiveUpdate: { publicKey } } }))
  await f.put(`${app}/public/app-release.json`, JSON.stringify({ release: { version: '1.2', build: 1 }, target: { nativeVersion: '1.2', nativeBuild: '1' } }))
  const plist = (_file: string, field: string) => field === 'CFBundleVersion' ? '1' : field === 'CFBundleShortVersionString' ? '1.2' : 'iPhoneOS'
  expect(await targetFromArchive(path.join(f.root, 'archive'), '1', publicKey, plist)).toMatchObject({ nativeVersion: '1.2', nativeBuild: '1' })
  await f.put(`${app}/public/app-release.json`, JSON.stringify({ release: { version: '1.1', build: 9 }, target: { nativeBuild: '7' } }))
  await expect(targetFromArchive(path.join(f.root, 'archive'), '1', publicKey, plist)).rejects.toThrow('test build')
  await f.put(`${app}/public/app-release.json`, '')
  await expect(targetFromArchive(path.join(f.root, 'archive'), '1', publicKey, plist)).rejects.toThrow()
})

test.each(['native', 'secret', 'target'])('missing or incompatible %s stops before preparing the deployment', async kind => {
  const f = await fixture()
  if (kind === 'native') await f.put('ios/App/App/Main.swift', 'incompatible native code')
  if (kind === 'secret') f.services.environment.TIKKUN_UPDATE_PRIVATE_KEY = ''
  if (kind === 'target') await rm(path.join(f.root, 'config/native-update-target.json'))
  await expect(buildPagesUpdates(f.services)).rejects.toThrow()
  expect(f.calls).toEqual([])
})

test('regenerated native resources are checked before any signing', async () => {
  const f = await fixture()
  f.state.changedNativeAfterBuild = true
  await expect(buildPagesUpdates(f.services)).rejects.toThrow('ship a matching')
  expect(f.calls).toEqual(['verify:quick', 'build:native'])
})

test('failed signing removes the temporary key and never builds a deployment', async () => {
  const f = await fixture()
  f.state.failure = 'updates:web'
  await expect(buildPagesUpdates(f.services)).rejects.toThrow('Failed updates:web')
  expect(f.calls).not.toContain('build')
  for (const file of f.temporaryKeys) await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' })
})

test('a failed verification gate stops signing and missing deployment files fail final verification', async () => {
  const f = await fixture()
  f.state.failure = 'verify:quick'
  await expect(buildPagesUpdates(f.services)).rejects.toThrow('Failed verify:quick')
  expect(f.calls).toEqual(['verify:quick'])
  f.state.failure = ''
  const run = f.services.run
  await expect(buildPagesUpdates({ ...f.services, run: async (args, env) => {
    await run(args, env)
    if (args[1] === 'build') await rm(path.join(f.root, `dist/updates/web/7/${hash('old ZIP')}.zip`))
  } })).rejects.toThrow('does not match')
})

test('only a genuine missing index allows initial bootstrap; errors and corrupt files fail closed', async () => {
  const f = await fixture()
  f.files.delete('index.json')
  expect(await restoreUpdateFeeds(f.directory, 'https://tikkunreader.com', publicKey, { fetcher: f.fetcher })).toMatchObject({ bootstrap: true })
  const failure: typeof fetch = async () => new Response('failed', { status: 503 })
  await expect(restoreUpdateFeeds(f.directory, 'https://tikkunreader.com', publicKey, { fetcher: failure })).rejects.toThrow('HTTP 503')
  const index = await inspectUpdateFeeds(f.directory, publicKey)
  f.files.set('index.json', Buffer.from(envelope(index)))
  f.files.set(`web/7/${hash('old ZIP')}.zip`, Buffer.from('bad ZIP'))
  await rm(f.directory, { recursive: true })
  await expect(restoreUpdateFeeds(f.directory, 'https://tikkunreader.com', publicKey, { fetcher: f.fetcher })).rejects.toThrow('Corrupted retained update')
})

test('history rejects traversal and invalid index signatures', async () => {
  const f = await fixture()
  f.files.set('index.json', Buffer.from(envelope({ schema: 1, kind: 'update-feed-index', files: [{ path: '../private.pem', checksum: hash('private'), bytes: 7 }] })))
  await expect(restoreUpdateFeeds(f.directory, 'https://tikkunreader.com', publicKey, { fetcher: f.fetcher })).rejects.toThrow('Invalid update history entry')
  f.files.set('index.json', Buffer.from(envelope({ schema: 1, kind: 'update-feed-index', files: [] }).replace('update-feed-index', 'invalid')))
  await expect(restoreUpdateFeeds(f.directory, 'https://tikkunreader.com', publicKey, { fetcher: f.fetcher })).rejects.toThrow('signature mismatch')
})
