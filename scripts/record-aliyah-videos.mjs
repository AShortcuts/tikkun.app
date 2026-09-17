import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { audioRecordings } from '../generated/audio-manifest.ts'
import {
  nextCaptureFrame,
  createCueConcatEntries,
  renderCueConcatFile,
} from '../app/video/cue-frame-plan.ts'
import { currentAppBuildHash } from './video-provenance.mjs'
import { createResourceSampler, runResourceAware } from './video-resource-scheduler.mjs'
import { outputValidationErrors } from './video-output-validation.mjs'
import { frameEncoderArgs, startFrameEncoder } from './video-frame-stream.mjs'
import { canReuseVideoServer } from './video-server.mjs'
import { createVideoProgress } from './video-progress.mjs'
import { completedVideoMatches, recordingSettings, videoFileHash } from './video-resume.mjs'
import {
  inspectOwnedRun,
  openOwnedProcessRegistry,
  shutdownOwnedRun,
} from './video-process-ownership.mjs'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const defaultOutputRoot = '/Users/adambh/Koofr/Tikkun Videos'
const defaultWorkRoot = '/private/tmp/tikkun-video-render'
const metadataPath = path.join(repoRoot, 'video-render-metadata.local.json')
const reportPath = path.join(repoRoot, 'video-render-reports.local.json')
const siteRoot = path.join(repoRoot, 'site')
const cueRoot = path.join(repoRoot, 'audio-cues')
let cuePayloadsByAudioId = null
let appBuildHashPromise = null
let processRegistry = null
let shuttingDown = false
const ownedProcesses = new Map()

const defaults = {
  width: 1300,
  height: 600,
  deviceScaleFactor: 3,
  fps: 60,
  crf: 18,
  preset: 'veryfast',
  outputRoot: process.env.TIKKUN_VIDEO_OUTPUT_ROOT || defaultOutputRoot,
  workRoot: process.env.TIKKUN_VIDEO_WORK_ROOT || defaultWorkRoot,
  baseUrl: 'http://127.0.0.1:5176',
  concurrency: 'auto',
  maxConcurrency: 5,
  renderMode: 'cue-keyframes',
  frameTransport: 'stream',
  cueBurstPreEndMs: 120,
  cueBurstMaxMs: 500,
  crop: false,
  cropMargin: 96,
}

function parseArgs(argv) {
  const options = {
    ...defaults,
    ids: [],
    command: 'record',
    keepFrames: false,
    includeOutput: false,
    externalServer: false,
    dryRun: false,
    force: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === 'calibrate') {
      options.command = 'calibrate'
    } else if (arg === 'cleanup') {
      options.command = 'cleanup'
    } else if (arg === 'shutdown') {
      options.command = 'shutdown'
    } else if (arg === 'status') {
      options.command = 'status'
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--force') {
      options.force = true
    } else if (arg === '--keep-frames') {
      options.keepFrames = true
    } else if (arg === '--include-output') {
      options.includeOutput = true
    } else if (arg === '--external-server') {
      options.externalServer = true
    } else if (arg === '--no-crop') {
      options.crop = false
    } else if (arg === '--crop') {
      options.crop = true
    } else if (arg.startsWith('--ids=')) {
      options.ids = arg.slice('--ids='.length).split(',').filter(Boolean)
    } else if (arg.startsWith('--render-mode=')) {
      options.renderMode = arg.slice('--render-mode='.length)
    } else if (arg.startsWith('--frame-transport=')) {
      options.frameTransport = arg.slice('--frame-transport='.length)
    } else if (arg.startsWith('--concurrency=')) {
      const value = arg.slice('--concurrency='.length)
      options.concurrency = value === 'auto' ? 'auto' : Number(value)
    } else if (arg.startsWith('--max-concurrency=')) {
      options.maxConcurrency = Number(arg.slice('--max-concurrency='.length))
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length).replace(/\/$/, '')
      options.externalServer = true
    } else if (arg.startsWith('--output-root=')) {
      options.outputRoot = arg.slice('--output-root='.length)
    } else if (arg.startsWith('--work-root=')) {
      options.workRoot = arg.slice('--work-root='.length)
    } else if (arg.startsWith('--width=')) {
      options.width = Number(arg.slice('--width='.length))
    } else if (arg.startsWith('--height=')) {
      options.height = Number(arg.slice('--height='.length))
    } else if (arg.startsWith('--scale=')) {
      options.deviceScaleFactor = Number(arg.slice('--scale='.length))
    } else if (arg.startsWith('--fps=')) {
      options.fps = Number(arg.slice('--fps='.length))
    } else if (arg.startsWith('--crf=')) {
      options.crf = Number(arg.slice('--crf='.length))
    } else if (arg.startsWith('--preset=')) {
      options.preset = arg.slice('--preset='.length)
    } else if (arg.startsWith('--cue-burst-pre-end-ms=')) {
      options.cueBurstPreEndMs = Number(arg.slice('--cue-burst-pre-end-ms='.length))
    } else if (arg.startsWith('--cue-burst-max-ms=')) {
      options.cueBurstMaxMs = Number(arg.slice('--cue-burst-max-ms='.length))
    } else if (arg.startsWith('--crop-margin=')) {
      options.cropMargin = Number(arg.slice('--crop-margin='.length))
    }
  }

  if (options.concurrency !== 'auto' && (!Number.isInteger(options.concurrency) || options.concurrency < 1)) {
    throw new Error('--concurrency must be auto or a positive integer')
  }
  if (!Number.isSafeInteger(options.maxConcurrency) || options.maxConcurrency < 1) {
    throw new Error('--max-concurrency must be a positive integer')
  }
  for (const dimension of ['width', 'height']) {
    if (!Number.isSafeInteger(options[dimension]) || options[dimension] <= 0) {
      throw new Error(`--${dimension} must be a positive integer`)
    }
  }
  if (!Number.isInteger(options.fps) || options.fps < 24) {
    throw new Error('--fps must be an integer of at least 24')
  }
  if (!Number.isFinite(options.deviceScaleFactor) || options.deviceScaleFactor <= 0) {
    throw new Error('--scale must be a positive number')
  }
  if (!['cue-keyframes', 'deterministic-frames'].includes(options.renderMode)) {
    throw new Error('--render-mode must be cue-keyframes or deterministic-frames')
  }
  if (!['stream', 'files'].includes(options.frameTransport)) {
    throw new Error('--frame-transport must be stream or files')
  }
  if (!Number.isFinite(options.cueBurstPreEndMs) || options.cueBurstPreEndMs < 0) {
    throw new Error('--cue-burst-pre-end-ms must be a non-negative number')
  }
  if (!Number.isFinite(options.cueBurstMaxMs) || options.cueBurstMaxMs < 0) {
    throw new Error('--cue-burst-max-ms must be a non-negative number')
  }
  if (options.dryRun && options.command !== 'shutdown') {
    throw new Error('--dry-run requires the shutdown command')
  }
  if (argv.some(arg => arg.startsWith('--cue-burst-'))) {
    console.warn('Cue burst options are deprecated and ignored: captures now follow the complete animation timeline.')
  }
  return options
}

