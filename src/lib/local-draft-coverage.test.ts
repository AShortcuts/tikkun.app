import { afterEach, expect, test, vi } from 'vitest'
import { TOKENIZATION_VERSION } from '../../app/audio/cue-schema.ts'
import type { ParshaAudioRecording, WordCue } from '../../app/audio/types.ts'
import { audioRecordings } from '../../app/data/audio-catalog.ts'
import {
  getLocalCueDraftStatus,
  parseLocalCueDraftStatus,
} from './local-draft-coverage.ts'

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
  mediaIdentity: {
    algorithm: 'sha256',
    digest: 'a'.repeat(64),
    byteLength: 123,
  },
}

function cue(index: number): WordCue {
  return {
    timeStart: index,
    pageNumber: 1,
    lineIndex: 0,
    fragmentIndex: 0,
    wordIndex: index,
  }
}

function draft(cueCount: number, tokenCount = 4) {
  return JSON.stringify({
    audioId: recording.id,
    audioFormat: recording.format,
    narratorId: recording.narratorId,
    readingId: recording.reading.id,
    aliyah: recording.aliyah,
    mediaIdentity: recording.mediaIdentity,
    tokenCount,
    tokenPointer: cueCount ? cueCount - 1 : -1,
    tokenizationVersion: TOKENIZATION_VERSION,
    updatedAt: 100,
    cues: Array.from({ length: cueCount }, (_, index) => cue(index)),
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('classifies only recording-bound local Cue Drafts', () => {
  expect(parseLocalCueDraftStatus(draft(2), recording, 4)).toBe('draft')
  expect(parseLocalCueDraftStatus(draft(4), recording, 4)).toBe('draft')
})

test('never claims public completion without the canonical token sequence', () => {
  const wrongPositions = JSON.stringify({
    ...JSON.parse(draft(4)),
    cues: Array.from({ length: 4 }, (_, index) => ({
      ...cue(index),
      pageNumber: 99,
    })),
  })
  expect(parseLocalCueDraftStatus(wrongPositions, recording, 4)).toBe('draft')
})

test('ignores empty, stale, mismatched, malformed, and overfull drafts', () => {
  expect(parseLocalCueDraftStatus(draft(0), recording, 4)).toBeNull()
  expect(parseLocalCueDraftStatus(draft(2), recording, 3)).toBeNull()
  expect(
    parseLocalCueDraftStatus(
      draft(2).replace(TOKENIZATION_VERSION, 'v1'),
      recording,
      4
    )
  ).toBeNull()
  expect(
    parseLocalCueDraftStatus(
      draft(2),
      { ...recording, narratorId: 'other' },
      4
    )
  ).toBeNull()
  expect(
    parseLocalCueDraftStatus(
      JSON.stringify({ ...JSON.parse(draft(2)), cues: [{ nonsense: true }] }),
      recording,
      4
    )
  ).toBeNull()
  expect(parseLocalCueDraftStatus(draft(5), recording, 4)).toBeNull()
})

test('never mutates a large incompatible authoring draft while reading coverage', () => {
  const currentRecording = audioRecordings[0]
  if (!currentRecording) throw new Error('Expected at least one audio recording')
  const sourceKey = `tikkun-admin-draft:${currentRecording.id}`
  const rawLegacyDraft = JSON.stringify({
    audioId: currentRecording.id,
    tokenCount: 2,
    cues: [],
    authorNotes: 'x'.repeat(40_000),
  })
  const values = new Map([[sourceKey, rawLegacyDraft]])
  const localStorage = {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: vi.fn((key: string) => values.delete(key)),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  } satisfies Storage
  vi.stubGlobal('window', { localStorage })

  expect(getLocalCueDraftStatus(currentRecording.id, 2)).toBeNull()
  expect(localStorage.getItem(sourceKey)).toBe(rawLegacyDraft)
  expect(localStorage.removeItem).not.toHaveBeenCalled()
  expect(localStorage.setItem).not.toHaveBeenCalled()
  expect(localStorage.getItem(`${sourceKey}:quarantine`)).toBeNull()
})
