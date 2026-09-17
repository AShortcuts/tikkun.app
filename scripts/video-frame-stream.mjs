import { Buffer } from 'node:buffer'

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

export function pngDimensions(png) {
  if (!Buffer.isBuffer(png) || png.length < 33 ||
      !png.subarray(0, 8).equals(pngSignature) || png.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Screenshot is not a PNG with a complete image header')
  }
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  if (!width || !height) throw new Error('Screenshot has invalid dimensions')
  return { width, height }
}

export function frameEncoderArgs({ fps, preset, crf, audioPath, outputPath, framePattern, concatPath, frameCount }) {
  if (concatPath && (!Number.isSafeInteger(frameCount) || frameCount < 1)) {
    throw new Error('Concat encoding requires an exact positive frame count')
  }
  const input = concatPath
    ? ['-f', 'concat', '-safe', '0', '-i', concatPath]
    : framePattern
    ? ['-framerate', String(fps), '-i', framePattern]
    : ['-f', 'image2pipe', '-c:v', 'png', '-framerate', String(fps),
        '-probesize', '32', '-analyzeduration', '0', '-i', 'pipe:0']
  return [
    '-y', '-xerror', '-threads', '2', ...input,
    '-i', audioPath,
    '-map', '0:v:0', '-map', '1:a:0',
    ...(concatPath ? ['-vf', `fps=${fps},trim=end_frame=${frameCount}`] : []),
    '-c:v', 'libx264', '-threads:v', '2', '-preset', preset,
    '-crf', String(crf), '-pix_fmt', 'yuv420p',
    '-fps_mode', 'passthrough',
    '-c:a', 'aac', '-b:a', '192k', outputPath,
  ]
}

// Attach before process registration can yield, so fast exits and EPIPE cannot
// escape observation. Exactly one write is outstanding, regardless of PNG size.
export function createPngFrameWriter(child, { expectedFrameCount, timeoutMs = 120000, onFrameWritten = () => {} }) {
  if (!Number.isSafeInteger(expectedFrameCount) || expectedFrameCount < 1) {
    throw new Error('Expected frame count must be a positive integer')
  }
  let failure = null
  let pendingReject = null
  let ending = false
  let closed = false
  let writing = false
  let framesWritten = 0
  let dimensions = null
  let stderr = ''
  let resolveDone
  let rejectDone
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve
    rejectDone = reject
  })
  // Preserve early failures for check()/finish() without an unhandled rejection
  // while the browser is still capturing the next frame.
  done.catch(() => {})

  const fail = (error) => {
    failure ??= error instanceof Error ? error : new Error(String(error))
    pendingReject?.(failure)
    rejectDone(failure)
  }
  const check = () => {
    if (failure) throw failure
  }
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-65536)
    if (/\b(?:drop|dup)=\s*[1-9]\d*|non-monoton(?:ous|ic)|\berror\b/i.test(stderr)) {
      fail(new Error(`FFmpeg reported a frame or encoding error: ${stderr}`))
    }
  })
  child.on('error', fail)
  child.stdin.on('error', fail)
  child.stdin.on('close', () => {
    if (!ending) fail(new Error('FFmpeg input closed before all frames were sent'))
  })
  child.on('close', (code, signal) => {
    closed = true
    if (code !== 0 || !ending || framesWritten !== expectedFrameCount) {
      fail(new Error(`FFmpeg stopped (${signal ?? code}); sent ${framesWritten}/${expectedFrameCount} frames. ${stderr}`))
    } else if (!failure) resolveDone(stderr)
  })

  const writeBuffer = (png) => new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer)
      pendingReject = null
      if (error) reject(error)
      else resolve()
    }
    const timer = setTimeout(() => fail(new Error('Timed out waiting for FFmpeg to accept a frame')), timeoutMs)
    pendingReject = finish
    if (!child.stdin.writable) {
      fail(new Error('FFmpeg input is no longer writable'))
      return
    }
    try {
      child.stdin.write(png, (error) => {
        if (error) fail(error)
        else finish(failure)
      })
    } catch (error) {
      fail(error)
    }
  })

  return {
    check,
    get framesWritten() { return framesWritten },
    async writeFrame(png, repeat = 1) {
      check()
      if (ending || closed) throw new Error('Cannot write frames after ending FFmpeg input')
      if (writing) throw new Error('Concurrent frame writes are not allowed')
      if (!Number.isSafeInteger(repeat) || repeat < 1 || framesWritten + repeat > expectedFrameCount) {
        throw new Error(`Frame write would exceed the planned ${expectedFrameCount} frames or has an invalid repeat count`)
      }
      const size = pngDimensions(png)
      if (dimensions && (size.width !== dimensions.width || size.height !== dimensions.height)) {
        throw new Error(`Screenshot dimensions changed from ${dimensions.width}x${dimensions.height} to ${size.width}x${size.height}`)
      }
      dimensions ??= size
      writing = true
      try {
        for (let index = 0; index < repeat; index++) {
          check()
          await writeBuffer(png)
          framesWritten += 1
          onFrameWritten(framesWritten)
        }
      } finally {
        writing = false
      }
    },
    async finish() {
      check()
      if (writing || ending) throw new Error('Cannot finish during a write or finish twice')
      if (framesWritten !== expectedFrameCount) {
        throw new Error(`Incomplete frame stream: ${framesWritten}/${expectedFrameCount}`)
      }
      ending = true
      const timer = setTimeout(() => fail(new Error('Timed out waiting for FFmpeg to finish encoding')), timeoutMs)
      try {
        child.stdin.end((error) => { if (error) fail(error) })
        return await done
      } finally {
        clearTimeout(timer)
      }
    },
    abort() {
      if (!closed) fail(new Error('Frame stream cancelled'))
      child.stdin.destroy()
    },
  }
}

export async function startFrameEncoder({ spawnProcess, stopProcess, expectedFrameCount, onFrameWritten, ...options }) {
  let writer
  let child
  try {
    child = await spawnProcess('ffmpeg', frameEncoderArgs(options), {
      stdio: ['pipe', 'ignore', 'pipe'],
    }, 'ffmpeg', (process) => {
      writer = createPngFrameWriter(process, { expectedFrameCount, onFrameWritten })
    })
    writer.check()
    return { child, writer }
  } catch (error) {
    writer?.abort()
    if (child) await stopProcess(child)
    throw error
  }
}
