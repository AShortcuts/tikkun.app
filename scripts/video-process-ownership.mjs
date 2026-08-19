import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const registryVersion = 1
const transitionVersion = 1
const recorderScriptName = 'record-aliyah-videos.mjs'
const transitionRetryCount = 500
const transitionRetryDelayMs = 10

export function processRegistryPath(workRoot) {
  return `${path.resolve(workRoot)}.processes.json`
}

export function processRegistryTransitionPath(workRoot) {
  return `${processRegistryPath(workRoot)}.transition`
}

export async function inspectProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null

  try {
    const [{ stdout: startedAt }, { stdout: command }] = await Promise.all([
      execFileAsync('ps', ['-p', String(pid), '-o', 'lstart=']),
      execFileAsync('ps', ['-ww', '-p', String(pid), '-o', 'command=']),
    ])
    const normalizedStartedAt = startedAt.trim()
    const normalizedCommand = command.trim()
    if (!normalizedStartedAt || !normalizedCommand) return null
    return { pid, startedAt: normalizedStartedAt, command: normalizedCommand }
  } catch {
    return null
  }
}

export function processMatchesRecord(record, identity) {
  return Boolean(
    record &&
      identity &&
      record.pid === identity.pid &&
      record.startedAt === identity.startedAt &&
      record.command === identity.command
  )
}

function recorderCommandIsExpected(command) {
  return (
    typeof command === 'string' &&
    command.includes(recorderScriptName) &&
    !/(?:^|\s)(?:shutdown|cleanup)(?:\s|$)/.test(command)
  )
}

function isProcessRecord(value) {
  return (
    value &&
    Number.isInteger(value.pid) &&
    value.pid > 0 &&
    typeof value.startedAt === 'string' &&
    value.startedAt.length > 0 &&
    typeof value.command === 'string' &&
    value.command.length > 0 &&
    typeof value.kind === 'string' &&
    typeof value.cwd === 'string' &&
    typeof value.processGroup === 'boolean'
  )
}

function assertValidRegistry(registry, { repoRoot, workRoot }) {
  const expectedRepoRoot = path.resolve(repoRoot)
  const expectedWorkRoot = path.resolve(workRoot)
  if (
    !registry ||
    registry.version !== registryVersion ||
    typeof registry.runId !== 'string' ||
    registry.runId.length === 0 ||
    registry.repoRoot !== expectedRepoRoot ||
    registry.workRoot !== expectedWorkRoot ||
    !isProcessRecord(registry.owner) ||
    registry.owner.kind !== 'recorder' ||
    registry.owner.processGroup ||
    !recorderCommandIsExpected(registry.owner.command) ||
    !Array.isArray(registry.children) ||
    !registry.children.every(isProcessRecord)
  ) {
    throw new Error('Video process registry is invalid; refusing to signal any process')
  }
  return registry
}

async function readRegistry(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null
    throw error
  }
}

async function writeRegistry(filePath, registry) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 })
    await rename(temporaryPath, filePath)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}