function narratorInitials(narratorId) {
  return narratorId
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toLowerCase()
}

function siteAudioUrlToLocalPath(playSrc) {
  const pathname = new URL(playSrc, 'https://tikkun.local').pathname
  return path.join(siteRoot, decodeURIComponent(pathname.replace(/^\//, '')))
}

async function sha256File(filePath) {
  const hash = createHash('sha256')
  hash.update(await readFile(filePath))
  return hash.digest('hex')
}

function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function appBuildHash() {
  appBuildHashPromise ??= currentAppBuildHash(repoRoot)
  return appBuildHashPromise
}

async function execFileText(command, args, options = {}, kind = command, returnStderr = false) {
  let completion
  await spawnOwnedProcess(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
  }, kind, (child) => {
    completion = new Promise((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      child.on('close', (code) => {
        if (code === 0) resolve(returnStderr ? stderr : stdout)
        else reject(new Error(`${command} ${args.join(' ')} failed: ${stderr || `exit ${code}`}`))
      })
      child.on('error', reject)
    })
    // Registration can still be in flight when a short command exits.
    completion.catch(() => {})
  })
  return completion
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return fallback
    }
    throw error
  }
}

async function listFilesWithExtension(root, extension) {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name)
      if (entry.isDirectory()) return listFilesWithExtension(entryPath, extension)
      return entry.isFile() && entry.name.endsWith(extension) ? [entryPath] : []
    })
  )
  return nested.flat()
}

async function getCuesForRecording(recording) {
  if (!cuePayloadsByAudioId) {
    const files = await listFilesWithExtension(cueRoot, '.json')
    const payloads = await Promise.all(
      files.map(async (filePath) => JSON.parse(await readFile(filePath, 'utf8')))
    )
    cuePayloadsByAudioId = new Map(
      payloads
        .filter((payload) => typeof payload.audioId === 'string')
        .map((payload) => [payload.audioId, payload])
    )
  }

  return cuePayloadsByAudioId.get(recording.id)?.cues ?? []
}

async function writeJsonFile(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

async function pathExists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function spawnOwnedProcess(command, args, options, kind, observe = undefined) {
  if (shuttingDown) throw new Error(`Cannot start owned ${kind} process during shutdown`)
  if (!processRegistry) throw new Error('Video process registry is not initialized')
  const registry = processRegistry
  const child = spawn(command, args, {
    ...options,
    detached: process.platform !== 'win32',
  })
  const entry = {
    child,
    record: null,
    spawnError: null,
    stopPromise: null,
    exited: false,
  }
  ownedProcesses.set(child, entry)
  observe?.(child)
  child.on('error', (error) => {
    entry.spawnError = error
  })
  child.once('exit', () => {
    entry.exited = true
    ownedProcesses.delete(child)
    if (entry.record) {
      const record = entry.record
      entry.record = null
      registry.remove(record).catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`Could not update video process registry: ${message}`)
      })
    }
  })

  try {
    const record = await registry.add(child, {
      kind,
      cwd: options.cwd ?? repoRoot,
    })
    entry.record = record
    if (entry.exited && record) {
      entry.record = null
      await registry.remove(record)
    }
    if (entry.spawnError) throw entry.spawnError
    if (!record && !entry.exited) throw new Error(`Could not verify owned ${kind} process`)
    return child
  } catch (error) {
    await stopOwnedProcess(child)
    throw error
  }
}

