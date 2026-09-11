import { execFileSync } from 'node:child_process'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { assertPublishedRelease, deploymentState, githubRepository, parseReleaseOptions,
  releaseCommand, releaseUpdates, waitForUpdateDeployment } from './release-updates.ts'
import type { ReleaseCommand } from './release-updates.ts'

const roots: string[] = []
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const compatibility = 'c'.repeat(64)
const bundleId = createHash('sha256').update('test ZIP').digest('hex')
const contentDigest = createHash('sha256').update('test content').digest('hex')
const envelope = (value: unknown) => {
  const payload = JSON.stringify(value)
  return JSON.stringify({ payload, signature: sign('sha256', Buffer.from(payload), privateKey).toString('base64') })
}
const check = (sha: string, conclusion: string | null = 'success') => ({ check_runs: [
  { id: 1, name: 'Cloudflare Pages', app: { id: 85455 }, head_sha: sha, status: conclusion ? 'completed' : 'in_progress', conclusion },
] })

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
  await put('generated/native-content-contract.json', JSON.stringify({ compatibility }))
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
  const state = { remote: sourceSha, confirmation: true, failure: '', stale: false, deployment: 'success' }
  const run: ReleaseCommand = async (command, args) => {
    calls.push({ command, args })
    if (command === 'npm') {
      if (args[0] === '--version') return '11.19.0\n'
      if (args.includes(state.failure)) throw new Error(`Simulated failure: ${state.failure}`)
      if (args.includes('updates:stage')) {
        await put(`site/updates/web/6/${bundleId}.zip`, 'test ZIP')
        await put('site/updates/web/6/latest.json', envelope({ schema: 1, channel: 'production', nativeBuild: '6', bundleId, checksum: bundleId,
          signature: sign('sha256', Buffer.from('test ZIP'), privateKey).toString('base64'), bytes: 8, rollout: options.rollout }))
        await put(`site/updates/content/${compatibility}/${contentDigest}.json`, 'test content')
        await put(`site/updates/content/${compatibility}/latest.json`, envelope({ schema: 1, digest: contentDigest, bytes: 12 }))
      }
      if (args.includes('updates:verify')) return JSON.stringify({ verified: true, nativeBuild: '6', origin: 'https://tikkunreader.com',
        bundleId: state.stale ? '0'.repeat(64) : bundleId, contentDigest, rollout: options.rollout })
      return ''
    }
    if (command === '/usr/bin/plutil') return '6\n'
    if (command === 'gh') return args[3].includes('check-runs') ? JSON.stringify(check(git('rev-parse', 'HEAD'), state.deployment)) : 'AShortcuts/tikkun.app\n'
    if (command !== 'git') throw new Error(`Unexpected command: ${command}`)
    if (args[0] === 'ls-remote') return `${state.remote}\trefs/heads/develop\n`
    if (args[0] === 'push') return '' // No test ever invokes a real network push.
    return git(...args)
  }
  const services = { root, keyFile, run, platform: 'darwin', nodeVersion: '22.23.2', now: Date.now,
    log: (message: string) => { logs.push(message) }, sleep: async () => {}, confirm: async () => state.confirmation }
  return { root, git, put, options, sourceSha, services, calls, logs, state }
}

test('options default to full rollout and reject unsafe input', () => {
  expect(parseReleaseOptions(['--help'])).toBeNull()
  expect(parseReleaseOptions(['--native-build', '6'], '/test')).toMatchObject({ nativeBuild: '6', rollout: 100, timeoutMs: 1_200_000, archive: '/test/.asc/artifacts/Tikkun-1.0-6.xcarchive' })
  for (const args of [[], ['--native-build', '../6'], ['--native-build', '6', '--rollout', '101'], ['--native-build', '6', '--rollout', '1.5'], ['--native-build', '6', '--yes'], ['--native-build', '6', '--deployment-timeout', '0']]) {
    expect(() => parseReleaseOptions(args)).toThrow()
  }
  expect(parseReleaseOptions(['--native-build', '6', '--rollout', '0'])?.rollout).toBe(0)
})

test('remote parser permits GitHub transports without embedded credentials', () => {
  for (const remote of ['https://github.com/AShortcuts/tikkun.app.git', 'git+https://github.com/AShortcuts/tikkun.app.git', 'git@github.com:AShortcuts/tikkun.app.git']) {
    expect(githubRepository(remote)).toBe('AShortcuts/tikkun.app')
  }
  for (const remote of ['https://token@github.com/owner/repo', 'https://github.com.evil.test/owner/repo', 'file:///repo']) expect(() => githubRepository(remote)).toThrow()
})

