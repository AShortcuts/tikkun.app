import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { inspectProcess } from './video-process-ownership.mjs'

const exec = promisify(execFile)

export async function canReuseVideoServer({ port, repoRoot, run = exec, inspect = inspectProcess }) {
  let stdout
  try {
    ({ stdout } = await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']))
  } catch (error) {
    // lsof uses status 1, without diagnostics, when nothing is listening.
    if (error.code === 1 && !error.stdout?.trim() && !error.stderr?.trim()) return false
    throw error
  }
  const pids = [...new Set(stdout.trim().split(/\s+/).filter(Boolean).map(Number))]
  if (!pids.length) return false
  const processes = await Promise.all(pids.map(pid => inspect(pid)))
  if (processes.some(identity => !identity || path.resolve(identity.cwd) !== path.resolve(repoRoot) ||
      !/\bvite(?:\.js)?(?:\s|$)/.test(identity.command))) {
    throw new Error(`Port ${port} belongs to another or unverified process. Use --base-url with this project's app server.`)
  }
  return true
}
