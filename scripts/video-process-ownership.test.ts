import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import {
  openOwnedProcessRegistry,
  processMatchesRecord,
  processRegistryPath,
  processRegistryTransitionPath,
  shutdownOwnedRun,
} from './video-process-ownership.mjs'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true })
      await rm(processRegistryPath(root), { force: true })
      await rm(processRegistryTransitionPath(root), { force: true })
    })
  )
})

async function makeWorkRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tikkun-process-registry-'))
  temporaryRoots.push(root)
  return root
}

function childProcess(pid: number) {
  const child = new EventEmitter() as EventEmitter & { pid: number }
  child.pid = pid
  return child
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

test('process identity requires PID, start marker, and command to match', () => {
  const record = { pid: 101, startedAt: 'start-a', command: 'node recorder' }

  expect(processMatchesRecord(record, { ...record })).toBe(true)
  expect(processMatchesRecord(record, { ...record, startedAt: 'start-b' })).toBe(false)
  expect(processMatchesRecord(record, { ...record, command: 'vite' })).toBe(false)
  expect(processMatchesRecord(record, null)).toBe(false)
})

test('second recorder cannot replace registry owned by matching live process', async () => {
  const workRoot = await makeWorkRoot()
  const repoRoot = path.join(workRoot, 'repo')
  const owner = {
    pid: 101,
    startedAt: 'Wed Aug 19 12:00:00 2026',
    command: 'node scripts/record-aliyah-videos.mjs',
  }
  const inspect = async () => owner
  const registry = await openOwnedProcessRegistry({ repoRoot, workRoot, inspect, ownerPid: 101 })

  await expect(
    openOwnedProcessRegistry({ repoRoot, workRoot, inspect, ownerPid: 202 })
  ).rejects.toThrow('Video recorder is already running as PID 101')

  await registry.close()
})

test('parallel recorders acquire the registry atomically', async () => {
  const workRoot = await makeWorkRoot()
  const repoRoot = path.join(workRoot, 'repo')
  const inspect = async (pid: number) => ({
    pid,
    startedAt: `start-${pid}`,
    command: 'node scripts/record-aliyah-videos.mjs',
  })

  const attempts = await Promise.allSettled([
    openOwnedProcessRegistry({ repoRoot, workRoot, inspect, ownerPid: 101 }),
    openOwnedProcessRegistry({ repoRoot, workRoot, inspect, ownerPid: 202 }),
  ])
  const acquired = attempts.filter(
    (attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof openOwnedProcessRegistry>>> =>
      attempt.status === 'fulfilled'
  )
  const rejected = attempts.filter(
    (attempt): attempt is PromiseRejectedResult => attempt.status === 'rejected'
  )

  expect(acquired).toHaveLength(1)
  expect(rejected).toHaveLength(1)
  expect(rejected[0]?.reason).toMatchObject({
    message: expect.stringContaining('Video recorder is already running'),
  })
  await acquired[0]?.value.close()
})

test('recovery stops children left by a stale recorder before replacing it', async () => {
  const workRoot = await makeWorkRoot()
  const repoRoot = path.join(workRoot, 'repo')
  const identities = new Map([
    [101, { pid: 101, startedAt: 'old-owner', command: 'node record-aliyah-videos.mjs' }],
    [202, { pid: 202, startedAt: 'child-start', command: 'npm run dev -- --port 4177' }],
    [303, { pid: 303, startedAt: 'new-owner', command: 'node record-aliyah-videos.mjs' }],
  ])
  const inspect = async (pid: number) => identities.get(pid) ?? null
  const staleRegistry = await openOwnedProcessRegistry({
    repoRoot,
    workRoot,
    inspect,
    ownerPid: 101,
  })
  await staleRegistry.add(childProcess(202), { kind: 'vite', cwd: repoRoot })
  identities.delete(101)
  const signals: number[] = []

  const replacement = await openOwnedProcessRegistry({
    repoRoot,
    workRoot,
    inspect,
    ownerPid: 303,
    signalProcess(target) {
      signals.push(target)
      identities.delete(Math.abs(target))
      return true
    },
    wait: async () => {},
  })

  expect(signals).toEqual([process.platform === 'win32' ? 202 : -202])
  expect(JSON.parse(await readFile(processRegistryPath(workRoot), 'utf8'))).toMatchObject({
    owner: { pid: 303 },
    children: [],
  })
  await replacement.close()
})

test('stale recovery holds ownership until replacement is complete', async () => {
  const workRoot = await makeWorkRoot()
  const repoRoot = path.join(workRoot, 'repo')
  const identities = new Map([
    [101, { pid: 101, startedAt: 'old-owner', command: 'node record-aliyah-videos.mjs' }],
    [202, { pid: 202, startedAt: 'child-start', command: 'npm run dev -- --port 4177' }],
    [303, { pid: 303, startedAt: 'new-owner-a', command: 'node record-aliyah-videos.mjs' }],
    [404, { pid: 404, startedAt: 'new-owner-b', command: 'node record-aliyah-videos.mjs' }],
  ])
  const inspect = async (pid: number) => identities.get(pid) ?? null
  const staleRegistry = await openOwnedProcessRegistry({
    repoRoot,
    workRoot,
    inspect,
    ownerPid: 101,
  })
  await staleRegistry.add(childProcess(202), { kind: 'vite', cwd: repoRoot })
  identities.delete(101)
  const signals: number[] = []
  const recoveryWaiting = deferred()
  const allowChildExit = deferred()
  const contenderBlocked = deferred()
  const allowContenderRetry = deferred()

  const recovery = openOwnedProcessRegistry({
    repoRoot,
    workRoot,
    inspect,
    ownerPid: 303,
    signalProcess(target: number): true {
      signals.push(target)
      return true
    },
    wait: async () => {
      recoveryWaiting.resolve()
      await allowChildExit.promise
      identities.delete(202)
    },
  })
  await recoveryWaiting.promise

  const contender = openOwnedProcessRegistry({
    repoRoot,
    workRoot,
    inspect,
    ownerPid: 404,
    transitionWait: async () => {
      contenderBlocked.resolve()
      await allowContenderRetry.promise
    },
  })
  await contenderBlocked.promise

  expect(JSON.parse(await readFile(processRegistryPath(workRoot), 'utf8'))).toMatchObject({
    owner: { pid: 101 },
  })
  allowChildExit.resolve()
  const replacement = await recovery
  allowContenderRetry.resolve()
  await expect(contender).rejects.toThrow('Video recorder is already running as PID 303')
  expect(signals).toEqual([process.platform === 'win32' ? 202 : -202])
  expect(JSON.parse(await readFile(processRegistryPath(workRoot), 'utf8'))).toMatchObject({
    owner: { pid: 303 },
  })
  await replacement.close()
})

test('shutdown cleanup blocks a successor until the old work root is gone', async () => {
  const workRoot = await makeWorkRoot()
  const repoRoot = path.join(workRoot, 'repo')
  await writeFile(path.join(workRoot, 'old-frame.png'), 'old')
  const identities = new Map([
    [101, { pid: 101, startedAt: 'old-owner', command: 'node record-aliyah-videos.mjs' }],
    [303, { pid: 303, startedAt: 'new-owner', command: 'node record-aliyah-videos.mjs' }],
  ])
  const inspect = async (pid: number) => identities.get(pid) ?? null
  await openOwnedProcessRegistry({ repoRoot, workRoot, inspect, ownerPid: 101 })
  const cleanupStarted = deferred()
  const allowCleanup = deferred()
  const contenderBlocked = deferred()
  const allowContenderRetry = deferred()

  const shutdown = shutdownOwnedRun({
    repoRoot,
    workRoot,
    inspect,
    signalProcess(target) {
      identities.delete(Math.abs(target))
      return true
    },
    wait: async () => {},
    cleanup: async () => {
      cleanupStarted.resolve()
      await allowCleanup.promise
      await rm(workRoot, { recursive: true, force: true })
    },
  })
  await cleanupStarted.promise

  const successor = openOwnedProcessRegistry({
    repoRoot,
    workRoot,
    inspect,
    ownerPid: 303,
    transitionWait: async () => {
      contenderBlocked.resolve()
      await allowContenderRetry.promise
    },
  })
  await contenderBlocked.promise
  expect(await readFile(path.join(workRoot, 'old-frame.png'), 'utf8')).toBe('old')

  allowCleanup.resolve()
  await expect(shutdown).resolves.toEqual({ status: 'stopped', stopped: ['recorder'] })
  allowContenderRetry.resolve()
  const replacement = await successor
  await mkdir(workRoot, { recursive: true })
  await writeFile(path.join(workRoot, 'new-frame.png'), 'new')

  expect(await readFile(path.join(workRoot, 'new-frame.png'), 'utf8')).toBe('new')
  expect(JSON.parse(await readFile(processRegistryPath(workRoot), 'utf8'))).toMatchObject({
    owner: { pid: 303 },
  })
  await replacement.close()
})

test('shutdown signals only exact registered owner and child process group', async () => {
  const workRoot = await makeWorkRoot()
  const repoRoot = path.join(workRoot, 'repo')
  const identities = new Map([
    [101, { pid: 101, startedAt: 'owner-start', command: 'node record-aliyah-videos.mjs' }],
    [202, { pid: 202, startedAt: 'child-start', command: 'npm run dev -- --port 4177' }],
    [303, { pid: 303, startedAt: 'probe-start', command: 'ffprobe output.mp4' }],
    [404, { pid: 404, startedAt: 'validation-start', command: 'ffmpeg -v error' }],
  ])
  const inspect = async (pid: number) => identities.get(pid) ?? null
  const registry = await openOwnedProcessRegistry({ repoRoot, workRoot, inspect, ownerPid: 101 })
  await registry.add(childProcess(202), { kind: 'vite', cwd: repoRoot })
  await registry.add(childProcess(303), { kind: 'ffprobe', cwd: repoRoot })
  await registry.add(childProcess(404), { kind: 'ffmpeg-validation', cwd: repoRoot })
  const signals: Array<[number, string | number | undefined]> = []

  const result = await shutdownOwnedRun({
    repoRoot,
    workRoot,
    inspect,
    signalProcess(target, signal) {
      signals.push([target, signal])
      identities.delete(Math.abs(target))
      return true
    },
    wait: async () => {},
  })

  expect(result.status).toBe('stopped')
  expect(result.stopped).toHaveLength(4)
  expect(result.stopped).toEqual(
    expect.arrayContaining(['recorder', 'vite', 'ffprobe', 'ffmpeg-validation'])
  )
  expect(signals).toHaveLength(4)
  expect(signals[0]).toEqual([101, 'SIGTERM'])
  expect(signals.slice(1)).toEqual(
    expect.arrayContaining([
      [process.platform === 'win32' ? 202 : -202, 'SIGTERM'],
      [process.platform === 'win32' ? 303 : -303, 'SIGTERM'],
      [process.platform === 'win32' ? 404 : -404, 'SIGTERM'],
    ])
  )
  await expect(readFile(processRegistryPath(workRoot), 'utf8')).rejects.toMatchObject({
    code: 'ENOENT',
  })
})

test('recorder routes validation tools through its owned process gateway', async () => {
  const source = await readFile(new URL('./record-aliyah-videos.mjs', import.meta.url), 'utf8')
  const ffprobeSource = source.slice(
    source.indexOf('async function ffprobe'),
    source.indexOf('function parseFrameRate')
  )
  const validationSource = source.slice(
    source.indexOf('async function validateOutput'),
    source.indexOf('async function activeWordSample')
  )

  expect(source.match(/\bspawn\s*\(/g)).toHaveLength(1)
  expect(source).not.toMatch(/\bexecFile\s*\(/)
  expect(ffprobeSource).toContain("'ffprobe'")
  expect(validationSource).toContain("'ffmpeg-validation'")
})

test('stale registry never signals a reused PID', async () => {
  const workRoot = await makeWorkRoot()
  const repoRoot = path.join(workRoot, 'repo')
  const owner = { pid: 101, startedAt: 'old-start', command: 'node record-aliyah-videos.mjs' }
  const registry = await openOwnedProcessRegistry({
    repoRoot,
    workRoot,
    inspect: async () => owner,
    ownerPid: owner.pid,
  })
  const signals: number[] = []

  const result = await shutdownOwnedRun({
    repoRoot,
    workRoot,
    inspect: async () => ({ ...owner, startedAt: 'new-start', command: 'unrelated process' }),
    signalProcess(target) {
      signals.push(target)
      return true
    },
    wait: async () => {},
  })

  expect(result).toEqual({ status: 'stale', stopped: [] })
  expect(signals).toEqual([])
  await registry.close()
})

test('invalid registry fails closed without signaling', async () => {
  const workRoot = await makeWorkRoot()
  const repoRoot = path.join(workRoot, 'repo')
  await writeFile(
    processRegistryPath(workRoot),
    JSON.stringify({ version: 1, repoRoot, workRoot, owner: { pid: 101 } })
  )
  const signals: number[] = []

  await expect(
    shutdownOwnedRun({
      repoRoot,
      workRoot,
      signalProcess(target) {
        signals.push(target)
        return true
      },
    })
  ).rejects.toThrow('Video process registry is invalid; refusing to signal any process')
  expect(signals).toEqual([])
})
