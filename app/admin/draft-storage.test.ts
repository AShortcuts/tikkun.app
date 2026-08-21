import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { TOKENIZATION_VERSION } from '../audio/cue-schema.ts'
import type { ParshaAudioRecording } from '../audio/types.ts'
import {
  AdminDraftConflictError,
  AdminDraftStorageError,
  getAdminDraftStorageKey,
  loadAdminDraft,
  loadAdminDraftResult,
  readVerifiedAdminDraftSummary,
  saveAdminDraftPayload,
  type AdminDraftPayload,
  type AdminDraftRevision,
} from './draft-storage.ts'

const audioId = 'test-audio'
const mediaIdentity = {
  algorithm: 'sha256' as const,
  digest: 'a'.repeat(64),
  byteLength: 123,
}
const recording: ParshaAudioRecording = {
  id: audioId,
  narratorId: 'test-narrator',
  reading: { kind: 'parsha', id: 'test-reading', name: 'Test Reading' },
  parshaSlug: 'test-reading',
  parshaName: 'Test Reading',
  aliyah: 1,
  title: 'Test Reading 1',
  playSrc: '/test-audio.mp3',
  downloadSrc: '/test-audio.mp3',
  format: 'mp3',
  status: 'available',
  mediaIdentity,
}
const tokenKeys = ['1:0:0:0', '1:0:0:1'] as const
const cue = (timeStart: number, wordIndex: number) => ({
  timeStart,
  pageNumber: 1,
  lineIndex: 0,
  fragmentIndex: 0,
  wordIndex,
})
const validDraft = (updatedAt = 100): AdminDraftPayload => ({
  audioId,
  audioFormat: recording.format,
  narratorId: recording.narratorId,
  readingId: recording.reading.id,
  aliyah: recording.aliyah,
  mediaIdentity,
  tokenCount: 2,
  tokenPointer: 1,
  tokenizationVersion: TOKENIZATION_VERSION,
  updatedAt,
  cues: [cue(0, 0)],
})
const writeRequest = (
  expectedRevision: AdminDraftRevision = null,
  writerToken = 'test-writer'
) => ({ writerToken, expectedRevision })

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key)
    },
    setItem: (key, value) => {
      store.set(key, value)
    },
  }
}

function createTestLockManager() {
  let tail = Promise.resolve<unknown>(undefined)
  return {
    request(
      _name: string,
      _options: LockOptions,
      callback: () => unknown
    ) {
      const result = tail.then(callback)
      tail = result.then(
        () => undefined,
        () => undefined
      )
      return result
    },
  }
}

