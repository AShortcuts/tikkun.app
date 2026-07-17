import { expect, test } from 'vitest'
import type { ParshaAudioRecording } from './types.ts'
import {
  audioMediaIdentitiesEqual,
  cuePayloadMatchesRecording,
  isPublishableCueSequence,
  parseAudioMediaIdentity,
  parseCueExportPayload,
  parseDraftWordCues,
  parsePublishedWordCues,
  parseWordCue,
  parseWordCues,
} from './cue-validation.ts'

const validCue = {
  cueNumber: 1,
  timeStart: 2,
  timeEnd: 3,
  pageNumber: 4,
  lineIndex: 0,
  fragmentIndex: 1,
  wordIndex: 2,
}

const recording: ParshaAudioRecording = {
  id: 'test-1',
  narratorId: 'yoni-davidov',
  reading: { kind: 'parsha', id: 'test', name: 'Test' },
  parshaSlug: 'test',
  parshaName: 'Test',
  aliyah: 1,
  title: 'Test 1',
  playSrc: '/test.mp3',
  downloadSrc: '/test.mp3',
  format: 'mp3',
  status: 'available',
}

const validPayload = {
  audioId: recording.id,
  audioFormat: recording.format,
  narratorId: recording.narratorId,
  readingId: recording.reading.id,
  aliyah: recording.aliyah,
  tokenCount: 1,
  cueCount: 1,
  tokenizationVersion: 'v2',
  savedAt: '2026-07-16T00:00:00.000Z',
  cues: [validCue],
}

test('parses structurally valid word cues without changing their order', () => {
  const laterCue = { ...validCue, cueNumber: 2, timeStart: 1, timeEnd: 1.5 }
  expect(parseWordCues([validCue, laterCue])).toEqual([validCue, laterCue])
  expect(parseDraftWordCues([validCue, laterCue])).toEqual([validCue, laterCue])
  expect(parsePublishedWordCues([validCue, laterCue])).toBeNull()
})

test.each([
  { ...validCue, timeStart: null },
  { ...validCue, pageNumber: '4' },
  { ...validCue, lineIndex: -1 },
  { ...validCue, timeEnd: 1 },
  { nonsense: true },
])('rejects malformed cues atomically', (cue) => {
  expect(parseWordCue(cue)).toBeNull()
  expect(parseWordCues([validCue, cue])).toBeNull()
})

test('validates cue payload counts, metadata, and recording identity', () => {
  const payload = parseCueExportPayload(validPayload)
  expect(payload).not.toBeNull()
  expect(cuePayloadMatchesRecording(payload!, recording)).toBe(true)
  expect(cuePayloadMatchesRecording(payload!, { ...recording, id: 'other' })).toBe(false)
  expect(parseCueExportPayload({ ...validPayload, cueCount: 2 })).toBeNull()
  expect(parseCueExportPayload({ ...validPayload, savedAt: 'not-a-date' })).toBeNull()
  expect(parseCueExportPayload({ ...validPayload, savedAt: '2026-07-16' })).toBeNull()
  expect(parseCueExportPayload({ ...validPayload, audioId: ' test-1 ' })).toBeNull()
})

test.each([
  { name: 'non-sequential cue number', cues: [{ ...validCue, cueNumber: 2 }] },
  {
    name: 'duplicate timestamp',
    cues: [validCue, { ...validCue, cueNumber: 2, timeStart: 2 }],
  },
  {
    name: 'duplicate token position',
    cues: [validCue, { ...validCue, cueNumber: 2, timeStart: 4 }],
  },
  {
    name: 'backward token position',
    cues: [validCue, {
      ...validCue,
      cueNumber: 2,
      timeStart: 4,
      wordIndex: 1,
    }],
  },
  {
    name: 'overlapping explicit cue ending',
    cues: [
      { ...validCue, timeEnd: 5 },
      { ...validCue, cueNumber: 2, timeStart: 4, timeEnd: 6, wordIndex: 3 },
    ],
  },
])('rejects Cue Data with $name', ({ cues }) => {
  expect(isPublishableCueSequence(cues)).toBe(false)
  expect(parseCueExportPayload({
    ...validPayload,
    tokenCount: cues.length,
    cueCount: cues.length,
    cues,
  })).toBeNull()
})

test('accepts strictly increasing, uniquely positioned published cues', () => {
  const cues = [
    validCue,
    {
      ...validCue,
      cueNumber: 2,
      timeStart: 4,
      timeEnd: 5,
      wordIndex: 3,
    },
  ]
  expect(isPublishableCueSequence(cues)).toBe(true)
  expect(parsePublishedWordCues(cues)).toEqual(cues)
})

test('validates durable media identity and rejects explicit recording mismatches', () => {
  const mediaIdentity = {
    algorithm: 'sha256' as const,
    digest: 'a'.repeat(64),
    byteLength: 123,
  }
  expect(parseAudioMediaIdentity(mediaIdentity)).toEqual(mediaIdentity)
  expect(parseAudioMediaIdentity({ ...mediaIdentity, digest: 'not-a-digest' })).toBeNull()
  expect(parseAudioMediaIdentity({ ...mediaIdentity, byteLength: 0 })).toBeNull()
  expect(audioMediaIdentitiesEqual(mediaIdentity, { ...mediaIdentity })).toBe(true)

  const payload = parseCueExportPayload({ ...validPayload, mediaIdentity })!
  expect(cuePayloadMatchesRecording(payload, { ...recording, mediaIdentity })).toBe(true)
  expect(cuePayloadMatchesRecording(payload, {
    ...recording,
    mediaIdentity: { ...mediaIdentity, digest: 'b'.repeat(64) },
  })).toBe(false)
  expect(cuePayloadMatchesRecording(payload, recording)).toBe(false)

  const legacyPayload = parseCueExportPayload(validPayload)!
  expect(cuePayloadMatchesRecording(legacyPayload, { ...recording, mediaIdentity })).toBe(true)
})

test('uses legacy audioVersion metadata until a durable identity is published', () => {
  const payload = parseCueExportPayload({
    ...validPayload,
    audioVersion: 'Source file: test.mp3',
  })!
  expect(cuePayloadMatchesRecording(payload, {
    ...recording,
    notes: 'Source file: test.mp3',
  })).toBe(true)
  expect(cuePayloadMatchesRecording(payload, {
    ...recording,
    notes: 'Source file: replacement.mp3',
  })).toBe(false)
})

test('rejects an invalid published recording issue atomically', () => {
  const issue = {
    id: 'issue-1',
    audioId: validPayload.audioId,
    tokenKey: '4:0:1:2',
    timeStart: 3,
    timeEnd: 2,
    kind: 'hesitation',
    visibility: 'authoringOnly',
    severity: 'low',
    createdAt: 1,
    tokenizationVersion: validPayload.tokenizationVersion,
  }
  expect(parseCueExportPayload({ ...validPayload, issues: [issue] })).toBeNull()
})
