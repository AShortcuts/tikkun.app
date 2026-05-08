import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, spawn } from 'node:child_process'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { audioRecordings } from '../src/data/audio-manifest.generated.ts'
import {
  buildCueFramePlan,
  createCueConcatEntries,
  renderCueConcatFile,
} from '../src/video/cue-frame-plan.ts'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const defaultOutputRoot = '/Users/adambh/Koofr/Tikkun Videos'
const defaultWorkRoot = '/private/tmp/tikkun-video-render'
const metadataPath = path.join(repoRoot, 'video-render-metadata.local.json')
const reportPath = path.join(repoRoot, 'video-render-reports.local.json')
const staticRoot = path.join(repoRoot, 'static')
const cueRoot = path.join(repoRoot, 'src/data/audio-cues')
let cuePayloadsByAudioId = null

const defaults = {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 3,
  fps: 30,
  crf: 18,
  preset: 'veryfast',
  outputRoot: process.env.TIKKUN_VIDEO_OUTPUT_ROOT || defaultOutputRoot,
  workRoot: process.env.TIKKUN_VIDEO_WORK_ROOT || defaultWorkRoot,
  baseUrl: 'http://127.0.0.1:4177',
  concurrency: 1,
  // Default to deterministic frames until cue-keyframe rendering is tuned.
  renderMode: 'deterministic-frames',
  cueBurstPreEndMs: 120,
  cueBurstMaxMs: 500,
  crop: true,
  cropMargin: 96,
}

function parseArgs(argv) {
  const options = {
    ...defaults,
    ids: [],
    command: 'record',
    maxConcurrency: 3,
    keepFrames: false,
    includeOutput: false,
    externalServer: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === 'calibrate') {
      options.command = 'calibrate'
    } else if (arg === 'cleanup') {
      options.command = 'cleanup'
    } else if (arg === '--keep-frames') {
      options.keepFrames = true
    } else if (arg === '--include-output') {
      options.includeOutput = true
    } else if (arg === '--external-server') {
      options.externalServer = true
    } else if (arg === '--no-crop') {
      options.crop = false
    } else if (arg.startsWith('--ids=')) {
      options.ids = arg.slice('--ids='.length).split(',').filter(Boolean)
    } else if (arg.startsWith('--render-mode=')) {
      options.renderMode = arg.slice('--render-mode='.length)
    } else if (arg.startsWith('--concurrency=')) {
      options.concurrency = Number(arg.slice('--concurrency='.length))
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

  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error('--concurrency must be a positive integer')
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
  if (!Number.isFinite(options.cueBurstPreEndMs) || options.cueBurstPreEndMs < 0) {
    throw new Error('--cue-burst-pre-end-ms must be a non-negative number')
  }
  if (!Number.isFinite(options.cueBurstMaxMs) || options.cueBurstMaxMs < 0) {
    throw new Error('--cue-burst-max-ms must be a non-negative number')
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

function publicAudioPathToLocalPath(playSrc) {
  const pathname = new URL(playSrc, 'https://tikkun.local').pathname
  return path.join(staticRoot, decodeURIComponent(pathname.replace(/^\//, '')))
}

async function sha256File(filePath) {
  const hash = createHash('sha256')
  hash.update(await readFile(filePath))
  return hash.digest('hex')
}

function sha256Json(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function appBuildHash() {
  try {
    return (await execFileText('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })).trim()
  } catch {
    const hash = createHash('sha256')
    hash.update(await readFile(path.join(repoRoot, 'src/index.ts')))
    hash.update(await readFile(path.join(repoRoot, 'css/app-layout.css')))
    return hash.digest('hex')
  }
}

function execFileText(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} ${args.join(' ')} failed: ${stderr || error.message}`))
        return
      }
      resolve(stdout)
    })
  })
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

async function listJsonFiles(root) {
  const entries = await readdir(root, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(root, entry.name)
      if (entry.isDirectory()) return listJsonFiles(entryPath)
      return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : []
    })
  )
  return nested.flat()
}

async function getCuesForRecording(recording) {
  if (!cuePayloadsByAudioId) {
    const files = await listJsonFiles(cueRoot)
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

  const vite = spawn(
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4177'],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  try {
    await waitForHttp(options.baseUrl, 30000)
    return vite
  } catch (error) {
    vite.kill('SIGTERM')
    throw error
  }
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now()
  let lastError = null
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? 'no response'}`)
}

function startChrome(options, userDataDir) {
  const executable = chromeExecutable()
  if (!executable) throw new Error('Set TIKKUN_CHROME to a Chromium executable')

  const chrome = spawn(
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
    { stdio: ['ignore', 'ignore', 'pipe'] }
  )

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.kill('SIGTERM')
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
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
    })

    return new Promise((resolve, reject) => {
      this.socket.addEventListener('open', () => resolve(), { once: true })
      this.socket.addEventListener('error', () => reject(new Error('CDP websocket failed')), {
        once: true,
      })
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    this.socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
  }

  close() {
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
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed')
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
  await writeFile(filePath, Buffer.from(result.data, 'base64'))
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
  const args = [
    '-y',
    '-framerate',
    String(options.fps),
    '-i',
    path.join(frameDir, 'frame-%06d.png'),
    '-i',
    audioPath,
    '-c:v',
    'libx264',
    '-preset',
    options.preset,
    '-crf',
    String(options.crf),
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    outputPath,
  ]

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve(stderr)
      else reject(new Error(`ffmpeg exited ${code}: ${stderr}`))
    })
  })
}

async function encodeConcatVideo({ concatPath, audioPath, outputPath, options }) {
  const args = [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatPath,
    '-i',
    audioPath,
    '-vf',
    `fps=${options.fps}`,
    '-fps_mode',
    'cfr',
    '-c:v',
    'libx264',
    '-preset',
    options.preset,
    '-crf',
    String(options.crf),
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-shortest',
    outputPath,
  ]

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve(stderr)
      else reject(new Error(`ffmpeg exited ${code}: ${stderr}`))
    })
  })
}

