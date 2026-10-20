import { execFile } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { inspectProcess, processMatchesRecord } from './video-process-ownership.mjs'

const exec = promisify(execFile)

function devArgumentsMatchRoot(args, root) {
  const required = new Set(['-c', '--config', '--base', '-l', '--logLevel', '--configLoader', '-f', '--filter', '-m', '--mode', '--port'])
  const optional = new Set(['--host', '--open', '-d', '--debug', '--profile'])
  const boolean = new Set(['--clearScreen', '--cors', '--strictPort', '--force', '--experimentalBundle'])
  const tokens = args.trim().split(/\s+/).filter(Boolean)
  const positionals = []
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (!token.startsWith('-')) {
      positionals.push(token)
      continue
    }
    const equals = token.indexOf('=')
    const option = equals < 0 ? token : token.slice(0, equals)
    let value = equals < 0 ? undefined : token.slice(equals + 1)
    if (required.has(option)) {
      value ??= tokens[++index]
      if (!value || value.startsWith('-')) return false
      // A separate config may point at an unrelated project despite the cwd.
      if (['-c', '--config'].includes(option) && path.resolve(root, value) !== path.join(root, 'vite.config.ts')) return false
    } else if (optional.has(option)) {
      if (value === undefined && tokens[index + 1] && !tokens[index + 1].startsWith('-')) index++
    } else if (boolean.has(option) || (option.startsWith('--no-') && (boolean.has(option.replace('--no-', '--')) || optional.has(option.replace('--no-', '--'))))) {
      if (value === undefined && ['true', 'false'].includes(tokens[index + 1])) index++
    } else {
      return false
    }
  }
  if (['dev', 'serve'].includes(positionals[0])) positionals.shift()
  return positionals.length === 0 || (positionals.length === 1 && path.resolve(root, positionals[0]) === root)
}

function isProjectDevServer(identity, root) {
  if (!identity || path.resolve(identity.cwd) !== path.resolve(root)) return false
  const binaries = ['node_modules/.bin/vite', 'node_modules/vite/bin/vite.js']
  return binaries.some(binary => {
    const executable = path.join(root, binary)
    const index = identity.command.indexOf(executable)
    if (index < 0 || !/(?:^|\/)node\s+$/.test(identity.command.slice(0, index))) return false
    const args = identity.command.slice(index + executable.length)
    return (args === '' || /^\s/.test(args)) && devArgumentsMatchRoot(args, root)
  })
}

export async function replacePreviousDevServer({
  port, root, run = exec, inspect = inspectProcess,
  signal = process.kill.bind(process), wait = delay,
  currentPid = process.pid, log = console.info,
}) {
  let stdout
  try {
    ({ stdout } = await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']))
  } catch (error) {
    // lsof returns 1 without diagnostics when the port has no listeners.
    if (error.code === 1 && !error.stdout?.trim() && !error.stderr?.trim()) return
    throw error
  }
  const pids = [...new Set(stdout.trim().split(/\s+/).filter(Boolean).map(Number))]
    .filter(pid => pid !== currentPid)
  if (pids.some(pid => !Number.isSafeInteger(pid) || pid <= 0)) {
    throw new Error(`Could not identify the listener on port ${port}; no processes were stopped.`)
  }
  const identities = await Promise.all(pids.map(pid => inspect(pid)))
  if (identities.some(identity => !isProjectDevServer(identity, root))) {
    throw new Error(`Port ${port} belongs to another or unverified process. Only this checkout's Vite dev server can be replaced; no processes were stopped.`)
  }

  for (const identity of identities) {
    for (const [terminationSignal, attempts] of [['SIGTERM', 50], ['SIGKILL', 10]]) {
      // Recheck the process birth time as well as its command before each signal.
      const current = await inspect(identity.pid)
      if (!processMatchesRecord(identity, current)) break
      log(`Replacing previous Vite dev server on port ${port} (PID ${identity.pid}, ${terminationSignal}).`)
      try {
        signal(identity.pid, terminationSignal)
      } catch (error) {
        if (error.code === 'ESRCH') break
        throw error
      }
      for (let attempt = 0; attempt < attempts; attempt++) {
        await wait(100)
        if (!processMatchesRecord(identity, await inspect(identity.pid))) break
      }
    }
    if (processMatchesRecord(identity, await inspect(identity.pid))) {
      throw new Error(`Previous Vite dev server (PID ${identity.pid}) did not stop; port ${port} was not reassigned.`)
    }
  }
}

/** @returns {import('vite').Plugin} */
export function devServerRestartPlugin(replace = replacePreviousDevServer) {
  return {
    name: 'replace-previous-dev-server',
    apply: 'serve',
    async configureServer(server) {
      if (server.config.mode === 'test' || server.config.server.middlewareMode) return
      const port = server.config.server.port
      if (!port) return
      await replace({ port, root: server.config.root, log: message => server.config.logger.info(message) })
    },
  }
}