function chromeExecutable() {
  const candidates = [
    process.env.TIKKUN_CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean)

  return candidates.find((candidate) => existsSync(candidate))
}

async function startVite(options) {
  if (options.externalServer) return null
  const port = Number(new URL(options.baseUrl).port)
  if (await canReuseVideoServer({ port, repoRoot })) {
    await waitForHttp(`${options.baseUrl}/reader`, 30000)
    console.log(`[video] Reusing this project's Vite server at ${options.baseUrl}`)
    return null
  }

  const vite = await spawnOwnedProcess(
    'npm',
    ['run', 'dev', '--', '--host', '0.0.0.0', '--port', String(port), '--strictPort'],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
    'vite'
  )

  try {
    await waitForHttp(`${options.baseUrl}/reader`, 30000, () => {
      if (vite.exitCode !== null || vite.signalCode !== null) throw new Error('The recording app server exited before it was ready')
    })
    return vite
  } catch (error) {
    await stopOwnedProcess(vite)
    throw error
  }
}

async function waitForHttp(url, timeoutMs, check = () => {}) {
  const started = Date.now()
  let lastError = null
  while (Date.now() - started < timeoutMs) {
    check()
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? 'no response'}`)
}

async function startChrome(options, userDataDir) {
  const executable = chromeExecutable()
  if (!executable) throw new Error('Set TIKKUN_CHROME to a Chromium executable')

  const chrome = await spawnOwnedProcess(
    executable,
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      '--autoplay-policy=no-user-gesture-required',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
    'chrome'
  )

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      stopOwnedProcess(chrome).catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`Could not stop timed-out Chrome process: ${message}`)
      })
      reject(new Error('Timed out waiting for Chrome DevTools endpoint'))
    }, 15000)

    chrome.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      const match = text.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (!match) return
      clearTimeout(timeout)
      resolve({ chrome, browserWsUrl: match[1] })
    })

    chrome.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    chrome.once('exit', (code, signal) => {
      clearTimeout(timeout)
      reject(new Error(`Chrome exited before startup completed (${signal ?? code})`))
    })
  })
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.nextId = 1
    this.pending = new Map()
  }

  connect() {
    this.socket = new WebSocket(this.wsUrl)
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      clearTimeout(pending.timer)
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
    })
    this.socket.addEventListener('close', () => this.rejectPending('CDP connection closed'))
    this.socket.addEventListener('error', () => this.rejectPending('CDP websocket failed'))

    return new Promise((resolve, reject) => {
      this.socket.addEventListener('open', () => resolve(), { once: true })
      this.socket.addEventListener('close', () => reject(new Error('CDP connection closed')), { once: true })
      this.socket.addEventListener('error', () => reject(new Error('CDP websocket failed')), {
        once: true,
      })
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Timed out after 120s: ${method}`))
      }, 120000)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.socket.send(JSON.stringify({ id, method, params }))
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  rejectPending(message) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error(message))
    }
    this.pending.clear()
  }

  close() {
    this.rejectPending('CDP client closed')
    this.socket?.close()
  }
}

async function createPage(browserWsUrl) {
  const browserUrl = new URL(browserWsUrl)
  const origin = `http://${browserUrl.host}`
  const createTarget = async (method) => {
    const response = await fetch(`${origin}/json/new?about:blank`, { method })
    if (!response.ok) throw new Error(`${method} /json/new failed`)
    return response.json()
  }

  let target
  try {
    target = await createTarget('PUT')
  } catch {
    target = await createTarget('POST')
  }

  const client = new CdpClient(target.webSocketDebuggerUrl)
  await client.connect()
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  return client
}

async function evaluate(client, expression, awaitPromise = true) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime.evaluate failed')
  }
  return result.result.value
}

async function navigate(client, url, options) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: options.width,
    height: options.height,
    deviceScaleFactor: options.deviceScaleFactor,
    mobile: false,
  })
  await client.send('Page.navigate', { url })
  await waitUntil(
    () => evaluate(client, 'document.readyState === "complete"'),
    'page load',
    30000
  )
  await waitUntil(
    () => evaluate(client, 'Boolean(window.tikkunRecorder)'),
    'recording mode API',
    30000
  )
  await evaluate(client, 'window.tikkunRecorder.ready()')
}

