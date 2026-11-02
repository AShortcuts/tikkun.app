import { execFile, execFileSync, spawn } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { cueFileRelativePathForRecording } from '../app/audio/cue-file.ts'
import { readZipEntries } from '../app/admin/zip-entries.ts'
import { audioNarrators, audioRecordingsByParsha } from '../generated/audio-manifest.ts'
import { discoverAudioCatalog, findChangedAudio, importAudioCatalog } from './generate-audio-manifest.mjs'
import { audioImportSource } from './import-aligner-audio.mjs'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const alignerRoot = path.join(repoRoot, 'experiments/torah-audio-aligner')
const alignerWork = path.join(alignerRoot, 'work')
const ALIGNER_APP = 'torah-aligner-private-batch-v1'
const execFileAsync = promisify(execFile)

const cueIdentity = (recording) => ({
  narratorId: recording.narratorId,
  aliyah: recording.aliyah,
  reading: { kind: 'parsha', id: recording.parshaSlug },
})

const sameAudio = (left, right) =>
  Boolean(left && right && left.digest === right.digest && left.byteLength === right.byteLength)

/**
 * Recordings that need generated cues: no cue file, an empty one, or one timed
 * against different audio than the recording now has.
 */
export async function findRecordingsNeedingCues(recordings, root = repoRoot) {
  const needed = []
  for (const recording of recordings) {
    if (recording.status !== 'available') continue
    const relativePath = cueFileRelativePathForRecording(cueIdentity(recording))
    if (!relativePath) continue
    let text
    try {
      text = await readFile(path.join(root, relativePath), 'utf8')
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      needed.push({ recording, cuePath: relativePath, reason: 'no cue file' })
      continue
    }
    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      needed.push({ recording, cuePath: relativePath, reason: 'cue file is unreadable' })
      continue
    }
    if (!payload?.cueCount) needed.push({ recording, cuePath: relativePath, reason: 'cue file has no cues' })
    else if (!sameAudio(payload.mediaIdentity, recording.mediaIdentity)) {
      needed.push({ recording, cuePath: relativePath, reason: 'cue file is for different audio' })
    }
  }
  return needed
}

function parseOptions(argv) {
  const options = { out: path.join(os.homedir(), 'Downloads'), port: null, reviewDir: null }
  for (let index = 0; index < argv.length; index += 1) {
    const [name, inline] = argv[index].split('=', 2)
    const value = () => {
      const result = inline ?? argv[++index]
      if (!result) throw new Error(name + ' needs a value.')
      return result
    }
    if (name === '--out') options.out = path.resolve(value())
    else if (name === '--port') options.port = Number(value())
    else if (name === '--review-dir') options.reviewDir = value()
    else throw new Error('Unknown option ' + argv[index] + '. Options: --out <folder>, --port <aligner port>, --review-dir <aligner workspace>.')
  }
  // Mirrors the aligner launcher: the cue-flag workspace is the current one when present.
  const cueFlags = existsSync(path.join(alignerWork, 'private-batch-cue-flags/queue.json'))
  options.port ??= cueFlags ? 8768 : 8769
  options.reviewDir ??= cueFlags ? 'private-batch-cue-flags' : 'private-batch'
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) {
    throw new Error('Choose an aligner port from 1024 to 65535.')
  }
  return options
}

const megabytes = (bytes) => (bytes / 1024 / 1024).toFixed(1) + ' MB'

async function describeAudio(file) {
  try {
    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', file], { timeout: 15_000 })
    const seconds = Math.round(Number(stdout.trim()))
    if (Number.isFinite(seconds)) return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
  } catch (error) {
    console.warn('  (Could not read the length of ' + file + ': ' + (error instanceof Error ? error.message : error) + ')')
  }
  return 'length unknown'
}