async function ffprobe(outputPath) {
  const stdout = await execFileText('ffprobe', [
    '-v',
    'error',
    '-count_frames',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    outputPath,
  ])
  return JSON.parse(stdout)
}

function parseFrameRate(value) {
  const [numerator, denominator] = String(value).split('/').map(Number)
  return denominator ? numerator / denominator : numerator
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
  const errors = []
  const warnings = []
  const probe = await ffprobe(outputPath)
  const videoStream = probe.streams.find((stream) => stream.codec_type === 'video')
  const audioStream = probe.streams.find((stream) => stream.codec_type === 'audio')
  const duration = Number(probe.format.duration)
  const actualFps = parseFrameRate(videoStream?.avg_frame_rate)
  const actualFrames = Number(videoStream?.nb_read_frames ?? videoStream?.nb_frames)

  if (!videoStream) errors.push('missing video stream')
  if (!audioStream) errors.push('missing audio stream')
  if (videoStream && Number(videoStream.width) !== expectedWidth) {
    errors.push(`width mismatch: ${videoStream.width} !== ${expectedWidth}`)
  }
  if (videoStream && Number(videoStream.height) !== expectedHeight) {
    errors.push(`height mismatch: ${videoStream.height} !== ${expectedHeight}`)
  }
  if (Math.abs(actualFps - options.fps) > 0.01) errors.push(`fps mismatch: ${actualFps}`)
  if (Number.isFinite(actualFrames) && Math.abs(actualFrames - expectedFrameCount) > 1) {
    errors.push(`frame count mismatch: ${actualFrames} !== ${expectedFrameCount}`)
  }
  if (Math.abs(duration - expectedDuration) > 0.35) {
    errors.push(`duration mismatch: ${duration} !== ${expectedDuration}`)
  }
  if (/\bdrop=\s*[1-9]\d*/i.test(ffmpegLog)) errors.push('ffmpeg reported dropped frames')
  if (
    options.renderMode !== 'cue-keyframes' &&
    /\bdup=\s*[1-9]\d*/i.test(ffmpegLog)
  ) {
    errors.push('ffmpeg reported duplicated frames')
  }
  if (/non-monotonous/i.test(ffmpegLog)) errors.push('ffmpeg reported non-monotonous timestamps')
  if (/\berror\b/i.test(ffmpegLog)) errors.push('ffmpeg log contains error wording')

  await execFileText('ffmpeg', ['-v', 'error', '-i', outputPath, '-f', 'null', '-'])

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  }
}

