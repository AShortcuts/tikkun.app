import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, expect, test, vi } from 'vitest'
import {
  inspectOwnedRun,
  openOwnedProcessRegistry,
  processMatchesRecord,
  processRegistryPath,
  processRegistryTransitionPath,
  shutdownOwnedRun,
} from './video-process-ownership.mjs'

const execFileAsync = promisify(execFile)
const recorderScriptPath = fileURLToPath(
  new URL('./record-aliyah-videos.mjs', import.meta.url)
)
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

type TestProcessIdentity = {
  pid: number
  startedAt: string
  command: string
  cwd?: string
}

function inspectFromMap(
  identities: ReadonlyMap<number, TestProcessIdentity>,
  fallbackCwd: string
) {
  return async (pid: number) => {
    const identity = identities.get(pid)
    return identity
      ? { ...identity, cwd: path.resolve(identity.cwd ?? fallbackCwd) }
      : null
  }
}

test('process identity requires PID, start marker, command, and cwd to match', () => {
  const record = {
    pid: 101,
    startedAt: 'start-a',
    command: 'node recorder',
    cwd: '/repo',
  }

  expect(processMatchesRecord(record, { ...record })).toBe(true)
  expect(processMatchesRecord(record, { ...record, startedAt: 'start-b' })).toBe(false)
  expect(processMatchesRecord(record, { ...record, command: 'vite' })).toBe(false)
  expect(processMatchesRecord(record, { ...record, cwd: '/other-repo' })).toBe(false)
  expect(processMatchesRecord(record, null)).toBe(false)
})

test('registry refuses a child whose inspected cwd differs from its spawn cwd', async () => {
  const workRoot = await makeWorkRoot()
  const repoRoot = path.join(workRoot, 'repo')
  const identities = new Map<number, TestProcessIdentity>([
    [
      101,
      {
        pid: 101,
        startedAt: 'owner-start',
        command: 'node record-aliyah-videos.mjs',
        cwd: repoRoot,
      },
    ],
    [
      202,
      {
        pid: 202,
        startedAt: 'child-start',
        command: 'npm run dev -- --port 4177',
        cwd: path.join(workRoot, 'different-repo'),
      },
    ],
  ])
  const registry = await openOwnedProcessRegistry({
    repoRoot,
    workRoot,
    inspect: inspectFromMap(identities, repoRoot),
    ownerPid: 101,
  })

  await expect(
    registry.add(childProcess(202), { kind: 'vite', cwd: repoRoot })
  ).resolves.toBeNull()
  expect(JSON.parse(await readFile(processRegistryPath(workRoot), 'utf8'))).toMatchObject({
    children: [],
  })

  await registry.close()
})

