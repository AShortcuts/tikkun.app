import { expect, test } from 'vitest'
import {
  createCueDraftPayload,
  parseCueDraftPayload,
} from './cue-draft.ts'
import { TOKENIZATION_VERSION } from './cue-schema.ts'
import type { ParshaAudioRecording, WordCue } from './types.ts'

const mediaIdentity = {
  algorithm: 'sha256' as const,
  digest: 'a'.repeat(64),
  byteLength: 123,
}
const recording: ParshaAudioRecording = {
  id: 'beresheet-1',
  narratorId: 'reader',
  reading: { kind: 'parsha', id: 'beresheet', name: 'Beresheet' },
  parshaSlug: 'beresheet',
  parshaName: 'Beresheet',
  aliyah: 1,
  title: 'Beresheet 1',
  playSrc: '/beresheet-1.mp3',
  downloadSrc: '/beresheet-1.mp3',
  format: 'mp3',
  status: 'available',
  mediaIdentity,
  notes: 'Source file: beresheet-1.mp3',
}
const tokenKeys = ['1:0:0:0', '1:0:0:1']

function cue(wordIndex: number, timeStart: number): WordCue {
  return {
    timeStart,
    pageNumber: 1,
    lineIndex: 0,
    fragmentIndex: 0,
    wordIndex,
  }
}

function validDraft() {
  return createCueDraftPayload({
    recording,
    tokenCount: tokenKeys.length,
    tokenKeys,
    tokenPointer: 1,
    updatedAt: 100,
    cues: [cue(0, 0), cue(1, 2)],
  })
}

test('creates and parses one recording-bound Cue Draft contract', () => {
  const draft = validDraft()

  expect(draft).toMatchObject({
    audioId: recording.id,
    audioFormat: recording.format,
    narratorId: recording.narratorId,
    readingId: recording.reading.id,
    aliyah: recording.aliyah,
    mediaIdentity,
    tokenCount: tokenKeys.length,
    tokenizationVersion: TOKENIZATION_VERSION,
  })
  expect(
    parseCueDraftPayload(draft, {
      recording,
      tokenCount: tokenKeys.length,
      tokenKeys,
    })
  ).toEqual(draft)
})

test.each([
  ['audio id', { audioId: 'other' }],
  ['format', { audioFormat: 'm4a' }],
  ['narrator', { narratorId: 'other' }],
  ['reading', { readingId: 'noach' }],
  ['aliyah', { aliyah: 2 }],
  ['media identity', {
    mediaIdentity: { ...mediaIdentity, digest: 'b'.repeat(64) },
  }],
  ['token count', { tokenCount: 3 }],
  ['tokenization version', { tokenizationVersion: 'v1' }],
])('rejects a draft with stale %s', (_label, change) => {
  expect(
    parseCueDraftPayload(
      { ...validDraft(), ...change },
      { recording, tokenCount: tokenKeys.length, tokenKeys }
    )
  ).toBeNull()
})

test('rejects malformed, duplicate, backward, and non-prefix cue positions', () => {
  const expectation = { recording, tokenCount: tokenKeys.length, tokenKeys }
  expect(
    parseCueDraftPayload(
      { ...validDraft(), cues: [{ nonsense: true }] },
      expectation
    )
  ).toBeNull()
  expect(
    parseCueDraftPayload(
      { ...validDraft(), cues: [cue(0, 0), cue(0, 2)] },
      expectation
    )
  ).toBeNull()
  expect(
    parseCueDraftPayload(
      { ...validDraft(), cues: [cue(1, 0), cue(0, 2)] },
      expectation
    )
  ).toBeNull()
  expect(
    parseCueDraftPayload(
      { ...validDraft(), cues: [cue(1, 0)] },
      expectation
    )
  ).toBeNull()
})

test('rejects an impossible future update timestamp', () => {
  expect(
    parseCueDraftPayload(
      { ...validDraft(), updatedAt: 1_000_000 },
      {
        recording,
        tokenCount: tokenKeys.length,
        tokenKeys,
        now: 100,
      }
    )
  ).toBeNull()
})

test('uses legacy audioVersion only when recording has no media identity', () => {
  const legacyRecording = { ...recording, mediaIdentity: undefined }
  const draft = createCueDraftPayload({
    recording: legacyRecording,
    tokenCount: tokenKeys.length,
    tokenKeys,
    tokenPointer: 0,
    updatedAt: 100,
    cues: [cue(0, 0)],
  })

  expect(draft.audioVersion).toBe(recording.notes)
  expect('mediaIdentity' in draft).toBe(false)
  expect(
    parseCueDraftPayload(draft, {
      recording: { ...legacyRecording, notes: 'Source file: replacement.mp3' },
      tokenCount: tokenKeys.length,
      tokenKeys,
    })
  ).toBeNull()
})