async function activeWordSample(client) {
  return evaluate(
    client,
    `(() => {
      const active = document.querySelector('.is-active-word');
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

function waitForProcessExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

async function stopChrome(chrome) {
  if (!chrome) return
  chrome.kill('SIGTERM')
  await waitForProcessExit(chrome, 3000)
  if (chrome.exitCode === null && chrome.signalCode === null) {
    chrome.kill('SIGKILL')
    await waitForProcessExit(chrome, 1000)
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

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function renderFrameAt({
  client,
  seconds,
  filePath,
  options,
  settleMs = 0,
  highlightAnimationMs,
  settleBeforeAnimation = false,
  scrollTransition = false,
  transitionWaitMs = 0,
}) {
  const state =
    highlightAnimationMs !== undefined
      ? await evaluate(
          client,
          `window.tikkunRecorder.renderHighlightAnimationAt(${seconds}, ${highlightAnimationMs}, ${settleBeforeAnimation}, ${scrollTransition}, ${transitionWaitMs})`
        )
      : settleMs > 0
        ? await evaluate(client, `window.tikkunRecorder.settleAt(${seconds})`)
        : await evaluate(client, `window.tikkunRecorder.renderAt(${seconds})`)
  if (settleMs > 0) await wait(settleMs)
  const crop = options.crop
    ? await evaluate(client, `window.tikkunRecorder.captureRect(${options.cropMargin})`)
    : null
  await captureFrame(client, filePath, crop)
  return { state, crop }
}

async function captureFullFrameSequence({
  client,
  frameDir,
  duration,
  options,
}) {
  const frameCount = Math.ceil(duration * options.fps)
  const frameLatencies = []
  let lastCrop = null

  for (let index = 0; index < frameCount; index += 1) {
    const frameStartedAt = performance.now()
    const seconds = index / options.fps
    const result = await renderFrameAt({
      client,
      seconds,
      filePath: path.join(frameDir, `frame-${String(index).padStart(6, '0')}.png`),
      options,
    })
    lastCrop = result.crop
    frameLatencies.push(Number((performance.now() - frameStartedAt).toFixed(2)))
  }

  const frameErrors = await validateFrameSequence(frameDir, frameCount)
  if (frameErrors.length) throw new Error(frameErrors.join('; '))

  return {
    ffmpegInput: { kind: 'frames', frameDir },
    frameCount,
    capturedFrameCount: frameCount,
    frameLatencies,
    crop: lastCrop,
    ...capturedPixelDimensions(lastCrop, options),
  }
}

async function captureCueKeyframes({
  client,
  frameDir,
  cues,
  duration,
  options,
}) {
  const plan = buildCueFramePlan({
    cues,
    durationSeconds: duration,
    fps: options.fps,
    burstPreEndMs: options.cueBurstPreEndMs,
    burstMaxMs: options.cueBurstMaxMs,
  })
  const frameLatencies = []
  let lastCrop = null

  for (let index = 0; index < plan.entries.length; index += 1) {
    const frameStartedAt = performance.now()
    const entry = plan.entries[index]
    const result = await renderFrameAt({
      client,
      seconds: entry.seconds,
      filePath: path.join(frameDir, `frame-${String(index).padStart(6, '0')}.png`),
      options,
      settleMs: entry.settleMs ?? 0,
      highlightAnimationMs: entry.highlightAnimationMs,
      settleBeforeAnimation: entry.settleBeforeAnimation ?? false,
      scrollTransition: entry.scrollTransition ?? false,
      transitionWaitMs: entry.transitionWaitMs ?? 0,
    })
    lastCrop = result.crop
    frameLatencies.push(Number((performance.now() - frameStartedAt).toFixed(2)))
  }

  const frameErrors = await validateFrameSequence(frameDir, plan.entries.length)
  if (frameErrors.length) throw new Error(frameErrors.join('; '))

  const concatEntries = createCueConcatEntries({
    plan,
    fps: options.fps,
    frameName: (index) => path.join(frameDir, `frame-${String(index).padStart(6, '0')}.png`),
  })
  const concatPath = path.join(frameDir, 'frames.concat.txt')
  await writeFile(concatPath, renderCueConcatFile(concatEntries))

  return {
    ffmpegInput: { kind: 'concat', concatPath },
    frameCount: plan.frameCount,
    capturedFrameCount: plan.entries.length,
    frameLatencies,
    crop: lastCrop,
    ...capturedPixelDimensions(lastCrop, options),
  }
}

async function recordOne(recording, options) {
  const startedAt = Date.now()
  const userDataDir = path.join(options.workRoot, `chrome-${recording.id}-${Date.now()}`)
  const frameDir = path.join(options.workRoot, `frames-${recording.id}-${Date.now()}`)
  const quality = `${Math.round(options.height)}p${options.fps}`
  await mkdir(frameDir, { recursive: true })
  await mkdir(options.outputRoot, { recursive: true })

  let chrome
  let client
  try {
    const audioPath = publicAudioPathToLocalPath(recording.playSrc)
    const cues = await getCuesForRecording(recording)
    if (!cues.length) throw new Error('missing cue data')

    const generatedFrom = {
      audioHash: await sha256File(audioPath),
      cueHash: sha256Json(cues),
      appBuildHash: await appBuildHash(),
    }
    const output = await nextAvailableOutput({
      outputRoot: options.outputRoot,
      fileName: outputFileName({ recording, quality, generatedFrom }),
    })
    const { fileName, outputPath } = output
    const launched = await startChrome(options, userDataDir)
    chrome = launched.chrome
    client = await createPage(launched.browserWsUrl)

    const url = `${options.baseUrl}/?recording=1&audioId=${encodeURIComponent(recording.id)}#/parsha/${recording.parshaSlug}`
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

    await evaluate(client, `window.tikkunRecorder.settleAt(${session.cues[0].timeStart})`)
    const sample = await activeWordSample(client)
    if (!sample?.text || sample.width <= 0 || sample.height <= 0) {
      throw new Error('active Hebrew word sample was not visible')
    }

    const capture =
      options.renderMode === 'deterministic-frames'
        ? await captureFullFrameSequence({ client, frameDir, duration, options: captureOptions })
        : await captureCueKeyframes({
            client,
            frameDir,
            cues: session.cues,
            duration,
            options: captureOptions,
          })

    const ffmpegLog =
      capture.ffmpegInput.kind === 'concat'
        ? await encodeConcatVideo({
            concatPath: capture.ffmpegInput.concatPath,
            audioPath,
            outputPath,
            options,
          })
        : await encodeVideo({
            frameDir: capture.ffmpegInput.frameDir,
            audioPath,
            outputPath,
            options,
          })
    const validation = await validateOutput({
      outputPath,
      expectedDuration: duration,
      expectedFrameCount: capture.frameCount,
      expectedWidth: capture.outputWidth,
      expectedHeight: capture.outputHeight,
      options,
      ffmpegLog,
    })
    const outputStat = await stat(outputPath)

    const metadata = {
      audioId: recording.id,
      narratorId: recording.narratorId,
      narratorInitials: narratorInitials(recording.narratorId),
      parshaSlug: recording.parshaSlug,
      aliyah: recording.aliyah,
      title: recording.title,
      fileName,
      width: capture.outputWidth,
      height: capture.outputHeight,
      fps: options.fps,
      durationSeconds: Number(duration.toFixed(3)),
      frameCount: capture.frameCount,
      renderMode: options.renderMode,
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
    await stopChrome(chrome)
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

async function runLimited(items, concurrency, worker) {
  const results = []
  let nextIndex = 0
  const workers = Array.from({ length: concurrency }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index])
    }
  })
  await Promise.all(workers)
  return results
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
      recording.status === 'available' &&
      (!selectedIds.size || selectedIds.has(recording.id))
  )
}