async function waitUntil(check, label, timeoutMs) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function captureFrame(client, filePath, clip = null) {
  const params = {
    format: 'png',
    captureBeyondViewport: false,
  }
  if (clip) {
    params.clip = {
      x: clip.x,
      y: clip.y,
      width: clip.width,
      height: clip.height,
      scale: 1,
    }
  }

  const result = await client.send('Page.captureScreenshot', params)
  const png = Buffer.from(result.data, 'base64')
  if (filePath) await writeFile(filePath, png)
  return png
}

async function validateFrameSequence(frameDir, frameCount) {
  const errors = []
  for (let index = 0; index < frameCount; index += 1) {
    const filePath = path.join(frameDir, `frame-${String(index).padStart(6, '0')}.png`)
    try {
      const info = await stat(filePath)
      if (info.size === 0) errors.push(`${path.basename(filePath)} is empty`)
    } catch {
      errors.push(`${path.basename(filePath)} is missing`)
    }
  }
  return errors
}

async function encodeVideo({ frameDir, audioPath, outputPath, options }) {
  const args = frameEncoderArgs({ ...options, audioPath, outputPath,
    framePattern: path.join(frameDir, 'frame-%06d.png'),
  })

  return execFileText('ffmpeg', args, {}, 'ffmpeg', true)
}

async function encodeConcatVideo({ concatPath, audioPath, outputPath, frameCount, options }) {
  const args = frameEncoderArgs({ ...options, concatPath, audioPath, outputPath, frameCount })

  return execFileText('ffmpeg', args, {}, 'ffmpeg', true)
}

async function ffprobe(outputPath) {
  const stdout = await execFileText(
    'ffprobe',
    [
      '-v',
      'error',
      '-count_frames',
      '-threads',
      '2',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      outputPath,
    ],
    {},
    'ffprobe'
  )
  return JSON.parse(stdout)
}

function capturedPixelDimensions(crop, options) {
  const logicalWidth = crop?.width ?? options.width
  const logicalHeight = crop?.height ?? options.height
  const scale = options.captureScale ?? options.deviceScaleFactor
  return {
    outputWidth: Math.round(logicalWidth * scale),
    outputHeight: Math.round(logicalHeight * scale),
  }
}

async function validateOutput({
  outputPath,
  expectedDuration,
  expectedFrameCount,
  expectedWidth,
  expectedHeight,
  options,
  ffmpegLog,
}) {
  const warnings = []
  const probe = await ffprobe(outputPath)
  const errors = outputValidationErrors(probe, {
    width: expectedWidth,
    height: expectedHeight,
    fps: options.fps,
    frameCount: expectedFrameCount,
    duration: expectedDuration,
    renderMode: options.renderMode,
  }, ffmpegLog)

  await execFileText(
    'ffmpeg',
    ['-v', 'error', '-xerror', '-threads', '2', '-i', outputPath, '-f', 'null', '-'],
    {},
    'ffmpeg-validation'
  )

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  }
}

async function activeWordSample(client, firstCue) {
  const tokenKey = [firstCue.pageNumber, firstCue.lineIndex, firstCue.fragmentIndex, firstCue.wordIndex].join(':')
  return evaluate(
    client,
    `(() => {
      const active = document.querySelector('.is-active-word') ??
        document.querySelector('[data-token-key="${tokenKey}"]');
      if (!active) return null;
      const rect = active.getBoundingClientRect();
      return {
        text: active.textContent?.trim() ?? '',
        width: rect.width,
        height: rect.height,
      };
    })()`
  )
}

function outputFileName({ recording, quality, generatedFrom }) {
  const contentHash = createHash('sha256')
    .update(generatedFrom.audioHash)
    .update(generatedFrom.cueHash)
    .update(generatedFrom.appBuildHash)
    .digest('hex')
    .slice(0, 8)
  return `${recording.id}_${narratorInitials(recording.narratorId)}_${quality}_${contentHash}.mp4`
}

function outputFolderName(recording) {
  const { parshaNumber, parshaName } = recording
  if (!Number.isSafeInteger(parshaNumber) || parshaNumber < 1 ||
      typeof parshaName !== 'string' || !parshaName.trim() || /[/\\]/.test(parshaName) ||
      [...parshaName].some(character => character.charCodeAt(0) < 32)) {
    throw new Error(`Invalid canonical parsha folder identity for ${recording.id}`)
  }
  return `${String(parshaNumber).padStart(2, '0')} ${parshaName}`
}

async function nextAvailableOutput({ outputRoot, fileName }) {
  const extension = path.extname(fileName)
  const stem = fileName.slice(0, -extension.length)

  for (let index = 1; index < 1000; index += 1) {
    const candidateName = index === 1 ? fileName : `${stem}-${index}${extension}`
    const candidatePath = path.join(outputRoot, candidateName)
    if (!(await pathExists(candidatePath))) {
      return {
        fileName: candidateName,
        outputPath: candidatePath,
      }
    }
  }

  throw new Error(`Could not find an available output filename for ${fileName}`)
}