test('dry run does not build, sign, stage, confirm, commit or push', async () => {
  const f = await fixture()
  expect(await releaseUpdates({ ...f.options, dryRun: true }, f.services)).toEqual({ status: 'dry-run' })
  expect(f.calls.filter(call => call.command === 'npm')).toEqual([{ command: 'npm', args: ['--version'] }])
  expect(f.git('status', '--porcelain')).toBe('')
  expect(f.git('rev-parse', 'HEAD')).toBe(f.sourceSha)
})

test.each(['unstaged', 'staged', 'untracked'])('rejects %s source changes without touching them', async kind => {
  const f = await fixture()
  const file = kind === 'untracked' ? 'notes.txt' : 'source.ts'
  await f.put(file, 'user change\n')
  if (kind === 'staged') f.git('add', file)
  const before = f.git('status', '--porcelain')
  await expect(releaseUpdates(f.options, f.services)).rejects.toThrow('not clean')
  expect(f.git('status', '--porcelain')).toBe(before)
  expect(f.calls.some(call => call.args.includes('verify:release'))).toBe(false)
})

test('rejects a wrong branch, runtime, or publicly readable private key', async () => {
  const f = await fixture()
  await expect(releaseUpdates(f.options, { ...f.services, nodeVersion: '26.0.0' })).rejects.toThrow('Use Node')
  f.git('switch', '-c', 'other')
  await expect(releaseUpdates(f.options, f.services)).rejects.toThrow('Run from develop')
  f.git('switch', 'develop')
  await chmod(f.services.keyFile, 0o644)
  await expect(releaseUpdates(f.options, f.services)).rejects.toThrow('owner-only')
})

test('supports an externally stored private key', async () => {
  const f = await fixture()
  const external = await mkdtemp(path.join(tmpdir(), 'tikkun-private-key-test-'))
  roots.push(external)
  const keyFile = path.join(external, 'key.pem')
  await writeFile(keyFile, await readFile(f.services.keyFile), { mode: 0o600 })
  await expect(releaseUpdates({ ...f.options, dryRun: true }, { ...f.services, keyFile })).resolves.toEqual({ status: 'dry-run' })
})

test('rejects a different push destination before building', async () => {
  const f = await fixture()
  f.git('remote', 'set-url', '--push', 'origin', 'https://github.com/other/project.git')
  await expect(releaseUpdates(f.options, f.services)).rejects.toThrow('fetch and push only')
  expect(f.calls.some(call => call.args.includes('verify:release'))).toBe(false)
})

test.each(['web', 'content'])('rejects corrupted %s bytes before preview or Git staging', async kind => {
  const f = await fixture()
  const run = f.services.run
  f.services.run = async (command, args, capture) => {
    const result = await run(command, args, capture)
    if (command === 'npm' && args[1] === 'build') {
      const file = kind === 'web' ? `site/updates/web/6/${bundleId}.zip` : `site/updates/content/${compatibility}/${contentDigest}.json`
      await f.put(file, 'corrupted before preview')
    }
    return result
  }
  await expect(releaseUpdates(f.options, f.services)).rejects.toThrow('verification')
  expect(f.logs.some(message => message.includes('Proposed commit'))).toBe(false)
  expect(f.calls.some(call => call.args[0] === 'push')).toBe(false)
  expect(f.git('diff', '--cached', '--name-only')).toBe('')
})

test('failed verification stops before signing and publication', async () => {
  const f = await fixture()
  f.state.failure = 'verify:release'
  await expect(releaseUpdates(f.options, f.services)).rejects.toThrow('Simulated failure')
  expect(f.calls.some(call => call.args.includes('updates:web') || call.args[0] === 'push')).toBe(false)
})

test('declining publication leaves generated assets unstaged, without a commit', async () => {
  const f = await fixture()
  f.state.confirmation = false
  expect(await releaseUpdates(f.options, f.services)).toEqual({ status: 'cancelled' })
  expect(f.git('diff', '--cached', '--name-only')).toBe('')
  expect(f.git('rev-parse', 'HEAD')).toBe(f.sourceSha)
  expect(f.calls.some(call => call.args[0] === 'push')).toBe(false)
  expect(f.logs.some(message => message.includes('Proposed commit'))).toBe(true)
})

test.each(['source', 'index', 'head', 'remote', 'destination', 'release'])('rejects concurrent %s changes at confirmation', async kind => {
  const f = await fixture()
  f.services.confirm = async () => {
    if (kind === 'source' || kind === 'index' || kind === 'head') await f.put('source.ts', 'concurrent change\n')
    if (kind === 'index' || kind === 'head') f.git('add', 'source.ts')
    if (kind === 'head') f.git('commit', '-m', 'Concurrent source change')
    if (kind === 'remote') f.state.remote = '0'.repeat(40)
    if (kind === 'destination') f.git('remote', 'set-url', '--push', 'origin', 'https://github.com/other/project.git')
    if (kind === 'release') await f.put(`site/updates/web/6/${bundleId}.zip`, 'changed after preview')
    return true
  }
  await expect(releaseUpdates(f.options, f.services)).rejects.toThrow(/changed|advanced|fetch and push only/)
  expect(f.calls.some(call => call.args[0] === 'push')).toBe(false)
})