async function recordBatch(options) {
  const vite = await startVite(options)
  try {
    const recordings = selectedRecordings(options)
    if (!recordings.length) throw new Error('No matching available recordings')
    const results = await runLimited(recordings, options.concurrency, (recording) =>
      recordOne(recording, options)
    )
    await updateMetadata(results)
    await appendReports(results)
    const failed = results.filter((result) => !result.ok)
    if (failed.length) {
      const summary = failed
        .map((result) => {
          const details =
            result.report.error ??
            result.report.validation?.errors?.join(', ') ??
            'unknown failure'
          return `${result.report.audioId}: ${details}`
        })
        .join('; ')
      throw new Error(`${failed.length}/${results.length} video job(s) failed: ${summary}`)
    }
  } finally {
    vite?.kill('SIGTERM')
  }
}

async function calibrate(options) {
  const recordings = selectedRecordings(options).slice(0, Math.max(1, options.concurrency))
  if (!recordings.length) throw new Error('No recordings available for calibration')
  const summaries = []

  for (let concurrency = 1; concurrency <= options.maxConcurrency; concurrency += 1) {
    const calibrationOptions = {
      ...options,
      concurrency,
      ids: recordings.map((recording) => recording.id),
    }
    const startedAt = Date.now()
    try {
      await recordBatch(calibrationOptions)
      summaries.push({
        concurrency,
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
}

async function cleanup(options) {
  await removeWorkDir(options.workRoot)
  if (options.includeOutput) {
    const entries = await readdir(options.outputRoot).catch(() => [])
    await Promise.all(
      entries
        .filter((entry) => entry.endsWith('.mp4'))
        .map((entry) => removeWorkDir(path.join(options.outputRoot, entry)))
    )
  }
}

const options = parseArgs(process.argv.slice(2))

if (options.command === 'cleanup') {
  await cleanup(options)
} else if (options.command === 'calibrate') {
  await calibrate(options)
} else {
  await recordBatch(options)
}