async function createRegistry(filePath, registry) {
  try {
    await writeFile(filePath, `${JSON.stringify(registry, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    })
    return true
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      return false
    }
    throw error
  }
}

function transitionPathForRegistry(filePath) {
  return `${filePath}.transition`
}

async function readTransition(filePath) {
  try {
    return JSON.parse(await readFile(transitionPathForRegistry(filePath), 'utf8'))
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null
    throw error
  }
}

async function acquireRegistryTransition(
  filePath,
  { kind, runId = null, waitForExisting = true, waitForRetry = delay }
) {
  const transitionPath = transitionPathForRegistry(filePath)
  const transition = {
    version: transitionVersion,
    token: randomUUID(),
    kind,
    runId,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  }
  const attempts = waitForExisting ? transitionRetryCount : 1

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await writeFile(transitionPath, `${JSON.stringify(transition, null, 2)}\n`, {
        flag: 'wx',
        mode: 0o600,
      })
      return {
        async release() {
          const current = await readTransition(filePath)
          if (!current) return
          if (current.token !== transition.token) {
            throw new Error(
              'Video process registry transition changed; refusing to remove it'
            )
          }
          await rm(transitionPath, { force: true })
        },
      }
    } catch (error) {
      if (!error || typeof error !== 'object' || error.code !== 'EEXIST') {
        throw error
      }
      if (!waitForExisting) return null
      if (attempt + 1 < attempts) await waitForRetry(transitionRetryDelayMs)
    }
  }

  throw new Error(
    'Video process registry transition is already in progress; refusing to change ownership'
  )
}

export async function openOwnedProcessRegistry({
  repoRoot,
  workRoot,
  inspect = inspectProcess,
  ownerPid = process.pid,
  signalProcess = process.kill.bind(process),
  wait = delay,
  transitionWait = delay,
  termTimeoutMs = 5000,
  killTimeoutMs = 1000,
}) {
  const normalizedRepoRoot = path.resolve(repoRoot)
  const normalizedWorkRoot = path.resolve(workRoot)
  const filePath = processRegistryPath(normalizedWorkRoot)

  const ownerIdentity = await inspect(ownerPid)
  if (!ownerIdentity || !recorderCommandIsExpected(ownerIdentity.command)) {
    throw new Error('Could not verify video recorder process identity')
  }

  let registry = {
    version: registryVersion,
    runId: randomUUID(),
    repoRoot: normalizedRepoRoot,
    workRoot: normalizedWorkRoot,
    owner: {
      ...ownerIdentity,
      kind: 'recorder',
      cwd: normalizedRepoRoot,
      processGroup: false,
    },
    children: [],
  }

  const transition = await acquireRegistryTransition(filePath, {
    kind: 'acquire',
    runId: registry.runId,
    waitForRetry: transitionWait,
  })
  try {
    const previous = await readRegistry(filePath)
    if (previous) {
      const validated = assertValidRegistry(previous, {
        repoRoot: normalizedRepoRoot,
        workRoot: normalizedWorkRoot,
      })
      const previousOwner = await inspect(validated.owner.pid)
      if (processMatchesRecord(validated.owner, previousOwner)) {
        throw new Error(`Video recorder is already running as PID ${validated.owner.pid}`)
      }

      await stopRegistryProcesses(validated, {
        inspect,
        signalProcess,
        wait,
        termTimeoutMs,
        killTimeoutMs,
      })
      await rm(filePath, { force: true })
    }

    if (!(await createRegistry(filePath, registry))) {
      throw new Error('Could not acquire the video process registry')
    }
  } finally {
    await transition.release()
  }

  let writeQueue = Promise.resolve()

  const update = (mutate) => {
    registry = mutate(registry)
    const snapshot = JSON.parse(JSON.stringify(registry))
    writeQueue = writeQueue.then(() => writeRegistry(filePath, snapshot))
    return writeQueue
  }

  await writeQueue

  return {
    filePath,
    runId: registry.runId,
    async add(child, { kind, cwd }) {
      let identity = null
      for (let attempt = 0; attempt < 5 && !identity; attempt += 1) {
        identity = await inspect(child.pid)
        if (!identity) await new Promise((resolve) => setTimeout(resolve, 20))
      }
      if (!identity) return null
      const record = {
        ...identity,
        kind,
        cwd: path.resolve(cwd),
        processGroup: process.platform !== 'win32',
      }
      await update((current) => ({
        ...current,
        children: current.children
          .filter((entry) => entry.pid !== record.pid)
          .concat(record),
      }))
      return record
    },
    async remove(record) {
      if (!record) return
      await update((current) => ({
        ...current,
        children: current.children.filter(
          (entry) => entry.pid !== record.pid || entry.startedAt !== record.startedAt
        ),
      }))
    },
    async close() {
      await writeQueue
      const transition = await acquireRegistryTransition(filePath, {
        kind: 'close',
        runId: registry.runId,
        waitForExisting: false,
      })
      if (!transition) return
      try {
        const current = await readRegistry(filePath)
        if (current?.runId === registry.runId) {
          await rm(filePath, { force: true })
        }
      } finally {
        await transition.release()
      }
    },
  }
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitForRecordedProcessExit(record, { inspect, wait }, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const identity = await inspect(record.pid)
    if (!processMatchesRecord(record, identity)) return true
    await wait(100)
  }
  return !processMatchesRecord(record, await inspect(record.pid))
}

async function signalRecordedProcess(record, signal, signalProcess) {
  const target = record.processGroup && process.platform !== 'win32' ? -record.pid : record.pid
  try {
    signalProcess(target, signal)
    return true
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ESRCH') return false
    throw error
  }
}

async function stopRecordedProcess(record, dependencies) {
  const identity = await dependencies.inspect(record.pid)
  if (!processMatchesRecord(record, identity)) return false

  await signalRecordedProcess(record, 'SIGTERM', dependencies.signalProcess)
  const exited = await waitForRecordedProcessExit(record, dependencies, dependencies.termTimeoutMs)
  if (!exited) {
    await signalRecordedProcess(record, 'SIGKILL', dependencies.signalProcess)
    const killed = await waitForRecordedProcessExit(
      record,
      dependencies,
      dependencies.killTimeoutMs
    )
    if (!killed) throw new Error(`Owned ${record.kind} process ${record.pid} did not stop`)
  }
  return true
}

async function stopRegistryProcesses(registry, dependencies) {
  const stopped = []
  if (await stopRecordedProcess(registry.owner, dependencies)) {
    stopped.push(registry.owner.kind)
  }

  await Promise.all(
    registry.children.map(async (record) => {
      if (await stopRecordedProcess(record, dependencies)) stopped.push(record.kind)
    })
  )
  return stopped
}

export async function shutdownOwnedRun({
  repoRoot,
  workRoot,
  expectedRunId = undefined,
  inspect = inspectProcess,
  signalProcess = process.kill.bind(process),
  wait = delay,
  transitionWait = delay,
  termTimeoutMs = 5000,
  killTimeoutMs = 1000,
  cleanup = () => {},
}) {
  const filePath = processRegistryPath(workRoot)
  const transition = await acquireRegistryTransition(filePath, {
    kind: 'shutdown',
    runId: expectedRunId,
    waitForRetry: transitionWait,
  })
  try {
    const stored = await readRegistry(filePath)
    if (!stored) {
      await cleanup()
      return { status: 'not-running', stopped: [] }
    }
    if (expectedRunId && stored.runId !== expectedRunId) {
      return { status: 'changed', stopped: [] }
    }

    const registry = assertValidRegistry(stored, { repoRoot, workRoot })
    const dependencies = { inspect, signalProcess, wait, termTimeoutMs, killTimeoutMs }
    const stopped = await stopRegistryProcesses(registry, dependencies)
    await cleanup()
    await rm(filePath, { force: true })

    return { status: stopped.length ? 'stopped' : 'stale', stopped }
  } finally {
    await transition.release()
  }
}