test.each([undefined, 10])('complete flow preserves rollout %s through signing, confirmation and verification', async rollout => {
  const f = await fixture(rollout)
  let confirmation = ''
  f.services.confirm = async (message?: string) => { confirmation = message ?? ''; return true }
  const result = await releaseUpdates(f.options, f.services)
  expect(result.status).toBe('published')
  const expectedRollout = rollout ?? 100
  const webCommand = f.calls.find(call => call.args.includes('updates:web'))!
  expect(webCommand.args[webCommand.args.indexOf('--rollout') + 1]).toBe(String(expectedRollout))
  expect(confirmation).toContain(`at ${expectedRollout}% rollout?`)
  expect(f.git('log', '-1', '--format=%s')).toContain(`(${expectedRollout}% rollout)`)
  const sha = f.git('rev-parse', 'HEAD')
  expect(sha).not.toBe(f.sourceSha)
  expect(f.git('rev-parse', 'HEAD^')).toBe(f.sourceSha)
  const files = f.git('diff-tree', '--no-commit-id', '--name-only', '-r', sha).split('\n')
  expect(files).toHaveLength(4)
  expect(files.every(file => /^site\/updates\/(web|content)\//.test(file))).toBe(true)
  expect(f.git('status', '--porcelain')).toBe('')
  const push = f.calls.findIndex(call => call.args[0] === 'push')
  const deployment = f.calls.findIndex(call => call.command === 'gh' && call.args[3].includes('check-runs'))
  const verify = f.calls.findIndex(call => call.args.includes('updates:verify'))
  expect(f.calls[push].args).toEqual(['push', 'origin', `${sha}:refs/heads/develop`])
  expect(deployment).toBeGreaterThan(push)
  expect(verify).toBeGreaterThan(deployment)
  expect(f.calls.some(call => /wrangler|asc|sqim/.test(call.command))).toBe(false)
})

test.each(['failure', 'cancelled', 'timed_out'])('deployment %s keeps the commit and skips success/live verification', async conclusion => {
  const f = await fixture()
  f.state.deployment = conclusion
  await expect(releaseUpdates(f.options, f.services)).rejects.toThrow('deployment ended')
  expect(f.git('rev-parse', 'HEAD')).not.toBe(f.sourceSha)
  expect(f.calls.some(call => call.args.includes('updates:verify'))).toBe(false)
  expect(f.logs.some(message => message.startsWith('Release commit retained:'))).toBe(true)
})

test('an older valid signed live release is not reported as this release succeeding', async () => {
  const f = await fixture()
  f.state.stale = true
  await expect(releaseUpdates(f.options, f.services)).rejects.toThrow('does not match this release')
  expect(f.logs.some(message => message.startsWith('Published and verified:'))).toBe(false)
})

test('deployment waiting is bounded and ignores other commits/apps and old attempts', async () => {
  const sha = 'a'.repeat(40)
  expect(deploymentState(check('b'.repeat(40)), sha)).toBe('waiting')
  expect(deploymentState({ check_runs: [{ ...check(sha).check_runs[0], app: { id: 42 } }] }, sha)).toBe('waiting')
  expect(deploymentState({ check_runs: [check(sha, 'failure').check_runs[0], { ...check(sha).check_runs[0], id: 2 }] }, sha)).toBe('success')
  let time = 0
  let requests = 0
  await expect(waitForUpdateDeployment('owner/repo', sha, 60_000, {
    run: async () => { requests++; return JSON.stringify(check(sha, null)) }, now: () => time,
    sleep: async milliseconds => { time += milliseconds }, log: () => {},
  })).rejects.toThrow('Timed out')
  expect(requests).toBe(2)
})

test('published verification binds both digests, build, origin and rollout', () => {
  const expected = { bundleId, contentDigest, rollout: 10 }
  const live = { ...expected, verified: true, origin: 'https://tikkunreader.com', nativeBuild: '6' }
  expect(() => assertPublishedRelease(live, expected, '6')).not.toThrow()
  for (const change of [{ rollout: 100 }, { contentDigest: 'other' }, { nativeBuild: '7' }, { origin: 'https://other.test' }, { verified: false }]) {
    expect(() => assertPublishedRelease({ ...live, ...change }, expected, '6')).toThrow()
  }
})

test('command executor captures output and surfaces subprocess failures', async () => {
  const f = await fixture()
  const run = releaseCommand(f.root, f.services.keyFile)
  expect(await run(process.execPath, ['-e', 'process.stdout.write("ok")'], true)).toBe('ok')
  await expect(run(process.execPath, ['-e', 'process.exit(7)'], true)).rejects.toThrow('failed (7)')
})
