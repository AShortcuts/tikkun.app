import process from 'node:process'
import { stripVTControlCharacters } from 'node:util'

function text(value) {
  return stripVTControlCharacters(String(value)).replace(/[\r\n\t]/g, ' ')
}

function time(seconds) {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const finishedStages = new Set(['validated', 'failed', 'stopped', 'not started'])

export function createVideoProgress(recordings, {
  stream = process.stderr,
  now = Date.now,
  refreshMs = 1000,
  logIntervalMs = 1000,
  limit = 5,
} = {}) {
  const startedAt = now()
  const jobs = new Map(recordings.map(recording => [recording.id, {
    id: recording.id, stage: 'queued', framesCompleted: 0, frameCount: 0,
    fps: 60, startedAt: null, captureStartedAt: null,
  }]))
  const interactive = Boolean(stream.isTTY && process.env.TERM !== 'dumb')
  let scheduler = { active: 0, queued: jobs.size, target: Math.min(1, jobs.size), ceiling: Math.min(limit, jobs.size) }
  let drawnLines = 0
  let lastRender = -Infinity
  let closed = false

  const clear = () => {
    if (drawnLines) stream.write(`\x1b[${drawnLines}A\r\x1b[J`)
    drawnLines = 0
  }

  const jobLines = (job) => {
    const elapsed = (now() - job.startedAt) / 1000
    const lines = [`${job.id} | ${job.stage} | elapsed ${time(elapsed)}`]
    if (job.frameCount) {
      const ratio = Math.min(1, job.framesCompleted / job.frameCount)
      const filled = Math.floor(ratio * 16)
      const bar = `[${'='.repeat(filled)}${'-'.repeat(16 - filled)}]`
      let detail = `${bar} ${(Math.floor(ratio * 1000) / 10).toFixed(1)}% frames | ${time(job.framesCompleted / job.fps)}/${time(job.frameCount / job.fps)} video`
      const captureElapsed = (now() - job.captureStartedAt) / 1000
      if (job.stage === 'capturing' && ratio > 0 && ratio < 1 && captureElapsed >= 2) {
        detail += ` | render ETA ~${time(captureElapsed * (1 - ratio) / ratio)}`
      }
      lines.push(detail)
    } else {
      lines.push('Preparing audio, pages and fonts...')
    }
    return lines
  }

  const lines = () => {
    const all = [...jobs.values()]
    const active = all.filter(job => job.stage !== 'queued' && !finishedStages.has(job.stage))
    const validated = all.filter(job => job.stage === 'validated').length
    const failed = all.filter(job => job.stage === 'failed').length
    const waiting = all.filter(job => job.stage === 'queued' || job.stage === 'not started').length
    const summary = `Videos: ${validated}/${jobs.size} validated | ${failed} failed | ${waiting} queued | elapsed ${time((now() - startedAt) / 1000)}`
    const header = `${scheduler.active} active | target ${scheduler.target} | ceiling ${scheduler.ceiling}`
    const visibleCount = interactive ? Math.max(1, Math.floor(((stream.rows || 24) - 4) / 2)) : active.length
    const result = [summary, header, ...active.slice(0, visibleCount).flatMap(jobLines)]
    if (active.length > visibleCount) result.push(`... ${active.length - visibleCount} more active (enlarge terminal to see all)`)
    return result
  }

  const render = (force = false) => {
    if (closed || (!force && now() - lastRender < (interactive ? refreshMs : logIntervalMs))) return
    lastRender = now()
    const width = Math.max(1, (stream.columns || 120) - 1)
    const output = lines().map(line => interactive ? text(line).slice(0, width) : text(line))
    clear()
    stream.write(output.join('\n') + '\n')
    if (interactive) drawnLines = output.length
  }

  const log = (message) => {
    if (closed) return
    clear()
    stream.write(text(message) + '\n')
    render(true)
  }

  const close = () => {
    if (closed) return
    clearInterval(timer)
    process.removeListener('exit', close)
    for (const job of jobs.values()) {
      if (job.stage === 'queued') job.stage = 'not started'
      else if (!finishedStages.has(job.stage)) {
        job.stage = 'stopped'
        log(`[video] ${job.id}: stopped before validation`)
      }
    }
    scheduler = { ...scheduler, active: 0, target: 0 }
    render(true)
    closed = true
  }

  // A fixed heartbeat keeps slow captures and off-cycle stage changes from
  // postponing the next display update.
  const timer = setInterval(() => render(true), interactive ? refreshMs : logIntervalMs)
  timer.unref?.()
  process.once('exit', close)
  render(true)

  return {
    update(id, patch) {
      if (closed) return
      const job = jobs.get(id)
      if (!job) throw new Error(`Unknown recording progress ID: ${id}`)
      const stageChanged = patch.stage && patch.stage !== job.stage
      if (patch.stage && patch.stage !== 'queued') job.startedAt ??= now()
      if (patch.stage === 'capturing') job.captureStartedAt ??= now()
      Object.assign(job, patch)
      render(Boolean(stageChanged))
    },
    scheduler(state) {
      scheduler = state
      render()
    },
    complete(result) {
      const job = jobs.get(result.report.audioId)
      if (!job) throw new Error(`Unknown recording result ID: ${result.report.audioId}`)
      job.stage = result.ok ? 'validated' : 'failed'
      log(result.ok
        ? `[video] Validated ${job.id}: ${result.report.outputPath}`
        : `[video] FAILED ${job.id}: ${result.report.error}`)
    },
    log,
    close,
  }
}