test('read-only inspection reports exact running, stale, and mismatched identities', async () => {
  const workRoot = await makeWorkRoot()
  const repoRoot = path.join(workRoot, 'repo')
  const markerPath = path.join(workRoot, 'keep.txt')
  await writeFile(markerPath, 'keep')
  const identities = new Map([
    [101, { pid: 101, startedAt: 'owner-start', command: 'node record-aliyah-videos.mjs' }],
    [202, { pid: 202, startedAt: 'vite-start', command: 'npm run dev -- --port 4177' }],
    [303, { pid: 303, startedAt: 'probe-start', command: 'ffprobe output.mp4' }],
    [404, { pid: 404, startedAt: 'validation-start', command: 'ffmpeg -v error' }],
  ])
  const inspect = inspectFromMap(identities, repoRoot)
  const registry = await openOwnedProcessRegistry({
    repoRoot,
    workRoot,
    inspect,
    ownerPid: 101,
  })
  await registry.add(childProcess(202), { kind: 'vite', cwd: repoRoot })
  await registry.add(childProcess(303), { kind: 'ffprobe', cwd: repoRoot })
  await registry.add(childProcess(404), { kind: 'ffmpeg-validation', cwd: repoRoot })
  identities.delete(303)
  identities.set(404, {
    pid: 404,
    startedAt: 'reused-start',
    command: 'unrelated process',
  })
  const registryBefore = await readFile(processRegistryPath(workRoot), 'utf8')

  const result = await inspectOwnedRun({ repoRoot, workRoot, inspect })

  expect(result.status).toBe('partial')
  expect(
    result.processes.map(({ role, kind, pid, state }) => ({ role, kind, pid, state }))
  ).toEqual([
    { role: 'owner', kind: 'recorder', pid: 101, state: 'running' },
    { role: 'child', kind: 'vite', pid: 202, state: 'running' },
    { role: 'child', kind: 'ffprobe', pid: 303, state: 'stale' },
    { role: 'child', kind: 'ffmpeg-validation', pid: 404, state: 'mismatch' },
  ])
  expect(result.processes[3]).toMatchObject({
    expected: {
      startedAt: 'validation-start',
      command: 'ffmpeg -v error',
      cwd: path.resolve(repoRoot),
    },
    observed: {
      pid: 404,
      startedAt: 'reused-start',
      command: 'unrelated process',
      cwd: path.resolve(repoRoot),
    },
  })
  expect(await readFile(processRegistryPath(workRoot), 'utf8')).toBe(registryBefore)
  expect(await readFile(markerPath, 'utf8')).toBe('keep')
  await expect(readFile(processRegistryTransitionPath(workRoot), 'utf8')).rejects.toMatchObject({
    code: 'ENOENT',
  })

  identities.clear()
  await expect(inspectOwnedRun({ repoRoot, workRoot, inspect })).resolves.toMatchObject({
    status: 'stale',
    processes: expect.arrayContaining([expect.objectContaining({ state: 'stale' })]),
  })
  identities.set(101, {
    pid: 101,
    startedAt: 'reused-owner',
    command: 'unrelated process',
  })
  await expect(inspectOwnedRun({ repoRoot, workRoot, inspect })).resolves.toMatchObject({
    status: 'mismatched',
    processes: expect.arrayContaining([expect.objectContaining({ state: 'mismatch' })]),
  })

  await registry.close()
})

test('shutdown dry-run never signals, cleans, locks, or changes its registry', async () => {
  const workRoot = await makeWorkRoot()
  const repoRoot = path.join(workRoot, 'repo')
  const markerPath = path.join(workRoot, 'keep.txt')
  await writeFile(markerPath, 'keep')
  const identities = new Map([
    [101, { pid: 101, startedAt: 'owner-start', command: 'node record-aliyah-videos.mjs' }],
    [202, { pid: 202, startedAt: 'vite-start', command: 'npm run dev -- --port 4177' }],
  ])
  const inspect = inspectFromMap(identities, repoRoot)
  const registry = await openOwnedProcessRegistry({
    repoRoot,
    workRoot,
    inspect,
    ownerPid: 101,
  })
  await registry.add(childProcess(202), { kind: 'vite', cwd: repoRoot })
  const registryBefore = await readFile(processRegistryPath(workRoot), 'utf8')
  const signalProcess = vi.fn((): true => true)
  const cleanup = vi.fn(async () => {})

  const result = await shutdownOwnedRun({
    repoRoot,
    workRoot,
    dryRun: true,
    inspect,
    signalProcess,
    cleanup,
  })

  expect(result).toMatchObject({
    status: 'dry-run',
    stopped: [],
    wouldStop: [
      { kind: 'recorder', pid: 101 },
      { kind: 'vite', pid: 202 },
    ],
    inspection: { status: 'running' },
  })
  expect(signalProcess).not.toHaveBeenCalled()
  expect(cleanup).not.toHaveBeenCalled()
  expect(await readFile(processRegistryPath(workRoot), 'utf8')).toBe(registryBefore)
  expect(await readFile(markerPath, 'utf8')).toBe('keep')
  await expect(readFile(processRegistryTransitionPath(workRoot), 'utf8')).rejects.toMatchObject({
    code: 'ENOENT',
  })

  await registry.close()
})

