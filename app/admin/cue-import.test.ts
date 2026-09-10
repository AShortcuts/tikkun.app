import { expect, test } from 'vitest'
import { parseCueImport } from './cue-import.ts'
import { createCueDraftEditor } from './cue-draft-editor.ts'
import { createCueDraftPayload, parseCueDraftPayload } from '../audio/cue-draft.ts'
import { markCueReviewed, nextFlaggedCueIndex, pendingCueFlags } from '../audio/cue-review.ts'
import { parseCueExportPayload, parseWordCue } from '../audio/cue-validation.ts'
import type { CueExportPayload, ParshaAudioRecording } from '../audio/types.ts'

const recording: ParshaAudioRecording = {
  id: 'test-1', narratorId: 'test', reading: { kind: 'parsha', id: 'test', name: 'Test' },
  parshaSlug: 'test', parshaName: 'Test', aliyah: 1, title: 'Test', format: 'mp3',
  playSrc: '/test.mp3', downloadSrc: '/test.mp3', status: 'available',
  mediaIdentity: { algorithm: 'sha256', digest: 'a'.repeat(64), byteLength: 123 },
}
const tokenKeys = ['1:0:0:0', '1:0:0:1', '1:0:0:2']
const payload = (): CueExportPayload => ({
  audioId: recording.id, narratorId: 'test', readingId: 'test', aliyah: 1, audioFormat: 'mp3',
  tokenCount: 3, cueCount: 3, tokenizationVersion: 'v2', mediaIdentity: recording.mediaIdentity,
  cues: tokenKeys.map((_, index) => ({
    cueNumber: index + 1, timeStart: index, pageNumber: 1, lineIndex: 0, fragmentIndex: 0, wordIndex: index,
    review: { source: 'torah-audio-aligner', status: 'pending', flags: index === 1 ? [] : [{
      id: `test:${index}`, kind: 'unclear_audio', status: 'pending', message: 'Listen and check the onset.', sourceTime: index + 0.2,
    }] },
  })),
})

test('imports generated cues and keeps flags through edits, draft reload and cue export', () => {
  const original = payload()
  const cues = parseCueImport(JSON.parse(JSON.stringify(original)), recording, tokenKeys)
  const editor = createCueDraftEditor()
  editor.bind({ tokenKeys, sourceCues: cues, origin: 'published', savedAt: null })
  expect(Object.isFrozen(editor.snapshot().cues[0].review?.flags[0])).toBe(true)
  editor.select(2)
  editor.nudge({ activeTokenIndex: 2, deltaSeconds: .05, duration: 5 })
  expect(editor.snapshot().cues[2].review).toEqual(original.cues[2].review)
  editor.startRecording({ tokenPointer: 2 })
  editor.record({ activeTokenIndex: 1, timeStart: 2.1 })
  editor.stopRecording()
  expect(pendingCueFlags(editor.snapshot().cues[2])).toHaveLength(1)
  const now = Date.now()
  const draft = createCueDraftPayload({ recording, tokenCount: 3, tokenKeys, tokenPointer: 2,
    updatedAt: now, cues: [...editor.snapshot().cues] })
  const reloaded = parseCueDraftPayload(JSON.parse(JSON.stringify(draft)), { recording, tokenCount: 3, tokenKeys, now })!
  const exported = parseCueExportPayload({ ...original,
    cues: reloaded.cues.map((cue, index) => ({ ...cue, cueNumber: index + 1 })) })!
  expect(exported.cues[2].review).toEqual(original.cues[2].review)
  expect(exported.cues[2].timeStart).toBe(2.1)
})

test('reviewing a flag is a dirty metadata edit and retains the flag history', () => {
  const cues = payload().cues
  const editor = createCueDraftEditor()
  editor.bind({ tokenKeys, sourceCues: cues, origin: 'published', savedAt: null })
  editor.replaceCues(cues.map(markCueReviewed))
  expect(editor.snapshot().dirty).toBe(true)
  expect(pendingCueFlags(editor.snapshot().cues[0])).toHaveLength(0)
  expect(editor.snapshot().cues[0].review?.flags[0]).toMatchObject({ id: 'test:0', status: 'reviewed', message: 'Listen and check the onset.' })
  expect(cues[0].review?.flags[0].status).toBe('pending')
})

test('next flagged wraps and excludes resolved flags', () => {
  const cues = payload().cues
  expect(nextFlaggedCueIndex(cues, -1)).toBe(0)
  expect(nextFlaggedCueIndex(cues, 0)).toBe(2)
  expect(nextFlaggedCueIndex(cues, 2)).toBe(0)
  expect(nextFlaggedCueIndex(cues.map(markCueReviewed), 0)).toBe(-1)
  expect(nextFlaggedCueIndex([], -1)).toBe(-1)
})

test('rejects wrong media, missing identity, wrong text and damaged review flags', () => {
  expect(() => parseCueImport({ ...payload(), audioId: 'other' }, recording, tokenKeys)).toThrow('different audio')
  expect(() => parseCueImport({ ...payload(), mediaIdentity: undefined }, recording, tokenKeys)).toThrow('different audio')
  expect(() => parseCueImport(payload(), recording, ['2:0:0:0', ...tokenKeys.slice(1)])).toThrow('aliyah text')
  for (const review of [null, { source: 'unknown', status: 'pending', flags: [] },
    { source: 'torah-audio-aligner', status: 'reviewed', flags: payload().cues[0].review!.flags },
    { source: 'torah-audio-aligner', status: 'pending', flags: [{ ...payload().cues[0].review!.flags[0], sourceTime: NaN }] }]) {
    expect(parseWordCue({ ...payload().cues[0], review })).toBeNull()
  }
})

test('legacy cue files still parse without review metadata', () => {
  const legacy = payload()
  for (const cue of legacy.cues) delete cue.review
  expect(parseCueExportPayload(legacy)).toEqual(legacy)
})
