import { execFileSync } from 'node:child_process'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { parseReleaseOptions, releaseCommand, releaseUpdates } from './release-updates.ts'
import type { ReleaseCommand } from './release-updates.ts'

const roots: string[] = []
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const zipDigest = (zip: string) => createHash('sha256').update(zip).digest('hex')
const bundleId = zipDigest('test ZIP')
const envelope = (value: unknown) => {
  const payload = JSON.stringify(value)
  return JSON.stringify({ payload, signature: sign('sha256', Buffer.from(payload), privateKey).toString('base64') })
}
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture(rollout?: number) {
  const root = await mkdtemp(path.join(tmpdir(), 'tikkun-update-release-test-'))
  roots.push(root)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trimEnd()
  git('init', '-b', 'develop')
  git('config', 'user.name', 'Release Test')
  git('config', 'user.email', 'release@example.invalid')
  git('config', 'commit.gpgsign', 'false')
  git('config', 'core.hooksPath', '.git/no-hooks')
  git('remote', 'add', 'origin', 'https://github.com/AShortcuts/tikkun.app.git')
  const put = async (file: string, value: string) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), value)
  }
  await put('.gitignore', '.asc/\n')
  await put('package.json', JSON.stringify({ engines: { node: '22.23.2', npm: '11.19.0' }, repository: { url: 'git+https://github.com/AShortcuts/tikkun.app.git' } }))
  await put('config/update-public-key.pem', publicKey.export({ type: 'spki', format: 'pem' }).toString())
  await put('source.ts', 'export const value = 1\n')
  git('add', '.')
  git('commit', '-m', 'Source baseline')
  const sourceSha = git('rev-parse', 'HEAD')
  const options = parseReleaseOptions(['--native-build', '6', ...(rollout === undefined ? [] : ['--rollout', String(rollout)])], root)!
  const keyFile = path.join(root, '.asc/key.pem')
  await put('.asc/key.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
  await chmod(keyFile, 0o600)
  await put('.asc/artifacts/Tikkun-1.0-6.xcarchive/Products/Applications/App.app/public/native-update-contract.json', '{}')
  const calls: Array<{ command: string; args: string[] }> = []
  const logs: string[] = []
  const state = { failure: '', zip: 'test ZIP' }
  const run: ReleaseCommand = async (command, args) => {
    calls.push({ command, args })
    if (command === 'npm') {
      if (args[0] === '--version') return '11.19.0\n'
      if (args.includes(state.failure)) throw new Error(`Simulated failure: ${state.failure}`)
      if (args.includes('updates:web')) {
        const id = zipDigest(state.zip)
        await put(`.asc/updates/web/6/${id}.zip`, state.zip)
        await put('.asc/updates/web/6/latest.json', envelope({ schema: 1, channel: 'production', nativeBuild: '6', bundleId: id, checksum: id,
          signature: sign('sha256', Buffer.from(state.zip), privateKey).toString('base64'), bytes: Buffer.byteLength(state.zip), rollout: Number(args[args.indexOf('--rollout') + 1]) }))
      }
      if (args.includes('updates:stage')) {
        await mkdir(path.join(root, 'site/updates'), { recursive: true })
        await cp(path.join(root, '.asc/updates'), path.join(root, 'site/updates'), { recursive: true })
      }
      return ''
    }
    if (command === '/usr/bin/plutil') return '6\n'
    if (command !== 'git' || !['branch', 'status', 'rev-parse', 'ls-files'].includes(args[0])) {
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
    }
    return git(...args)
  }
  const services = { root, keyFile, run, platform: 'darwin', nodeVersion: '22.23.2',
    log: (message: string) => { logs.push(message) } }
  return { root, git, put, options, sourceSha, services, calls, logs, state }
}

test('validates preparation options and rejects publication flags', () => {
  expect(parseReleaseOptions(['--native-build', '6'])?.rollout).toBe(100)
  expect(parseReleaseOptions(['--help'])).toBeNull()
  for (const args of [[], ['--native-build', '../6'], ['--native-build', '6', '--rollout', '101'], ['--native-build', '6', '--rollout', '1.5'], ['--native-build', '6', '--yes'], ['--native-build', '6', '--deployment-timeout', '20']]) {
    expect(() => parseReleaseOptions(args)).toThrow()
  }
})

test('dry run does not build, sign, copy feeds, stage, commit or publish', async () => {
  const f = await fixture()
  expect(await releaseUpdates({ ...f.options, dryRun: true }, f.services)).toEqual({ status: 'dry-run' })
  expect(f.calls.filter(call => call.command === 'npm')).toEqual([{ command: 'npm', args: ['--version'] }])
  expect(f.git('status', '--porcelain')).toBe('')
  expect(f.git('rev-parse', 'HEAD')).toBe(f.sourceSha)
})