test('status and shutdown dry-run CLI modes preserve an unowned work root', async () => {
  const workRoot = await makeWorkRoot()
  const markerPath = path.join(workRoot, 'keep.txt')
  await writeFile(markerPath, 'keep')

  const status = JSON.parse(
    (
      await execFileAsync(process.execPath, [
        recorderScriptPath,
        'status',
        `--work-root=${workRoot}`,
      ])
    ).stdout
  )
  const dryRun = JSON.parse(
    (
      await execFileAsync(process.execPath, [
        recorderScriptPath,
        'shutdown',
        '--dry-run',
        `--work-root=${workRoot}`,
      ])
    ).stdout
  )

  expect(status).toMatchObject({ status: 'not-running', processes: [] })
  expect(dryRun).toMatchObject({
    status: 'dry-run',
    stopped: [],
    wouldStop: [],
    inspection: { status: 'not-running', processes: [] },
  })
  expect(await readFile(markerPath, 'utf8')).toBe('keep')
  await expect(readFile(processRegistryTransitionPath(workRoot), 'utf8')).rejects.toMatchObject({
    code: 'ENOENT',
  })
})

test('read-only inspection rejects an invalid owner without touching its registry', async () => {
  const workRoot = await makeWorkRoot()
  const repoRoot = path.join(workRoot, 'repo')
  const filePath = processRegistryPath(workRoot)
  const source = `${JSON.stringify({
    version: 1,
    runId: 'invalid-owner',
    repoRoot: path.resolve(repoRoot),
    workRoot: path.resolve(workRoot),
    owner: {
      pid: 101,
      startedAt: 'owner-start',
      command: 'node scripts/record-aliyah-videos.mjs status',
      kind: 'recorder',
      cwd: path.resolve(repoRoot),
      processGroup: false,
    },
    children: [],
  }, null, 2)}\n`
  await writeFile(filePath, source)
  const inspect = vi.fn(async () => null)

  await expect(inspectOwnedRun({ repoRoot, workRoot, inspect })).rejects.toThrow(
    'Video process registry is invalid; inspection stopped without changing it'
  )
  expect(inspect).not.toHaveBeenCalled()
  expect(await readFile(filePath, 'utf8')).toBe(source)
  await expect(readFile(processRegistryTransitionPath(workRoot), 'utf8')).rejects.toMatchObject({
    code: 'ENOENT',
  })
})

test('second recorder cannot replace registry owned by matching live process', async () => {
  const workRoot = await makeWorkRoot()
  const repoRoot = path.join(workRoot, 'repo')
  const owner = {
    pid: 101,
    startedAt: 'Wed Aug 19 12:00:00 2026',
    command: 'node scripts/record-aliyah-videos.mjs',
    cwd: path.resolve(repoRoot),
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
    cwd: path.resolve(repoRoot),
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
  const inspect = inspectFromMap(identities, repoRoot)
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
  const inspect = inspectFromMap(identities, repoRoot)
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
  const inspect = inspectFromMap(identities, repoRoot)
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
  const inspect = inspectFromMap(identities, repoRoot)
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
  const owner = {
    pid: 101,
    startedAt: 'old-start',
    command: 'node record-aliyah-videos.mjs',
    cwd: path.resolve(repoRoot),
  }
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

test('shutdown never signals a process whose cwd changed', async () => {
  const workRoot = await makeWorkRoot()
  const repoRoot = path.join(workRoot, 'repo')
  const owner = {
    pid: 101,
    startedAt: 'owner-start',
    command: 'node record-aliyah-videos.mjs',
    cwd: path.resolve(repoRoot),
  }
  const registry = await openOwnedProcessRegistry({
    repoRoot,
    workRoot,
    inspect: async () => owner,
    ownerPid: owner.pid,
  })
  const signalProcess = vi.fn((): true => true)

  const result = await shutdownOwnedRun({
    repoRoot,
    workRoot,
    inspect: async () => ({
      ...owner,
      cwd: path.join(workRoot, 'different-repo'),
    }),
    signalProcess,
    wait: async () => {},
  })

  expect(result).toEqual({ status: 'stale', stopped: [] })
  expect(signalProcess).not.toHaveBeenCalled()
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