function processHasExited(child) {
  return !child?.pid || child.exitCode !== null || child.signalCode !== null
}

function waitForProcessExit(child, timeoutMs) {
  if (processHasExited(child)) return Promise.resolve(true)

  return new Promise((resolve) => {
    const finish = (exited) => {
      clearTimeout(timeout)
      child.removeListener('exit', onExit)
      resolve(exited)
    }
    const onExit = () => finish(true)
    const timeout = setTimeout(() => finish(processHasExited(child)), timeoutMs)
    child.once('exit', onExit)
  })
}

async function stopChrome(chrome) {
  await stopOwnedProcess(chrome)
}

function signalOwnedProcess(child, signal) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return
  const target = process.platform === 'win32' ? child.pid : -child.pid
  try {
    process.kill(target, signal)
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'ESRCH') throw error
  }
}

async function stopOwnedProcess(child) {
  if (!child) return
  const entry = ownedProcesses.get(child)
  if (entry?.stopPromise) return entry.stopPromise

  const stopPromise = (async () => {
    signalOwnedProcess(child, 'SIGTERM')
    let exited = await waitForProcessExit(child, 3000)
    if (!exited) {
      signalOwnedProcess(child, 'SIGKILL')
      exited = await waitForProcessExit(child, 1000)
    }
    if (!exited) {
      throw new Error(`Owned process ${child.pid} did not stop after SIGKILL`)
    }
    ownedProcesses.delete(child)
    if (entry?.record) {
      const record = entry.record
      entry.record = null
      await processRegistry?.remove(record)
    }
  })()
  if (entry) entry.stopPromise = stopPromise
  return stopPromise
}

async function stopAllOwnedProcesses() {
  await Promise.all([...ownedProcesses.keys()].map((child) => stopOwnedProcess(child)))
}

function installShutdownHandlers() {
  const exitCodes = { SIGINT: 130, SIGTERM: 143 }
  for (const signal of Object.keys(exitCodes)) {
    process.on(signal, () => {
      if (shuttingDown) process.exit(exitCodes[signal])
      shuttingDown = true
      void (async () => {
        await stopAllOwnedProcesses()
        await processRegistry?.close()
        process.exit(exitCodes[signal])
      })().catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`Could not stop owned video processes: ${message}`)
        process.exit(1)
      })
    })
  }
}

async function removeWorkDir(dirPath) {
  await rm(dirPath, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 250,
  })
}

async function renderFrameAt({ client, seconds, filePath, options }) {
  options.checkpoint()
  const state = await evaluate(client, `window.tikkunRecorder.renderAt(${seconds})`)
  if (!state || !Number.isFinite(state.currentTime) || Math.abs(state.currentTime - seconds) > 0.001) {
    throw new Error(`Reader time mismatch at ${seconds}s`)
  }
  const crop = options.captureCrop
  const png = await captureFrame(client, filePath, crop)
  options.checkpoint()
  return { state, crop, png }
}

async function captureFrameSequence({ client, frameDir, duration, options, writer }) {
  const frameCount = Math.ceil(duration * options.fps)
  options.onProgress?.({ stage: 'capturing', frameCount, fps: options.fps })
  const entries = []
  const frameLatencies = []
  const captureCrop = options.crop
    ? await evaluate(client, `window.tikkunRecorder.captureRect(${options.cropMargin})`)
    : null
  const captureOptions = { ...options, captureCrop }
  for (let frameIndex = 0; frameIndex < frameCount;) {
    const frameStartedAt = performance.now()
    const seconds = frameIndex / options.fps
    const result = await renderFrameAt({
      client, seconds, options: captureOptions,
      filePath: !writer || options.keepFrames
        ? path.join(frameDir, `frame-${String(entries.length).padStart(6, '0')}.png`) : undefined,
    })
    const reusableUntil = nextCaptureFrame({ frameIndex, frameCount, fps: options.fps, stableUntil: result.state.stableUntil })
    const nextFrameIndex = options.renderMode === 'cue-keyframes' ? reusableUntil : frameIndex + 1
    if (writer) await writer.writeFrame(result.png, nextFrameIndex - frameIndex)
    else options.onProgress?.({ framesCompleted: nextFrameIndex })
    entries.push({ frameIndex, seconds })
    frameLatencies.push(Number((performance.now() - frameStartedAt).toFixed(2)))
    frameIndex = nextFrameIndex
  }
  if (!writer || options.keepFrames) {
    const errors = await validateFrameSequence(frameDir, entries.length)
    if (errors.length) throw new Error(errors.join('; '))
  }
  let ffmpegInput = writer ? { kind: 'stream' } : { kind: 'frames', frameDir }
  if (!writer && options.renderMode === 'cue-keyframes') {
    const concatEntries = createCueConcatEntries({
      plan: { frameCount, entries }, fps: options.fps,
      frameName: index => path.join(frameDir, `frame-${String(index).padStart(6, '0')}.png`),
    })
    const concatPath = path.join(frameDir, 'frames.concat.txt')
    await writeFile(concatPath, renderCueConcatFile(concatEntries, options.fps))
    ffmpegInput = { kind: 'concat', concatPath }
  }
  return {
    ffmpegInput, frameCount, capturedFrameCount: entries.length, frameLatencies,
    crop: captureCrop, ...capturedPixelDimensions(captureCrop, options),
  }
}

