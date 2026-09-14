import assert from 'node:assert/strict'
import { open } from 'node:fs/promises'
import { resolve } from 'node:path'
import { audioRecordings } from '../generated/audio-manifest.ts'
import { rangeAudioRecordings } from '../app/data/range-audio-manifest.ts'
import { appendRecordingMediaVersion } from '../app/data/deployment-media.ts'

const origin = process.argv[2]
if (!origin || !/^https?:\/\//.test(origin)) {
  throw new Error('Usage: npm run audio:verify-delivery -- <origin> [recording-path]')
}

const recordings = [...new Map([...audioRecordings, ...rangeAudioRecordings]
  .filter((recording) => recording.status === 'available' &&
    (!process.argv[3] || recording.playSrc === process.argv[3]))
  .map((recording) => [recording.playSrc, recording])).values()]
assert(recordings.length > 0, 'No matching published recordings')
let checked = 0
let transferred = 0

async function verify(recording: typeof recordings[number]) {
  const identity = recording.mediaIdentity
  assert(identity, `Missing media identity: ${recording.playSrc}`)
  const url = new URL(appendRecordingMediaVersion(recording.playSrc, identity.digest), origin)
  const file = await open(resolve('site', `.${recording.playSrc}`))
  try {
    assert.equal((await file.stat()).size, identity.byteLength, `Local size: ${recording.playSrc}`)
    const size = identity.byteLength
    const length = Math.min(1024, size)
    const middle = Math.floor((size - length) / 2)
    for (const [range, start] of [
      [`bytes=0-${length - 1}`, 0],
      [`bytes=${middle}-${middle + length - 1}`, middle],
      [`bytes=-${length}`, size - length],
    ] as const) {
      const response = await fetch(url, {
        headers: { Range: range, 'Accept-Encoding': 'identity' },
        signal: AbortSignal.timeout(20_000),
      })
      try {
        assert.equal(response.status, 206, `${url.pathname} ${range}: expected HTTP 206`)
        assert.equal(response.headers.get('accept-ranges'), 'bytes')
        assert.equal(response.headers.get('content-range'), `bytes ${start}-${start + length - 1}/${size}`)
        assert.equal(response.headers.get('content-length'), String(length))
        assert.match(response.headers.get('content-type') ?? '', /^audio\//)
        const received = Buffer.from(await response.arrayBuffer())
        const expected = Buffer.alloc(length)
        assert.equal((await file.read(expected, 0, length, start)).bytesRead, length)
        assert.deepEqual(received, expected, `${url.pathname} ${range}: wrong audio bytes`)
        transferred += received.length
      } finally {
        if (!response.bodyUsed) await response.body?.cancel()
      }
    }
    const invalid = await fetch(url, {
      headers: { Range: `bytes=${size}-` }, signal: AbortSignal.timeout(20_000),
    })
    try {
      assert.equal(invalid.status, 416, `${url.pathname}: out-of-bounds range`)
      assert.equal(invalid.headers.get('content-range'), `bytes */${size}`)
      assert.equal((await invalid.arrayBuffer()).byteLength, 0)
    } finally {
      if (!invalid.bodyUsed) await invalid.body?.cancel()
    }
    checked++
  } finally {
    await file.close()
  }
}

// Bound simultaneous streams; fail before starting another batch.
for (let index = 0; index < recordings.length; index += 4) {
  const results = await Promise.allSettled(recordings.slice(index, index + 4).map(verify))
  const failure = results.find((result) => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
  if (checked % 40 === 0) console.log(`Verified ${checked}/${recordings.length} recordings`)
}
console.log(`PASS: ${checked} recordings; beginning/middle/suffix bytes match local audio; invalid ranges rejected; ${transferred} audio bytes received.`)
