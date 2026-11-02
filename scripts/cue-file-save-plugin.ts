import { spawn } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import process from 'node:process'
import type { Plugin } from 'vite'
import { cueFileSaveEndpoint, cueFileSaveHeader } from '../app/admin/cue-file-save.ts'

const maxBodyBytes = 5 * 1024 * 1024
const loopbackAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

export type SaveCueFile = (body: string) => Promise<Record<string, unknown>>

function hostname(value: string | undefined) {
  if (!value) return null
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).hostname
  } catch {
    return null
  }
}

// Only a browser on this Mac may write into the checkout. The dev server also
// listens on the network, so phones and other computers get downloads instead.
export function isLocalCueSaveRequest(request: IncomingMessage) {
  const origin = request.headers.origin
  return loopbackAddresses.has(request.socket.remoteAddress ?? '') &&
    loopbackHosts.has(hostname(request.headers.host) ?? '') &&
    (origin === undefined || loopbackHosts.has(hostname(origin) ?? ''))
}

function send(response: ServerResponse, status: number, body: Record<string, unknown>) {
  response.statusCode = status
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify(body))
}

function readBody(request: IncomingMessage) {
  return new Promise<string | null>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size <= maxBodyBytes) chunks.push(chunk)
    })
    request.on('end', () => resolve(size > maxBodyBytes ? null : Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

export function createCueFileSaveHandler(save: SaveCueFile) {
  let queue: Promise<unknown> = Promise.resolve()
  return async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader(cueFileSaveHeader, '1')
    response.setHeader('cache-control', 'no-store')
    if (!isLocalCueSaveRequest(request)) {
      return send(response, 403, { ok: false, error: 'Cue files can be saved only from a browser on the computer running npm run dev.' })
    }
    if (request.method !== 'POST') return send(response, 405, { ok: false, error: 'Use POST to save a cue file.' })
    if (request.headers[cueFileSaveHeader] !== '1') {
      return send(response, 400, { ok: false, error: 'Missing cue save header.' })
    }
    const body = await readBody(request)
    if (body === null) return send(response, 413, { ok: false, error: 'This cue file is larger than 5 MB.' })
    // Saves run one at a time so two quick exports cannot interleave writes.
    const result = queue.then(() => save(body))
    queue = result.catch(() => undefined)
    try {
      send(response, 200, { ...(await result), ok: true })
    } catch (error) {
      send(response, 422, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

/** Runs scripts/save-cue-file.mjs so each save sees the current recording catalog. */
export function saveCueFileWithScript(root: string): SaveCueFile {
  return (body) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/save-cue-file.mjs', '--stdin'], {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', reject)
    child.on('close', () => {
      const line = stdout.trim().split('\n').pop() ?? ''
      let result: unknown
      try {
        result = JSON.parse(line)
      } catch {
        reject(new Error(`Cue save failed: ${stderr.trim() || stdout.trim() || 'no output'}`))
        return
      }
      const record = result && typeof result === 'object' ? result as Record<string, unknown> : {}
      if (record.ok === true) resolve(record)
      else reject(new Error(typeof record.error === 'string' ? record.error : 'Cue save failed.'))
    })
    child.stdin.end(body)
  })
}

export function cueFileSavePlugin(): Plugin {
  return {
    name: 'cue-file-save',
    apply: 'serve',
    configureServer(server) {
      // Browser tests must never write into the developer's cue files.
      if (server.config.mode === 'test') return
      const handle = createCueFileSaveHandler(saveCueFileWithScript(server.config.root))
      server.middlewares.use(cueFileSaveEndpoint, (request, response) => {
        void handle(request, response).catch((error: unknown) => {
          server.config.logger.error(`Cue save failed: ${error instanceof Error ? error.message : String(error)}`)
          if (!response.headersSent) send(response, 500, { ok: false, error: 'Cue save failed unexpectedly.' })
        })
      })
    },
  }
}