async function recordOne(recording, options) {
  const startedAt = Date.now()
  const userDataDir = path.join(options.workRoot, `chrome-${recording.id}-${Date.now()}`)
  const frameDir = path.join(options.workRoot, `frames-${recording.id}-${Date.now()}`)
  const quality = `${Math.round(options.height)}p${options.fps}`
  if (options.frameTransport === 'files' || options.keepFrames) {
    await mkdir(frameDir, { recursive: true })
  }
  await mkdir(options.outputRoot, { recursive: true })

  let chrome
  let client
  let stagedOutputPath
  let encoder
  try {
    options.checkpoint()
    const audioPath = siteAudioUrlToLocalPath(recording.playSrc)
    const cues = await getCuesForRecording(recording)
    if (!cues.length) throw new Error('missing cue data')

    const generatedFrom = {
      audioHash: await sha256File(audioPath),
      cueHash: sha256Json(cues),
      appBuildHash: await appBuildHash(),
    }
    const outputDirectory = path.join(options.outputRoot, outputFolderName(recording))
    await mkdir(outputDirectory, { recursive: true })
    const output = await nextAvailableOutput({
      outputRoot: outputDirectory,
      fileName: outputFileName({ recording, quality, generatedFrom }),
    })
    const { fileName, outputPath } = output
    stagedOutputPath = path.join(outputDirectory, `.${fileName}.${process.pid}.partial.mp4`)
    const launched = await startChrome(options, userDataDir)
    chrome = launched.chrome
    client = await createPage(launched.browserWsUrl)

    const url = `${options.baseUrl}/reader?recording=1&audioId=${encodeURIComponent(recording.id)}#/torah/parsha/${recording.parshaSlug}`
    await navigate(client, url, options)
    const captureOptions = {
      ...options,
      captureScale: await evaluate(client, 'window.devicePixelRatio'),
    }
    const session = await evaluate(
      client,
      `window.tikkunRecorder.loadAudio(${JSON.stringify(recording.id)})`
    )
    if (!session) throw new Error('recording session could not be loaded')
    if (session.cues.length < session.tokenKeys.length) {
      throw new Error(`incomplete cues: ${session.cues.length}/${session.tokenKeys.length}`)
    }

    const state = await evaluate(client, 'window.tikkunRecorder.state()')
    const duration = Number(state.duration)
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`invalid audio duration: ${state.duration}`)
    }

    await evaluate(client, 'window.tikkunRecorder.prepare()')
    const sample = await activeWordSample(client, session.cues[0])
    if (!sample?.text || sample.width <= 0 || sample.height <= 0) {
      throw new Error('active Hebrew word sample was not visible')
    }

    if (options.frameTransport === 'stream') {
      encoder = await startFrameEncoder({
        ...options,
        audioPath,
        outputPath: stagedOutputPath,
        expectedFrameCount: Math.ceil(duration * options.fps),
        onFrameWritten: framesCompleted => options.onProgress?.({ framesCompleted }),
        spawnProcess: spawnOwnedProcess,
        stopProcess: stopOwnedProcess,
      })
    }
    const frameOptions = {
      ...captureOptions,
      checkpoint: () => {
        options.checkpoint()
        encoder?.writer.check()
      },
    }

    const capture = await captureFrameSequence({ client, frameDir, duration, options: frameOptions, writer: encoder?.writer })

    options.onProgress?.({ stage: 'encoding' })
    const ffmpegLog =
      encoder
        ? await encoder.writer.finish()
        : capture.ffmpegInput.kind === 'concat'
        ? await encodeConcatVideo({
            concatPath: capture.ffmpegInput.concatPath,
            frameCount: capture.frameCount,
            audioPath,
            outputPath: stagedOutputPath,
            options,
          })
        : await encodeVideo({
            frameDir: capture.ffmpegInput.frameDir,
            audioPath,
            outputPath: stagedOutputPath,
            options,
          })
    options.onProgress?.({ stage: 'validating' })
    const validation = await validateOutput({
      outputPath: stagedOutputPath,
      expectedDuration: duration,
      expectedFrameCount: capture.frameCount,
      expectedWidth: capture.outputWidth,
      expectedHeight: capture.outputHeight,
      options,
      ffmpegLog,
    })
    if (!validation.passed) throw new Error(`Video validation failed: ${validation.errors.join('; ')}`)
    options.checkpoint()
    await rename(stagedOutputPath, outputPath)
    stagedOutputPath = null
    const outputStat = await stat(outputPath)

    const metadata = {
      audioId: recording.id,
      narratorId: recording.narratorId,
      narratorInitials: narratorInitials(recording.narratorId),
      parshaSlug: recording.parshaSlug,
      aliyah: recording.aliyah,
      title: recording.title,
      fileName,
      outputRelativePath: path.relative(options.outputRoot, outputPath),
      outputHash: await videoFileHash(outputPath),
      recordingSettings: recordingSettings(options),
      width: capture.outputWidth,
      height: capture.outputHeight,
      fps: options.fps,
      durationSeconds: Number(duration.toFixed(3)),
      frameCount: capture.frameCount,
      renderMode: options.renderMode,
      frameTransport: options.frameTransport,
      capturedFrameCount: capture.capturedFrameCount,
      crop: capture.crop ?? undefined,
      bytes: outputStat.size,
      quality,
      generatedAt: new Date().toISOString(),
      generatedFrom,
      validation,
    }

    return {
      ok: validation.passed,
      metadata,
      report: {
        audioId: recording.id,
        ok: validation.passed,
        outputPath,
        renderMode: options.renderMode,
        frameTransport: options.frameTransport,
        renderSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
        frameCount: capture.frameCount,
        capturedFrameCount: capture.capturedFrameCount,
        averageFrameLatencyMs: average(capture.frameLatencies),
        maxFrameLatencyMs: capture.frameLatencies.length
          ? Math.max(...capture.frameLatencies)
          : 0,
        crop: capture.crop ?? undefined,
        outputBytes: outputStat.size,
        validation,
      },
    }
  } catch (error) {
    return {
      ok: false,
      metadata: null,
      report: {
        audioId: recording.id,
        ok: false,
        renderSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
        error: error instanceof Error ? error.message : String(error),
      },
    }
  } finally {
    client?.close()
    if (encoder) {
      encoder.writer.abort()
      await stopOwnedProcess(encoder.child)
    }
    await stopChrome(chrome)
    if (stagedOutputPath) await rm(stagedOutputPath, { force: true })
    if (!options.keepFrames) {
      await removeWorkDir(frameDir)
      await removeWorkDir(userDataDir)
    }
  }
}

