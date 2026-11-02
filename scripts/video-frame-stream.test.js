import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { execFile, spawn, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { createPngFrameWriter, frameEncoderArgs, startFrameEncoder } from './video-frame-stream.mjs'
import { outputValidationErrors } from './video-output-validation.mjs'

const exec = promisify(execFile)
const writers = []
const roots = []
const children = []
afterEach(async () => {
  writers.splice(0).forEach((writer) => writer.abort())
  vi.useRealTimers()
  await Promise.all(children.splice(0).map(async (child) => {
    if (child.exitCode !== null || child.signalCode !== null) return
    const closed = new Promise((resolve) => child.once('close', resolve))
    child.kill('SIGKILL')
    await closed
  }))
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function header(width = 64, height = 64) {
  const png = Buffer.alloc(33)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
  png.write('IHDR', 12)
  png.writeUInt32BE(width, 16)
  png.writeUInt32BE(height, 20)
  return png
}

function fakeWriter(count, write = (_chunk, _encoding, callback) => callback(), timeoutMs = 120000, onFrameWritten) {
  const child = new EventEmitter()
  child.stdin = new Writable({ highWaterMark: 1, write })
  child.stderr = new PassThrough()
  child.stdin.on('finish', () => child.emit('close', 0, null))
  const writer = createPngFrameWriter(child, { expectedFrameCount: count, timeoutMs, onFrameWritten })
  writers.push(writer)
  return { child, writer }
}

test('waits for each write before sending the next held frame; refuses parallel callers', async () => {
  const callbacks = []
  const progress = []
  const { writer } = fakeWriter(3, (_chunk, _encoding, callback) => callbacks.push(callback), 120000, count => progress.push(count))
  const writing = writer.writeFrame(header(), 3)
  expect(callbacks).toHaveLength(1)
  expect(progress).toEqual([])
  await expect(writer.writeFrame(header())).rejects.toThrow(/Concurrent/)
  callbacks[0]()
  await vi.waitFor(() => expect(callbacks).toHaveLength(2))
  expect(progress).toEqual([1])
  callbacks[1]()
  await vi.waitFor(() => expect(callbacks).toHaveLength(3))
  callbacks[2]()
  await writing
  expect(writer.framesWritten).toBe(3)
  expect(progress).toEqual([1, 2, 3])
  await expect(writer.finish()).resolves.toBe('')
})

const ffmpegAvailable = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0 &&
  spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).status === 0

async function fixtures() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tikkun-frame-stream-'))
  roots.push(root)
  for (const color of ['red', 'blue']) {
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=64x64`,
      '-frames:v', '1', '-threads:v', '1', path.join(root, `${color}.png`)])
  }
  const audioPath = path.join(root, 'audio.wav')
  await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.42', audioPath])
  return { root, audioPath, red: await readFile(path.join(root, 'red.png')), blue: await readFile(path.join(root, 'blue.png')) }
}

async function startRealEncoder(options) {
  return startFrameEncoder({
    fps: 30, crf: 18, preset: 'veryfast', expectedFrameCount: 13, ...options,
    spawnProcess: async (command, args, spawnOptions, _kind, observe) => {
      const child = spawn(command, args, spawnOptions)
      children.push(child)
      observe(child)
      return child
    },
    stopProcess: async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return
      const closed = new Promise((resolve) => child.once('close', resolve))
      child.kill('SIGKILL')
      await closed
    },
  })
}

async function frameHashes(file) {
  const { stdout } = await exec('ffmpeg', ['-v', 'error', '-threads', '2', '-i', file,
    '-map', '0:v:0', '-f', 'framemd5', '-'])
  return stdout.split('\n').filter((line) => line && !line.startsWith('#')).map((line) => line.split(',').at(-1).trim())
}

test.skipIf(!ffmpegAvailable).each(['held cue frames'])('real FFmpeg %s match file-based decoded pixels, timing and audio', async (mode) => {
  const { root, audioPath, red, blue } = await fixtures()
  const frames = mode === 'held cue frames'
    ? [...Array(7).fill(red), ...Array(6).fill(blue)]
    : Array.from({ length: 13 }, (_, i) => i % 2 ? blue : red)
  const outputPath = path.join(root, 'stream.mp4')
  const progress = []
  const encoder = await startRealEncoder({ audioPath, outputPath, onFrameWritten: count => progress.push(count) })
  if (mode === 'held cue frames') {
    await encoder.writer.writeFrame(red, 7)
    await encoder.writer.writeFrame(blue, 6)
  } else {
    for (const frame of frames) await encoder.writer.writeFrame(frame)
  }
  const log = await encoder.writer.finish()
  expect(encoder.writer.framesWritten).toBe(13)
  expect(progress).toEqual(Array.from({ length: 13 }, (_, index) => index + 1))
  // Streaming itself created no frame sequence files.
  expect((await readdir(root)).filter((name) => name.startsWith('frame-'))).toEqual([])
  for (const [i, frame] of frames.entries()) {
    await writeFile(path.join(root, `frame-${String(i).padStart(6, '0')}.png`), frame)
  }
  const fileOutput = path.join(root, 'files.mp4')
  await exec('ffmpeg', frameEncoderArgs({ fps: 30, crf: 18, preset: 'veryfast', audioPath,
    outputPath: fileOutput, framePattern: path.join(root, 'frame-%06d.png') }))
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', outputPath])
  expect(outputValidationErrors(JSON.parse(stdout), {
    width: 64, height: 64, fps: 30, frameCount: 13, duration: 0.42, renderMode: 'deterministic-frames',
  }, log)).toEqual([])
  await exec('ffmpeg', ['-v', 'error', '-xerror', '-threads', '2', '-i', outputPath, '-f', 'null', '-'])
  const hashes = await frameHashes(outputPath)
  expect(hashes).toHaveLength(13)
  expect(hashes).toEqual(await frameHashes(fileOutput))
}, 10000)

test.skipIf(!ffmpegAvailable)('real FFmpeg rejects a truncated PNG instead of finalizing a partial video', async () => {
  const { root, audioPath, red } = await fixtures()
  const encoder = await startRealEncoder({ audioPath, outputPath: path.join(root, 'bad.mp4'), expectedFrameCount: 1 })
  await expect((async () => {
    await encoder.writer.writeFrame(red.subarray(0, 33))
    await encoder.writer.finish()
  })()).rejects.toThrow()
}, 10000)
