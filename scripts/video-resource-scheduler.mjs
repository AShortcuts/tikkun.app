import os from 'node:os'
import process from 'node:process'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { statfs } from 'node:fs/promises'

const GiB = 1024 ** 3
const execFileAsync = promisify(execFile)

export function macAvailableMemory(output, totalMemory) {
  const match = output.match(/System-wide memory free percentage:\s*(\d+(?:\.\d+)?)%/)
  const percent = match ? Number(match[1]) : NaN
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error('macOS memory pressure query did not return a valid available-memory percentage')
  }
  return totalMemory * percent / 100
}

async function availableMemory(totalMemory) {
  if (process.platform !== 'darwin') return os.freemem()
  // Raw free pages exclude memory macOS can reclaim. -Q only queries; it does
  // not allocate memory or simulate pressure like this utility's other modes.
  const { stdout } = await execFileAsync('/usr/bin/memory_pressure', ['-Q'], {
    timeout: 5000,
    env: { ...process.env, LC_ALL: 'C' },
  })
  return macAvailableMemory(stdout, totalMemory)
}

export function createResourceSampler(workRoot, outputRoot) {
  let previousCpu = null
  return async () => {
    const cpus = os.cpus()
    const cpu = cpus.reduce((sum, core) => ({
      idle: sum.idle + core.times.idle,
      total: sum.total + Object.values(core.times).reduce((a, b) => a + b, 0),
    }), { idle: 0, total: 0 })
    const elapsed = previousCpu ? cpu.total - previousCpu.total : 0
    const cpuUsage = elapsed > 0
      ? 1 - (cpu.idle - previousCpu.idle) / elapsed
      : Math.min(1, os.loadavg()[0] / cpus.length)
    previousCpu = cpu
    const totalMemory = os.totalmem()
    const [workDisk, outputDisk, freeMemory] = await Promise.all([
      statfs(workRoot), statfs(outputRoot), availableMemory(totalMemory),
    ])
    return {
      cpuCount: cpus.length,
      cpuUsage,
      totalMemory,
      freeMemory,
      freeDisk: Math.min(...[workDisk, outputDisk].map((disk) => disk.bavail * disk.bsize)),
    }
  }
}

export function resourceDecision(snapshot, { target, limit, memoryPerJob }) {
  for (const key of ['cpuCount', 'totalMemory', 'freeMemory', 'freeDisk']) {
    if (!Number.isFinite(snapshot[key]) || snapshot[key] < 0) {
      throw new Error(`Resource monitor returned invalid ${key}`)
    }
  }
  if (snapshot.cpuCount < 1 || snapshot.totalMemory <= 0 ||
      !Number.isFinite(snapshot.cpuUsage) || snapshot.cpuUsage < 0 || snapshot.cpuUsage > 1) {
    throw new Error('Resource monitor returned invalid CPU or memory capacity')
  }
  const reserve = Math.max(GiB, snapshot.totalMemory * 0.15)
  const criticalMemory = Math.max(GiB / 2, snapshot.totalMemory * 0.03)
  const ceiling = Math.max(1, Math.min(limit, Math.floor(snapshot.cpuCount / 2)))
  if (snapshot.freeDisk < 2 * GiB) {
    return { fatal: 'Less than 2 GiB free on the work or output disk' }
  }
  if (snapshot.freeMemory < criticalMemory) {
    return { fatal: 'Critically low free memory' }
  }
  const pressured = snapshot.cpuUsage >= 0.9 || snapshot.freeMemory < reserve
  const nextTarget = Math.min(ceiling, pressured ? Math.max(1, Math.floor(target / 2)) : target)
  const canStart = snapshot.cpuUsage < 0.75 &&
    snapshot.freeMemory >= reserve + memoryPerJob && snapshot.freeDisk >= 4 * GiB
  return {
    target: nextTarget,
    ceiling,
    canStart,
    pressured,
    reason: `CPU ${Math.round(snapshot.cpuUsage * 100)}%, available RAM ${(snapshot.freeMemory / GiB).toFixed(1)} GiB, free disk ${(snapshot.freeDisk / GiB).toFixed(1)} GiB`,
  }
}