function average(values) {
  return values.length
    ? Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(2))
    : 0
}

async function updateMetadata(results) {
  const existing = await readJsonFile(metadataPath, [])
  const byAudioId = new Map(existing.map((entry) => [entry.audioId, entry]))
  for (const result of results) {
    if (result.metadata?.validation.passed) {
      byAudioId.set(result.metadata.audioId, result.metadata)
    }
  }
  await writeJsonFile(
    metadataPath,
    [...byAudioId.values()].sort((left, right) => left.audioId.localeCompare(right.audioId))
  )
}

async function appendReports(results) {
  const existing = await readJsonFile(reportPath, [])
  await writeJsonFile(reportPath, existing.concat(results.map((result) => result.report)))
}

function selectedRecordings(options) {
  const selectedIds = new Set(options.ids)
  return audioRecordings.filter(
    (recording) =>
      recording.reading.kind === 'parsha' &&
      recording.status === 'available' &&
      (!selectedIds.size || selectedIds.has(recording.id))
  )
}

async function recordBatch(options) {
  const selected = selectedRecordings(options)
  if (!selected.length) throw new Error('No matching available recordings')
  const recordings = []
  const missingCues = []
  const metadata = options.force ? [] : await readJsonFile(metadataPath, [])
  const byAudioId = new Map(metadata.map(entry => [entry.audioId, entry]))
  for (const recording of selected) {
    const cues = await getCuesForRecording(recording)
    if (Array.isArray(cues) && cues.length === 0) {
      console.log(`[video] Skipped ${recording.id}: missing cue data`)
      missingCues.push(recording.id)
      continue
    }
    const saved = byAudioId.get(recording.id)
    let completed = false
    if (saved?.outputHash && saved.fileName && path.basename(saved.fileName) === saved.fileName) {
      console.log(`[video] Checking completed file: ${recording.id}`)
      const generatedFrom = {
        audioHash: await sha256File(siteAudioUrlToLocalPath(recording.playSrc)),
        cueHash: sha256Json(cues),
      }
      completed = await completedVideoMatches({ metadata: saved, outputRoot: options.outputRoot,
        relativePath: path.join(outputFolderName(recording), saved.fileName), options, generatedFrom })
    }
    if (completed) console.log(`[video] Skipped ${recording.id}: completed file matches current sources and settings`)
    else recordings.push(recording)
  }
  if (missingCues.length) {
    await appendReports(missingCues.map(audioId => ({
      report: { audioId, ok: false, skipped: true, reason: 'missing cue data' },
    })))
  }
  console.log(`[video] ${selected.length - recordings.length - missingCues.length} completed; ${missingCues.length} skipped without cues; ${recordings.length} remaining`)
  if (!recordings.length) return { results: [], peakConcurrency: 0, unstarted: [] }
  await mkdir(options.workRoot, { recursive: true })
  await mkdir(options.outputRoot, { recursive: true })
  const vite = await startVite(options)
  let progress
  try {
    const limit = options.concurrency === 'auto' ? options.maxConcurrency : Math.min(options.concurrency, options.maxConcurrency)
    progress = createVideoProgress(recordings, { limit })
    const batch = await runResourceAware(recordings, {
      limit,
      memoryPerJob: Math.max(1.5 * 1024 ** 3, options.width * options.height * options.deviceScaleFactor ** 2 * 64),
      sample: createResourceSampler(options.workRoot, options.outputRoot),
      worker: (recording, checkpoint) => {
        progress.update(recording.id, { stage: 'preparing' })
        return recordOne(recording, {
          ...options, checkpoint,
          onProgress: patch => progress.update(recording.id, patch),
        })
      },
      onResult: async (result) => {
        await updateMetadata([result])
        await appendReports([result])
        progress.complete(result)
      },
      onFatal: async () => {
        shuttingDown = true
        await stopAllOwnedProcesses()
      },
      log: (message) => progress.log(`[video] ${message}`),
      onState: state => progress.scheduler(state),
    })
    progress.log(`[video] Peak concurrency: ${batch.peakConcurrency}; validated: ${batch.results.filter((result) => result.ok).length}/${recordings.length}`)
    if (batch.failure) {
      if (batch.unstarted.length) {
        progress.log(`Not started: ${batch.unstarted.join(', ')}`)
        await appendReports(batch.unstarted.map((audioId) => ({
          report: { audioId, ok: false, error: `Not started: ${batch.failure.message}` },
        })))
      }
      throw batch.failure
    }
    return batch
  } finally {
    progress?.close()
    await stopOwnedProcess(vite)
  }
}

