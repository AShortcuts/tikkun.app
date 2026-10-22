import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { shareTestBuild } from './sqim-test-build.ts'
import { bundledAppRelease, readProjectRelease, readReleaseBuildState } from './release-build.ts'
import { nativeUpdateContract } from './native-update-contract.mjs'
import type { BundledAppRelease } from '../app/updates/release-identity.ts'

const project = { version: '1.1', build: 8 }
const previous = { nativeVersion: '1.1', version: '1.1', build: 9 }
const allocated = { nativeVersion: '1.1', version: '1.1.2', build: 13 }
const pbxproj = ['\tCODE_SIGN_STYLE = Automatic;', '\tCURRENT_PROJECT_VERSION = 8;', '\tMARKETING_VERSION = 1.1;',
  '\tCURRENT_PROJECT_VERSION = 8;', '\tMARKETING_VERSION = 1.1;', ''].join('\n')
const roots: string[] = []
const { publicKey: key, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const publicKey = key.export({ type: 'spki', format: 'pem' }).toString().trim()
function envelope(value: unknown) {
  const payload = JSON.stringify(value)
  return JSON.stringify({ payload, signature: sign('sha256', Buffer.from(payload), privateKey).toString('base64') })
}
beforeEach(() => {
  vi.stubEnv('TIKKUN_UPDATE_PUBLIC_KEY_FILE', undefined)
  vi.stubEnv('TIKKUN_NATIVE_MEDIA_ORIGIN', 'https://updates.example.test')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected real network request') }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'tikkun-share-test-build-'))
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
  const fetcher = vi.fn<typeof fetch>(async () => new Response(envelope({ schema: 1, channel: 'production', nativeBuild: '8',
    bundleId: 'a'.repeat(64), checksum: 'a'.repeat(64), signature: 'YWJj', bytes: 100, rollout: 100,
    release: { version: '1.1.2', build: 12 } })))
  const projectFile = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj')
  return { root, put, projectFile, fetcher }
}

test('records numbering before sync, embeds target 8, temporarily stamps the archive, and restores the project', async () => {
  const f = await fixture()
  let bundled: BundledAppRelease | undefined
  const execute = vi.fn<NonNullable<Parameters<typeof shareTestBuild>[2]>>(async (command, args, cwd, env) => {
    expect(cwd).toBe(f.root)
    expect(await readReleaseBuildState(f.root)).toEqual(allocated)
    expect(JSON.parse(env.TIKKUN_RELEASE_IDENTITY!)).toEqual({ version: '1.1.2', build: 13 })
    expect(env.TIKKUN_TEST_BUILD).toBe('1')
    const native = readProjectRelease(await readFile(f.projectFile, 'utf8'))
    if (command === 'npm') {
      expect(args).toEqual(['run', 'native:sync'])
      expect(native).toEqual(project)
      bundled = await bundledAppRelease(f.root, JSON.parse(env.TIKKUN_RELEASE_IDENTITY!), env.TIKKUN_TEST_BUILD === '1')
    } else {
      expect(command).toBe('sqim')
      expect(args).toEqual(['upload', '--device', 'ios/App', '--build', '--project', 'App.xcodeproj',
        '--scheme', 'App', '--allow-provisioning-updates', '--test-option'])
      expect(native).toEqual({ version: '1.1.2', build: 13 })
      expect(bundled).toEqual({ release: { version: '1.1.2', build: 13 }, target: { nativeBuild: '8' } })
    }
    return 0
  })
  expect(await shareTestBuild(f.root, ['--test-option'], execute, f.fetcher)).toBe(0)
  expect(execute.mock.calls.map(([command]) => command)).toEqual(['npm', 'sqim'])
  expect(await readFile(f.projectFile, 'utf8')).toBe(pbxproj)
  expect(await readReleaseBuildState(f.root)).toEqual(allocated)
  expect(f.fetcher).toHaveBeenCalledWith('https://updates.example.test/updates/web/8/latest.json', expect.any(Object))
})

test.each([
  { phase: 'npm', mode: 'exit' }, { phase: 'npm', mode: 'throw' },
  { phase: 'sqim', mode: 'exit' }, { phase: 'sqim', mode: 'throw' },
])('$phase $mode failure retains the shared record and leaves the native project restored', async ({ phase, mode }) => {
  const f = await fixture()
  const execute = vi.fn<NonNullable<Parameters<typeof shareTestBuild>[2]>>(async command => {
    expect(await readReleaseBuildState(f.root)).toEqual(allocated)
    const expected = command === 'npm' ? project : { version: '1.1.2', build: 13 }
    expect(readProjectRelease(await readFile(f.projectFile, 'utf8'))).toEqual(expected)
    if (command !== phase) return 0
    if (mode === 'throw') throw new Error(`failed ${phase}`)
    return 7
  })
  const attempt = shareTestBuild(f.root, [], execute, f.fetcher)
  if (mode === 'throw') await expect(attempt).rejects.toThrow(`failed ${phase}`)
  else await expect(attempt).resolves.toBe(7)
  expect(execute).toHaveBeenCalledTimes(phase === 'npm' ? 1 : 2)
  expect(await readFile(f.projectFile, 'utf8')).toBe(pbxproj)
  expect(await readReleaseBuildState(f.root)).toEqual(allocated)
})

test('a retry advances beyond a failed attempt instead of reusing its number', async () => {
  const f = await fixture()
  const execute = vi.fn<NonNullable<Parameters<typeof shareTestBuild>[2]>>(async () => 7)
  expect(await shareTestBuild(f.root, [], execute, f.fetcher)).toBe(7)
  expect(await shareTestBuild(f.root, [], execute, f.fetcher)).toBe(7)
  expect(await readReleaseBuildState(f.root)).toEqual({ ...allocated, build: 14 })
  expect(await readFile(f.projectFile, 'utf8')).toBe(pbxproj)
})

test('a corrupted shared record fails before sync, upload, or project mutation', async () => {
  const f = await fixture()
  const invalid = JSON.stringify({ ...previous, build: '9' })
  await f.put('config/app-release.json', invalid)
  const execute = vi.fn<NonNullable<Parameters<typeof shareTestBuild>[2]>>(async () => 0)
  await expect(shareTestBuild(f.root, [], execute, f.fetcher)).rejects.toThrow()
  expect(execute).not.toHaveBeenCalled()
  expect(f.fetcher).not.toHaveBeenCalled()
  expect(await readFile(path.join(f.root, 'config/app-release.json'), 'utf8')).toBe(invalid)
  expect(await readFile(f.projectFile, 'utf8')).toBe(pbxproj)
})

test('published-feed failure does not allocate a number or start native work', async () => {
  const f = await fixture()
  f.fetcher.mockRejectedValue(new Error('offline'))
  const execute = vi.fn<NonNullable<Parameters<typeof shareTestBuild>[2]>>(async () => 0)
  await expect(shareTestBuild(f.root, [], execute, f.fetcher)).rejects.toThrow('offline')
  expect(execute).not.toHaveBeenCalled()
  expect(await readReleaseBuildState(f.root)).toEqual(previous)
  expect(await readFile(f.projectFile, 'utf8')).toBe(pbxproj)
})

test('unexpected project changes during sync stop upload without overwriting that edit', async () => {
  const f = await fixture()
  const changed = `${pbxproj}// concurrent native edit\n`
  const execute = vi.fn<NonNullable<Parameters<typeof shareTestBuild>[2]>>(async () => {
    await writeFile(f.projectFile, changed)
    return 0
  })
  await expect(shareTestBuild(f.root, [], execute, f.fetcher)).rejects.toThrow('changed during sync')
  expect(execute).toHaveBeenCalledOnce()
  expect(await readFile(f.projectFile, 'utf8')).toBe(changed)
  expect(await readReleaseBuildState(f.root)).toEqual(allocated)
})