// Rendering quality never changes. Reduce admission under pressure; active jobs
// finish at their original settings. Critical pressure aborts owned processes.
export async function runResourceAware(items, {
  limit,
  memoryPerJob,
  sample,
  worker,
  onResult,
  onFatal,
  log,
  onState = () => {},
  tickMs = 5000,
  rampMs = 15000,
  idleTimeoutMs = 120000,
  now = Date.now,
}) {
  const active = new Map()
  const results = []
  let nextIndex = 0
  let target = 1
  let healthySince = null
  let idleSince = now()
  let failure = null
  let peakConcurrency = 0
  let lastNotice = ''
  let ceiling = Math.min(limit, items.length)
  const publishState = () => {
    const queued = items.length - nextIndex
    target = Math.min(target, active.size + queued)
    ceiling = Math.min(ceiling, active.size + queued)
    onState({ active: active.size, queued, target, ceiling })
  }
  const checkpoint = () => {
    if (failure) throw failure
  }
  const notice = (message) => {
    if (message !== lastNotice) log(message)
    lastNotice = message
  }
  const stop = async (error) => {
    if (failure) return
    failure = error instanceof Error ? error : new Error(String(error))
    log(failure.message)
    try {
      await onFatal()
    } catch (stopError) {
      failure = new Error(`${failure.message}; could not stop owned processes: ${stopError}`)
      log(failure.message)
    }
  }

  while (nextIndex < items.length || active.size) {
    if (!failure) {
      try {
        const snapshot = await sample()
        const remaining = active.size + items.length - nextIndex
        target = Math.min(target, remaining)
        const decision = resourceDecision(snapshot, { target, limit: Math.min(limit, remaining), memoryPerJob })
        if (decision.fatal) throw new Error(`Resource safety stop: ${decision.fatal}`)
        ceiling = decision.ceiling
        if (decision.target < target) {
          log(`Reducing concurrency ${target} -> ${decision.target}; active jobs will finish. ${decision.reason}`)
        }
        target = decision.target
        if (!decision.canStart || decision.pressured) healthySince = null
        else healthySince ??= now()
        if (nextIndex < items.length && active.size >= target &&
            healthySince !== null && now() - healthySince >= rampMs && target < decision.ceiling) {
          target += 1
          healthySince = now()
          log(`Increasing concurrency to ${target}. ${decision.reason}`)
        }
        if (nextIndex < items.length && active.size < target && decision.canStart) {
          const index = nextIndex++
          log(`Starting ${items[index].id} (${active.size + 1}/${target} active; ceiling ${decision.ceiling}). ${decision.reason}`)
          // Wrap errors so every active job drains before the caller cleans up.
          active.set(index, Promise.resolve().then(() => worker(items[index], checkpoint)).then(
            (result) => ({ index, result }),
            (error) => ({ index, error }),
          ))
          peakConcurrency = Math.max(peakConcurrency, active.size)
          idleSince = now()
        } else if (!active.size && nextIndex < items.length) {
          notice('Waiting for resource headroom; no recordings started.')
          if (now() - idleSince >= idleTimeoutMs) {
            throw new Error(`Resource headroom unavailable for ${idleTimeoutMs / 1000}s. ${decision.reason}`)
          }
        }
      } catch (error) {
        await stop(error)
      }
    }
    publishState()
    if (!active.size && failure) break
    if (!active.size && nextIndex >= items.length) break
    let timer
    const completed = await Promise.race([
      ...active.values(),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), tickMs) }),
    ])
    clearTimeout(timer)
    if (!completed) continue
    active.delete(completed.index)
    publishState()
    idleSince = now()
    const result = completed.error
      ? { ok: false, metadata: null, report: { audioId: items[completed.index].id, ok: false, error: String(completed.error) } }
      : completed.result
    results.push(result)
    try {
      await onResult(result)
    } catch (error) {
      await stop(new Error(`Could not save recording result: ${error}`))
    }
    if (!result.ok && !failure) {
      await stop(new Error(`Recording failed: ${items[completed.index].id}; no further recordings will start`))
    }
  }
  return { results, peakConcurrency, failure, unstarted: items.slice(nextIndex).map((item) => item.id) }
}
