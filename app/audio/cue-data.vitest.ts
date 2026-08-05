import { expect, test, vi } from 'vitest'
import type { CueExportPayload, ParshaAudioRecording } from './types.ts'
import { CueDataResolver } from './cue-data.ts'

const path = '../../audio-cues/reader/test/1.json'
const recording: ParshaAudioRecording = {
  id: 'test-1',
  narratorId: 'reader',
  reading: { kind: 'parsha', id: 'test', name: 'Test' },
  parshaSlug: 'test',
  parshaName: 'Test',
  aliyah: 1,
  title: 'Test 1',
  playSrc: '/test.m4a',
  downloadSrc: '/test.m4a',
  format: 'm4a',
  status: 'available',
}
const payload: CueExportPayload = {
  audioId: recording.id,
  audioFormat: recording.format,
  narratorId: recording.narratorId,
  readingId: recording.reading.id,
  aliyah: recording.aliyah,
  tokenCount: 1,
  cueCount: 1,
  tokenizationVersion: 'v2',
  savedAt: '2026-08-03T12:00:00.000Z',
  cues: [{
    cueNumber: 1,
    timeStart: 0,
    pageNumber: 1,
    lineIndex: 0,
    fragmentIndex: 0,
    wordIndex: 0,
  }],
}

test('retains invalid Cue Data as one inspectable result until explicit retry', async () => {
  const load = vi.fn(async () => ({
    audioId: recording.id,
    tokenCount: 1,
    tokenPointer: 0,
    tokenizationVersion: 'v2',
    updatedAt: Date.now(),
    cues: [{
      timeStart: 0,
      pageNumber: 1,
      lineIndex: 0,
      fragmentIndex: 0,
      wordIndex: 0,
    }],
  }))
  const resolver = new CueDataResolver({ [path]: load })

  const first = await resolver.resolve(recording)
  const second = await resolver.resolve(recording)

  expect(first.status).toBe('invalid')
  expect(second.status).toBe('invalid')
  expect(load).toHaveBeenCalledTimes(1)
  if (first.status !== 'invalid') throw new Error('Expected invalid Cue Data')
  expect(first.problem.details.join(' ')).toContain('local Cue Draft')
  expect(first.problem.details.join(' ')).toContain('audioFormat')
})

test('re-evaluates a retained Cue Data failure only when retry is requested', async () => {
  const load = vi.fn()
    .mockResolvedValueOnce({ ...payload, cueCount: 2 })
    .mockResolvedValueOnce(payload)
  const resolver = new CueDataResolver({ [path]: load })

  await expect(resolver.resolve(recording)).resolves.toMatchObject({
    status: 'invalid',
  })
  await expect(resolver.retry(recording)).resolves.toMatchObject({
    status: 'ready',
    payload: { audioId: recording.id },
  })
  expect(load).toHaveBeenCalledTimes(2)
})

test('retries transient load failures and reports recording mismatches as data states', async () => {
  const failedLoad = vi.fn()
    .mockRejectedValueOnce(new Error('chunk unavailable'))
    .mockResolvedValueOnce(payload)
  const failedResolver = new CueDataResolver({ [path]: failedLoad })

  await expect(failedResolver.resolve(recording)).resolves.toMatchObject({
    status: 'unavailable',
    problem: {
      code: 'load-failed',
      details: ['chunk unavailable'],
    },
  })
  await expect(failedResolver.resolve(recording)).resolves.toMatchObject({
    status: 'ready',
    payload: { audioId: recording.id },
  })
  expect(failedLoad).toHaveBeenCalledTimes(2)

  const mismatchResolver = new CueDataResolver({
    [path]: async () => ({ ...payload, audioId: 'different-recording' }),
  })
  await expect(mismatchResolver.resolve(recording)).resolves.toMatchObject({
    status: 'invalid',
    problem: {
      code: 'recording-mismatch',
      details: [expect.stringContaining('audioId')],
    },
  })
})