async function calibrate(options) {
  const recordings = selectedRecordings(options)
  if (!recordings.length) throw new Error('No recordings available for calibration')
  if (recordings.length < options.maxConcurrency) {
    throw new Error(`Calibration needs at least ${options.maxConcurrency} distinct recordings; selected ${recordings.length}. Provide more --ids or lower --max-concurrency.`)
  }
  const summaries = []

  for (let concurrency = 1; concurrency <= options.maxConcurrency; concurrency += 1) {
    const calibrationOptions = {
      ...options,
      force: true,
      concurrency,
      ids: recordings.slice(0, concurrency).map((recording) => recording.id),
    }
    const startedAt = Date.now()
    try {
      const batch = await recordBatch(calibrationOptions)
      if (batch.peakConcurrency !== concurrency) {
        console.warn(`Requested ${concurrency} workers; observed ${batch.peakConcurrency}. This run does not establish capacity for ${concurrency} workers.`)
      }
      summaries.push({
        concurrency,
        observedConcurrency: batch.peakConcurrency,
        reachedRequestedConcurrency: batch.peakConcurrency === concurrency,
        ok: true,
        seconds: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
      })
    } catch (error) {
      summaries.push({
        concurrency,
        ok: false,
        seconds: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
        error: error instanceof Error ? error.message : String(error),
      })
      break
    }
  }

  await writeJsonFile(path.join(repoRoot, 'video-calibration.local.json'), summaries)
  const failed = summaries.find((summary) => !summary.ok)
  if (failed) throw new Error(`Calibration failed at concurrency ${failed.concurrency}: ${failed.error}`)
}

async function cleanup(options) {
  await removeWorkDir(options.workRoot)
  if (options.includeOutput) {
    if (!(await pathExists(options.outputRoot))) return
    const files = await listFilesWithExtension(options.outputRoot, '.mp4')
    await Promise.all(files.map((file) => removeWorkDir(file)))
  }
}

const options = parseArgs(process.argv.slice(2))

if (options.command === 'status') {
  const result = await inspectOwnedRun({
    repoRoot,
    workRoot: options.workRoot,
  })
  console.log(JSON.stringify(result, null, 2))
} else if (options.command === 'cleanup') {
  await cleanup(options)
} else if (options.command === 'shutdown') {
  const result = await shutdownOwnedRun({
    repoRoot,
    workRoot: options.workRoot,
    cleanup: () => cleanup(options),
    dryRun: options.dryRun,
  })
  if (result.status === 'dry-run') {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(
      result.status === 'stopped'
        ? `Stopped owned video processes: ${result.stopped.join(', ')}`
        : 'No active owned video processes found'
    )
  }
} else if (options.command === 'calibrate') {
  processRegistry = await openOwnedProcessRegistry({ repoRoot, workRoot: options.workRoot })
  installShutdownHandlers()
  try {
    await calibrate(options)
  } finally {
    await stopAllOwnedProcesses()
    await processRegistry.close()
  }
} else {
  processRegistry = await openOwnedProcessRegistry({ repoRoot, workRoot: options.workRoot })
  installShutdownHandlers()
  try {
    await recordBatch(options)
  } finally {
    await stopAllOwnedProcesses()
    await processRegistry.close()
  }
}