/** Warns about every changed recording and asks whether to replace it. */
async function reviewChangedAudio(changed, targetAudioRoot) {
  const replace = new Set()
  const keep = new Set()
  if (!changed.length) return { replace, keep }
  console.log('\n' + '!'.repeat(72))
  console.log('WARNING: ' + (changed.length === 1 ? '1 recording in your recordings folder differs' : changed.length + ' recordings in your recordings folder differ') +
    ' from the copy in the project.')
  console.log('Nothing is replaced unless you choose replace for it.')
  console.log('!'.repeat(72))
  const prompt = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
  try {
    for (const change of changed) {
      const projectFile = path.join(targetAudioRoot, ...decodeURIComponent(new URL(change.existing.playSrc, 'https://tikkun.local').pathname).split('/').slice(3))
      const cuePath = cueFileRelativePathForRecording(cueIdentity(change.existing))
      const hasCues = Boolean(cuePath && existsSync(path.join(repoRoot, cuePath)))
      console.log('\n  ' + change.title)
      console.log('    Project copy: ' + megabytes(change.existing.mediaIdentity.byteLength) + ', ' + await describeAudio(projectFile))
      console.log('    Your folder:  ' + megabytes(change.incoming.mediaIdentity.byteLength) + ', ' + await describeAudio(change.sourcePath) +
        ' (' + path.basename(change.sourcePath) + ')')
      console.log(hasCues
        ? '    Replacing it makes ' + cuePath + ' invalid until you export new cues; the site build reports an error for it until then.'
        : '    It has no cue file yet.')
      if (!prompt) {
        keep.add(change.id)
        continue
      }
      for (;;) {
        const answer = (await prompt.question('    Replace the project copy with your folder\'s version? [r]eplace / [s]kip: ')).trim().toLowerCase()
        if (answer === 'r' || answer === 'replace') { replace.add(change.id); break }
        if (answer === 's' || answer === 'skip') { keep.add(change.id); break }
      }
    }
  } finally {
    prompt?.close()
  }
  if (!prompt && keep.size) console.log('\n  This terminal cannot ask, so nothing was replaced. Run npm run cues:generate in Terminal to choose.')
  return { replace, keep }
}

function aligner(port) {
  let token = null
  const send = (method, pathname, body) => new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body))
    const headers = payload
      ? { 'content-type': 'application/json', 'content-length': payload.length, origin: 'http://127.0.0.1:' + port, 'x-private-token': token ?? '' }
      : {}
    const request = http.request({ host: '127.0.0.1', port, path: pathname, method, headers }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode ?? 0, type: response.headers['content-type'] ?? '', body: Buffer.concat(chunks) }))
      response.on('error', reject)
    })
    request.on('error', reject)
    request.end(payload)
  })
  const json = async (method, pathname, body) => {
    const response = await send(method, pathname, body)
    const value = JSON.parse(response.body.toString('utf8') || 'null')
    if (response.status >= 400) throw new Error(value?.error ?? 'The aligner answered ' + response.status + ' for ' + pathname + '.')
    return value
  }
  return {
    get: (pathname) => json('GET', pathname),
    post: async (pathname, body) => {
      token ??= (await json('GET', '/api/catalog')).csrf
      return json('POST', pathname, body)
    },
    async zip(selections) {
      token ??= (await json('GET', '/api/catalog')).csrf
      const response = await send('POST', '/api/batch/export', { selections })
      if (response.status >= 400 || !response.type.startsWith('application/zip')) {
        let message = 'The aligner could not prepare the ZIP (' + response.status + ').'
        try { message = JSON.parse(response.body.toString('utf8')).error ?? message } catch { /* keep the status message */ }
        throw new Error(message)
      }
      return response.body
    },
    async health() {
      try {
        return await json('GET', '/api/health')
      } catch (error) {
        if (error?.code === 'ECONNREFUSED') return null
        throw error
      }
    },
  }
}

/** Uses a running aligner, or starts one for this run and stops it afterwards. */
async function connectAligner({ port, reviewDir }) {
  const client = aligner(port)
  const health = await client.health()
  if (health) {
    if (health.app !== ALIGNER_APP) throw new Error('Port ' + port + ' belongs to another service.')
    if (!health.unlimitedRun) {
      throw new Error('The aligner running on port ' + port + ' started before this update. Press Ctrl+C in its terminal, then run npm run cues:generate again.')
    }
    console.log('Using the aligner already running at http://127.0.0.1:' + port + '.')
    return { client, stop: async () => {} }
  }
  const python = path.join(alignerRoot, '.venv/bin/python')
  if (!existsSync(python)) throw new Error('The aligner environment is missing: ' + python)
  console.log('Starting the aligner...')
  // Its own process group, so Ctrl+C here pauses the queue instead of killing the aligner mid-recording.
  const child = spawn(python, ['-B', 'batch_server.py', '--port', String(port), '--review-dir', reviewDir], {
    cwd: alignerRoot, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  })
  const output = []
  const remember = (chunk) => output.push(...chunk.toString('utf8').split('\n').filter(Boolean))
  child.stdout.on('data', remember)
  child.stderr.on('data', remember)
  const exited = new Promise((resolve) => child.on('exit', resolve))
  const stop = async () => {
    if (child.exitCode !== null) return
    child.kill('SIGTERM')
    await exited
  }
  const deadline = Date.now() + 120_000
  while (!(await client.health())) {
    if (child.exitCode !== null || Date.now() > deadline) {
      await stop()
      throw new Error('The aligner did not start.\n' + output.slice(-20).join('\n'))
    }
    await delay(500)
  }
  return { client, stop }
}

const stamp = (date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part) => String(part).padStart(2, '0')).join('-') +
  '-' + String(date.getHours()).padStart(2, '0') + String(date.getMinutes()).padStart(2, '0')