beforeEach(() => {
  const localStorage = createMemoryStorage()
  vi.stubGlobal('window', { localStorage })
  vi.stubGlobal('navigator', { locks: createTestLockManager() })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('round-trips the current draft as direct JSON', async () => {
  const draft = validDraft()
  const written = await saveAdminDraftPayload(
    draft,
    recording,
    tokenKeys,
    writeRequest()
  )

  const storedRaw = window.localStorage.getItem(getAdminDraftStorageKey(audioId))
  expect(storedRaw).toBe(JSON.stringify(draft))
  expect(written.revision).toBe(storedRaw)
  expect(loadAdminDraft(recording, tokenKeys)).toEqual(draft)
  expect(readVerifiedAdminDraftSummary(recording, tokenKeys)).toEqual({
    audioId,
    tokenCount: 2,
    cueCount: 1,
    updatedAt: 100,
    isIncomplete: true,
  })
})

test.each([
  ['{bad json', 'invalid-json'],
  ['null', 'invalid-draft'],
] as const)('preserves %s and replaces it only with its revision', async (raw, reason) => {
  const key = getAdminDraftStorageKey(audioId)
  window.localStorage.setItem(key, raw)
  const loaded = loadAdminDraftResult(recording, tokenKeys)
  expect(loaded).toEqual({ status: 'invalid', reason, revision: raw })
  expect(window.localStorage.getItem(key)).toBe(raw)

  await saveAdminDraftPayload(
    validDraft(),
    recording,
    tokenKeys,
    writeRequest(raw)
  )
  expect(loadAdminDraft(recording, tokenKeys)).toEqual(validDraft())
})

test('rejects a draft whose cue positions do not match current token keys', async () => {
  await saveAdminDraftPayload(
    validDraft(),
    recording,
    undefined,
    writeRequest()
  )

  expect(loadAdminDraft(recording, ['1:0:0:9', '1:0:0:1'])).toBeNull()
})

test('preserves sub-millisecond cue timing', async () => {
  const draft = { ...validDraft(), cues: [cue(0.0004, 0)] }
  await saveAdminDraftPayload(draft, recording, tokenKeys, writeRequest())
  expect(loadAdminDraft(recording, tokenKeys)?.cues).toEqual(draft.cues)
})

test('rejects a stale writer without losing the newer draft', async () => {
  const first = loadAdminDraftResult(recording, tokenKeys)
  const stale = loadAdminDraftResult(recording, tokenKeys)
  const firstRevision = first.revision
  const staleRevision = stale.revision
  const newer = validDraft(101)
  await saveAdminDraftPayload(
    newer,
    recording,
    tokenKeys,
    writeRequest(firstRevision, 'writer-a')
  )

  await expect(
    saveAdminDraftPayload(
      validDraft(102),
      recording,
      tokenKeys,
      writeRequest(staleRevision, 'writer-b')
    )
  ).rejects.toThrow(AdminDraftConflictError)
  expect(loadAdminDraft(recording, tokenKeys)).toEqual(newer)
})

test('serializes rapid writes from one authoring instance', async () => {
  const first = validDraft(101)
  const second = {
    ...validDraft(102),
    tokenPointer: 2 - 1,
    cues: [cue(0, 0), cue(1.25, 1)],
  }
  const firstWrite = saveAdminDraftPayload(
    first,
    recording,
    tokenKeys,
    writeRequest(null, 'writer-a')
  )
  const secondWrite = saveAdminDraftPayload(
    second,
    recording,
    tokenKeys,
    writeRequest(null, 'writer-a')
  )

  await expect(firstWrite).resolves.toBeDefined()
  await expect(secondWrite).resolves.toBeDefined()
  expect(loadAdminDraft(recording, tokenKeys)).toEqual(second)
})

test('rejects an older same-writer draft', async () => {
  const saved = await saveAdminDraftPayload(
    validDraft(200),
    recording,
    tokenKeys,
    writeRequest(null, 'writer-a')
  )

  await expect(
    saveAdminDraftPayload(
      validDraft(100),
      recording,
      tokenKeys,
      writeRequest(saved.revision, 'writer-a')
    )
  ).rejects.toThrow(AdminDraftConflictError)
})

test('rejects external deletion after a draft was loaded', async () => {
  const saved = await saveAdminDraftPayload(
    validDraft(),
    recording,
    tokenKeys,
    writeRequest()
  )
  window.localStorage.removeItem(getAdminDraftStorageKey(audioId))

  await expect(
    saveAdminDraftPayload(
      validDraft(101),
      recording,
      tokenKeys,
      writeRequest(saved.revision, 'writer-b')
    )
  ).rejects.toThrow(AdminDraftConflictError)
})

test('requires Web Locks for writes', async () => {
  vi.stubGlobal('navigator', {})
  await expect(
    saveAdminDraftPayload(validDraft(), recording, tokenKeys, writeRequest())
  ).rejects.toThrow(AdminDraftStorageError)
  expect(window.localStorage.getItem(getAdminDraftStorageKey(audioId))).toBeNull()
})

test('contains storage failures', async () => {
  window.localStorage.setItem = () => {
    throw new DOMException('denied', 'SecurityError')
  }
  await expect(
    saveAdminDraftPayload(validDraft(), recording, tokenKeys, writeRequest())
  ).rejects.toThrow(AdminDraftStorageError)
})

test('rejects invalid payloads and writer tokens', async () => {
  await expect(
    saveAdminDraftPayload(
      { ...validDraft(), tokenCount: 0 },
      recording,
      tokenKeys,
      writeRequest()
    )
  ).rejects.toThrow(TypeError)
  await expect(
    saveAdminDraftPayload(
      validDraft(),
      recording,
      tokenKeys,
      writeRequest(null, '')
    )
  ).rejects.toThrow(TypeError)
})