test.each([undefined, 10])('prepares the signed app update at rollout %s and copies it locally without changing Git history or index', async rollout => {
  const f = await fixture(rollout)
  await f.put('site/updates/existing.json', 'existing published feed')
  f.git('add', 'site/updates/existing.json')
  f.git('commit', '-m', 'Existing public feed')
  const head = f.git('rev-parse', 'HEAD')
  const result = await releaseUpdates(f.options, f.services)
  expect(result).toMatchObject({ status: 'prepared', bundleId, rollout: rollout ?? 100 })
  expect(result).toHaveProperty('paths', [
    `.asc/updates/web/6/${bundleId}.zip`,
    '.asc/updates/web/6/latest.json',
  ].sort())
  expect(f.git('rev-parse', 'HEAD')).toBe(head)
  expect(f.git('diff', '--cached', '--name-only')).toBe('')
  expect(await readFile(path.join(f.root, 'site/updates/existing.json'), 'utf8')).toBe('existing published feed')
  expect(f.calls.filter(call => call.command === 'npm' && call.args[0] === 'run').map(call => call.args[1]))
    .toEqual(['verify:release', 'build:native', 'updates:web', 'updates:stage', 'build'])
  expect(f.calls.some(call => call.command === 'gh' || ['add', 'commit', 'push', 'ls-remote'].includes(call.args[0]))).toBe(false)
  expect(f.logs.some(line => line.includes('Nothing Git-staged, committed, pushed, or published'))).toBe(true)
})

test.each(['unstaged', 'staged', 'untracked'])('preserves %s work when preflight rejects it', async kind => {
  const f = await fixture()
  const file = kind === 'untracked' ? 'new.ts' : 'source.ts'
  await f.put(file, 'changed')
  if (kind === 'staged') f.git('add', file)
  const before = f.git('status', '--porcelain')
  await expect(releaseUpdates(f.options, f.services)).rejects.toThrow('not clean')
  expect(f.git('status', '--porcelain')).toBe(before)
})

test('retains toolchain, branch and private-key safeguards', async () => {
  const f = await fixture()
  await expect(releaseUpdates(f.options, { ...f.services, nodeVersion: '26.0.0' })).rejects.toThrow('Use Node')
  f.git('switch', '-c', 'other')
  await expect(releaseUpdates(f.options, f.services)).rejects.toThrow('Run from develop')
  f.git('switch', 'develop')
  await chmod(f.services.keyFile, 0o644)
  await expect(releaseUpdates(f.options, f.services)).rejects.toThrow('owner-only')
})

test('rejects corrupted app update bytes before reporting prepared', async () => {
  const f = await fixture()
  const run = f.services.run
  f.services.run = async (command, args, capture) => {
    const result = await run(command, args, capture)
    if (command === 'npm' && args[1] === 'build') await f.put(`.asc/updates/web/6/${bundleId}.zip`, 'corrupted')
    return result
  }
  await expect(releaseUpdates(f.options, f.services)).rejects.toThrow('verification')
  expect(f.logs.some(message => message.startsWith('Prepared and verified'))).toBe(false)
  expect(f.git('diff', '--cached', '--name-only')).toBe('')
})

test('failed checks stop before signing', async () => {
  const f = await fixture()
  f.state.failure = 'verify:release'
  await expect(releaseUpdates(f.options, f.services)).rejects.toThrow('Simulated failure')
  expect(f.calls.some(call => call.args.includes('updates:web'))).toBe(false)
})

test('command executor captures output and surfaces subprocess failures', async () => {
  const f = await fixture()
  const run = releaseCommand(f.root, f.services.keyFile)
  expect(await run(process.execPath, ['-e', 'process.stdout.write("ok")'], true)).toBe('ok')
  await expect(run(process.execPath, ['-e', 'process.exit(7)'], true)).rejects.toThrow('failed (7)')
})


test('reruns replace tracked latest manifests and retain older downloads without staging', async () => {
  const f = await fixture()
  await releaseUpdates(f.options, f.services)
  f.git('add', 'site/updates')
  f.git('commit', '-m', 'First release')
  const head = f.git('rev-parse', 'HEAD')
  f.state.zip = 'new ZIP'
  await releaseUpdates(f.options, f.services)
  f.state.zip = 'newest ZIP'
  await releaseUpdates(f.options, f.services)
  const directory = path.join(f.root, 'site/updates/web/6')
  const latest = JSON.parse(JSON.parse(await readFile(path.join(directory, 'latest.json'), 'utf8')).payload)
  expect(latest.bundleId).toBe(zipDigest(f.state.zip))
  expect(await readFile(path.join(directory, `${latest.bundleId}.zip`), 'utf8')).toBe(f.state.zip)
  expect(await readFile(path.join(directory, `${bundleId}.zip`), 'utf8')).toBe('test ZIP')
  expect(f.git('diff', '--cached', '--name-only')).toBe('')
  expect(f.git('rev-parse', 'HEAD')).toBe(head)
})
