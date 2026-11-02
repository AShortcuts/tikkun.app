
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { openOwnedProcessRegistry, processMatchesRecord, processRegistryPath, processRegistryTransitionPath, shutdownOwnedRun } from './video-process-ownership.mjs'

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