async function writeZip(directory, bytes, name) {
  await mkdir(directory, { recursive: true })
  for (let attempt = 1; ; attempt += 1) {
    const file = path.join(directory, name + (attempt === 1 ? '' : '-' + attempt) + '.zip')
    try {
      await writeFile(file, bytes, { flag: 'wx' })
      return file
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }
  }
}

const chunks = (values, size) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size))
const plural = (count, word) => count + ' ' + word + (count === 1 ? '' : 's')
const aliyot = (count) => count === 1 ? '1 aliyah' : count + ' aliyot'

async function alignAndDownload(needed, narratorId, options, kept) {
  const { client, stop } = await connectAligner(options)
  let stopping = false
  const interrupt = () => {
    if (stopping) {
      console.log('\nQuitting now. A recording already aligning finishes in the aligner.')
      void stop().finally(() => process.exit(130))
      return
    }
    stopping = true
    console.log('\nStopping after the current recording. Finished aliyot still go into the ZIP. Press Ctrl+C again to quit now.')
    client.post('/api/batch/control', { action: 'pause' }).catch((error) => console.error('Could not pause the aligner: ' + error.message))
  }
  process.on('SIGINT', interrupt)
  try {
    const library = await client.get('/api/batch/library')
    const sources = new Map(library.sources.map((source) => [source.id, source]))
    const selections = []
    const unavailable = []
    for (const entry of needed) {
      const source = sources.get(narratorId + '--' + entry.recording.id)
      if (source?.available && sameAudio(source.mediaIdentity, entry.recording.mediaIdentity)) selections.push({ sourceId: source.id })
      else unavailable.push(entry.recording.title)
    }
    if (unavailable.length) console.log('Skipping ' + plural(unavailable.length, 'recording') + ' the aligner cannot read yet: ' + unavailable.join(', '))
    const itemIds = []
    for (const group of chunks(selections, 25)) {
      const response = await client.post('/api/batch/queue', { selections: group, requestId: randomBytes(16).toString('hex'), force: false })
      itemIds.push(...response.itemIds)
    }
    const ours = (queue) => itemIds.map((id) => queue.items.find((item) => item.id === id)).filter(Boolean)
    let queue = await client.get('/api/batch/queue')
    // Aliyot already aligned before this run are reused rather than aligned again.
    const alreadyAligned = new Set(ours(queue).filter((item) => item.status === 'ready').map((item) => item.id))
    if (ours(queue).some((item) => item.status === 'queued')) {
      queue = await client.post('/api/batch/control', { action: 'start', minutes: null })
    }
    const reported = new Map()
    const started = Date.now()
    for (;;) {
      const items = ours(queue)
      items.forEach((item, index) => {
        const state = item.status === 'running' ? 'running' : item.status
        if (reported.get(item.id) === state) return
        reported.set(item.id, state)
        const label = '  [' + (index + 1) + '/' + items.length + '] ' + item.title
        if (state === 'running') console.log(label + ': aligning...')
        else if (state === 'ready' && (item.reused || alreadyAligned.has(item.id))) console.log(label + ': already aligned, reusing the saved result')
        else if (state === 'ready') console.log(label + ': done in ' + Math.round(item.elapsedSeconds ?? 0) + ' s')
        else if (state === 'failed' || state === 'interrupted') console.log(label + ': FAILED - ' + item.error)
        else if (state === 'resolved') console.log(label + ': already aligned by a later attempt')
      })
      const waiting = items.filter((item) => item.status === 'queued' || item.status === 'running')
      if (!waiting.length) break
      if (queue.paused && !queue.items.some((item) => item.status === 'running')) {
        if (stopping) break
        if (/time limit/i.test(queue.pauseReason ?? '')) {
          queue = await client.post('/api/batch/control', { action: 'start', minutes: null })
          continue
        }
        console.log('The aligner queue was paused from the aligner page; ' + plural(waiting.length, 'recording') + ' are still waiting there.')
        break
      }
      await delay(1500)
      queue = await client.get('/api/batch/queue')
    }

    const finished = ours(queue).filter((item) => (item.status === 'ready' || item.status === 'resolved') && item.resultId)
    const failed = ours(queue).filter((item) => item.status === 'failed' || item.status === 'interrupted')
    let zips = []
    if (finished.length) {
      const reviews = new Map((await client.get('/api/batch/reviews')).results.map((result) => [result.id, result]))
      const results = [...new Map(finished.map((item) => [item.resultId, reviews.get(item.resultId)])).values()].filter(Boolean)
      const name = 'tikkun-cues-' + stamp(new Date())
      const summary = []
      for (const [index, group] of chunks(results, 100).entries()) {
        const bytes = await client.zip(group.map((result) => ({ id: result.id, revision: result.revision })))
        zips.push(await writeZip(options.out, bytes, results.length > 100 ? name + '-part' + (index + 1) : name))
        const manifest = (await readZipEntries(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)))
          .find((entry) => entry.name === 'manifest.json')
        if (manifest) summary.push(...JSON.parse(new TextDecoder().decode(manifest.bytes)).recordings)
      }
      // Flag counts come from the cue files, so they match the orange rows in the admin panel.
      const titles = new Map(needed.map((entry) => [entry.recording.id, entry.recording.title]))
      const flags = summary.reduce((sum, row) => sum + row.pendingFlags, 0)
      console.log('\nCues ready for ' + aliyot(results.length) + ' after ' + Math.round((Date.now() - started) / 1000) + ' s, with ' + plural(flags, 'flagged word') + ' to check:')
      for (const row of summary) console.log('  ' + (titles.get(row.audioId) ?? row.audioId) + ': ' + plural(row.pendingFlags, 'flag'))
      for (const zip of zips) console.log('Saved ' + zip)
      console.log('Next: in the Reader at http://localhost:5176/reader/, open one of these aliyot, unlock admin, press play, and choose Import cues with this ZIP.')
    } else {
      console.log('\nNo aliyot finished, so no ZIP was saved.')
    }
    if (failed.length) {
      console.log(plural(failed.length, 'recording') + ' failed. Retry ' + (failed.length === 1 ? 'it' : 'them') + ' by running npm run cues:generate again, or open the aligner page for details.')
      process.exitCode = 1
    }
    if (kept.length) console.log('Still different from your folder (not replaced): ' + kept.join(', '))
  } finally {
    process.off('SIGINT', interrupt)
    await stop()
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const sourceRoot = await audioImportSource(path.join(alignerWork, 'audio-source.json'))
  if (!sourceRoot) throw new Error('Set your recordings folder in experiments/torah-audio-aligner/work/audio-source.json, or TIKKUN_AUDIO_SOURCE_ROOT.')
  const narratorId = process.env.TIKKUN_AUDIO_NARRATOR_ID || 'yoni-davidov'
  const narrator = audioNarrators.find((entry) => entry.id === narratorId)
  if (!narrator) throw new Error('Narrator ' + narratorId + ' is not registered in the audio manifest.')
  const targetAudioRoot = path.join(repoRoot, 'audio', narrator.id)
  const existingRecordings = Object.values(audioRecordingsByParsha).flat()

  console.log('Checking ' + path.resolve(sourceRoot) + ' for new or changed recordings...')
  const discovered = await discoverAudioCatalog(sourceRoot, narrator.id)
  const changed = findChangedAudio({ discovered, existingRecordings })
  const { replace, keep } = await reviewChangedAudio(changed, targetAudioRoot)
  const imported = await importAudioCatalog({
    sourceRoot, targetAudioRoot, targetFile: path.join(repoRoot, 'generated/audio-manifest.ts'),
    narrator, existingRecordings, discovered, replace, keep,
  })
  await writeFile(path.join(alignerWork, 'audio-import-report.json'), JSON.stringify({
    sourceRoot: path.resolve(sourceRoot), targetAudioRoot, added: imported.added, restored: imported.restored,
    replaced: imported.replaced, kept: [...keep], copiedBytes: imported.copiedBytes, totalRecordings: imported.recordings.length,
  }, null, 2) + '\n')
  if (imported.added.length) console.log('Added ' + plural(imported.added.length, 'new recording') + ': ' + imported.added.join(', '))
  if (imported.replaced.length) console.log('Replaced ' + plural(imported.replaced.length, 'recording') + ': ' + imported.replaced.join(', '))
  if (imported.restored.length) console.log('Restored missing project copies: ' + imported.restored.join(', '))
  if (imported.added.length || imported.replaced.length) {
    execFileSync(process.execPath, ['--import', 'tsx', path.join(repoRoot, 'scripts/generate-public-reading-manifest.mjs')], { cwd: repoRoot, stdio: 'inherit' })
  }
  const keptTitles = changed.filter((change) => keep.has(change.id)).map((change) => change.title)

  const needed = await findRecordingsNeedingCues(imported.recordings)
  if (!needed.length) {
    console.log('All ' + imported.recordings.length + ' recordings have cues for their current audio. Nothing to align.')
    if (keptTitles.length) console.log('Still different from your folder (not replaced): ' + keptTitles.join(', '))
    return
  }
  console.log('\n' + plural(needed.length, 'recording') + ' need cues:')
  for (const entry of needed) console.log('  ' + entry.recording.title + ': ' + entry.reason)
  await alignAndDownload(needed, narrator.id, options, keptTitles)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main()
  } catch (error) {
    console.error('\n' + (error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  }
}
