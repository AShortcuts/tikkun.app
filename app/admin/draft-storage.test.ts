import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { TOKENIZATION_VERSION } from '../audio/cue-schema.ts'
import type { ParshaAudioRecording } from '../audio/types.ts'
import {
  AdminDraftConflictError,
  AdminDraftStorageError,
  getAdminDraftRecoveryStorageKey,
  getAdminDraftStorageKey,
  loadAdminDraft,
  loadAdminDraftResult,
  preserveAdminDraftSnapshot,
  readAdminDraftRecoveries,
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
const cue = (
  timeStart: number,
  wordIndex: number
) => ({
  timeStart,
  pageNumber: 1,
  lineIndex: 0,
  fragmentIndex: 0,
  wordIndex,
})

const validDraft = (): AdminDraftPayload => ({
  audioId,
  audioFormat: recording.format,
  narratorId: recording.narratorId,
  readingId: recording.reading.id,
  aliyah: recording.aliyah,
  mediaIdentity,
  tokenCount: 2,
  tokenPointer: 1,
  tokenizationVersion: TOKENIZATION_VERSION,
  updatedAt: 100,
  cues: [cue(0, 0)],
})

const writeRequest = (
  expectedRevision: AdminDraftRevision = null,
  writerToken = 'test-writer'
) => ({ writerToken, expectedRevision })

function createMemoryStorage({
  failRecoveryWrites = false,
  maxRecoveryWrites,
}: {
  failRecoveryWrites?: boolean
  maxRecoveryWrites?: number
} = {}): Storage {
  const store = new Map<string, string>()
  let recoveryWrites = 0
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
      if (
        key.startsWith('tikkun-admin-draft-recovery:v1:') &&
        (failRecoveryWrites ||
          (maxRecoveryWrites !== undefined &&
            recoveryWrites >= maxRecoveryWrites))
      ) {
        throw new Error('quota exceeded')
      }
      if (key.startsWith('tikkun-admin-draft-recovery:v1:')) {
        recoveryWrites += 1
      }
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
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('round-trips a valid draft through the storage adapter', async () => {
  const draft = validDraft()
  await saveAdminDraftPayload(
    draft,
    recording,
    ['1:0:0:0', '1:0:0:1'],
    writeRequest()
  )

  const storedRaw = window.localStorage.getItem(
    getAdminDraftStorageKey(audioId)
  )
  expect(storedRaw).not.toBeNull()
  const stored = JSON.parse(storedRaw ?? '{}') as Record<string, unknown>
  expect(stored._tikkunDraftStorage).toMatchObject({
    version: 1,
    writerToken: 'test-writer',
  })

  const loaded = loadAdminDraft(recording, ['1:0:0:0', '1:0:0:1'])
  expect(loaded).toEqual(draft)
  expect(loaded).not.toHaveProperty('_tikkunDraftStorage')
  expect(
    readVerifiedAdminDraftSummary(recording, ['1:0:0:0', '1:0:0:1'])
  ).toEqual({
    audioId,
    tokenCount: 2,
    cueCount: 1,
    updatedAt: 100,
    isIncomplete: true,
  })
})

test('moves a malformed draft into exact versioned recovery storage', () => {
  vi.spyOn(Date, 'now').mockReturnValue(123)
  const rawDraft = JSON.stringify({
    ...validDraft(),
    cues: [cue(0, 0), { nonsense: true }],
  })
  window.localStorage.setItem(
    getAdminDraftStorageKey(audioId),
    rawDraft
  )

  expect(loadAdminDraft(recording, 2)).toBeNull()
  expect(window.localStorage.getItem(getAdminDraftStorageKey(audioId))).toBe(rawDraft)
  expect(readAdminDraftRecoveries(audioId)).toEqual([{
    storageKey: getAdminDraftRecoveryStorageKey(audioId, 123),
    version: 1,
    audioId,
    sourceKey: getAdminDraftStorageKey(audioId),
    reason: 'invalid draft schema',
    recoveredAt: 123,
    rawValue: rawDraft,
  }])
})

test('preserves a rejected valid snapshot without replacing the winning draft', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(456)
  const winner = { ...validDraft(), updatedAt: 200 }
  const rejected = { ...validDraft(), updatedAt: 201, cues: [cue(1, 0)] }
  await saveAdminDraftPayload(
    winner,
    recording,
    ['1:0:0:0', '1:0:0:1'],
    writeRequest(null, 'winning-writer')
  )

  await expect(
    preserveAdminDraftSnapshot(rejected, 'conflicting save')
  ).resolves.toBe(true)

  expect(loadAdminDraft(recording, ['1:0:0:0', '1:0:0:1'])).toEqual(winner)
  expect(readAdminDraftRecoveries(audioId)).toMatchObject([
    {
      storageKey: getAdminDraftRecoveryStorageKey(audioId, 456),
      audioId,
      reason: 'conflicting save',
      rawValue: JSON.stringify(rejected),
    },
  ])
})

test('reports a recovery lock failure without rejecting the caller', async () => {
  vi.stubGlobal('navigator', {
    locks: {
      request: vi.fn().mockRejectedValue(new Error('lock unavailable')),
    },
  })

  await expect(
    preserveAdminDraftSnapshot(validDraft(), 'conflicting save')
  ).resolves.toBe(false)
})

test('rejects cues whose positions no longer match the token sequence', async () => {
  await saveAdminDraftPayload(validDraft(), recording, undefined, writeRequest())

  expect(loadAdminDraft(recording, ['1:0:0:9', '1:0:0:1'])).toBeNull()
})

test('rejects malformed or duplicate expected token identities', async () => {
  await saveAdminDraftPayload(validDraft(), recording, undefined, writeRequest())
  expect(loadAdminDraft(recording, ['1::0:0', '1:0:0:1'])).toBeNull()

  await saveAdminDraftPayload(validDraft(), recording, undefined, writeRequest())
  expect(loadAdminDraft(recording, ['1:0:0:0', '1:0:0:0'])).toBeNull()
})

test('preserves structurally valid out-of-order times for admin repair', async () => {
  const draft = {
    ...validDraft(),
    cues: [cue(4, 0), cue(2, 1)],
  }
  await saveAdminDraftPayload(draft, recording, undefined, writeRequest())

  expect(loadAdminDraft(recording, ['1:0:0:0', '1:0:0:1'])?.cues).toEqual(
    draft.cues
  )
})

test('refuses to persist an invalid draft envelope', async () => {
  await expect(
    saveAdminDraftPayload(
      { ...validDraft(), tokenPointer: 0.5 },
      recording,
      undefined,
      writeRequest()
    )
  ).rejects.toThrow('Cannot persist an invalid admin draft')
})

test('preserves a stored non-object draft in recovery without deleting its source', () => {
  window.localStorage.setItem(getAdminDraftStorageKey(audioId), 'null')

  expect(
    readVerifiedAdminDraftSummary(recording, ['1:0:0:0', '1:0:0:1'])
  ).toBeNull()
  expect(window.localStorage.getItem(getAdminDraftStorageKey(audioId))).toBe('null')
  expect(readAdminDraftRecoveries(audioId)[0]?.rawValue).toBe('null')
})

test('refuses to overwrite a newer draft from another writer', async () => {
  const newerDraft = { ...validDraft(), updatedAt: 200 }
  window.localStorage.setItem(
    getAdminDraftStorageKey(audioId),
    JSON.stringify(newerDraft)
  )

  await expect(
    saveAdminDraftPayload(validDraft(), recording, undefined, writeRequest())
  ).rejects.toThrow(AdminDraftConflictError)
  expect(loadAdminDraft(recording, 2)).toEqual(newerDraft)
})

test('rejects a stale tab even when its attempted timestamp is later', async () => {
  const first = await saveAdminDraftPayload(
    validDraft(),
    recording,
    undefined,
    writeRequest(null, 'writer-a')
  )
  const writerBBase = first.revision
  const writerAUpdate = { ...validDraft(), updatedAt: 200 }
  await saveAdminDraftPayload(
    writerAUpdate,
    recording,
    undefined,
    writeRequest(first.revision, 'writer-a')
  )

  await expect(
    saveAdminDraftPayload(
      { ...validDraft(), updatedAt: 300 },
      recording,
      undefined,
      writeRequest(writerBBase, 'writer-b')
    )
  ).rejects.toThrow(AdminDraftConflictError)
  expect(loadAdminDraft(recording, 2)).toEqual(writerAUpdate)
})

test('serializes queued writes from one writer token without false conflicts', async () => {
  const first = await saveAdminDraftPayload(
    validDraft(),
    recording,
    undefined,
    writeRequest(null, 'writer-a')
  )
  const middle = { ...validDraft(), updatedAt: 200 }
  const latest = { ...validDraft(), updatedAt: 300 }

  const middleWrite = saveAdminDraftPayload(
    middle,
    recording,
    undefined,
    writeRequest(first.revision, 'writer-a')
  )
  const latestWrite = saveAdminDraftPayload(
    latest,
    recording,
    undefined,
    writeRequest(first.revision, 'writer-a')
  )

  await expect(middleWrite).resolves.toHaveProperty('revision')
  await expect(latestWrite).resolves.toHaveProperty('revision')
  expect(loadAdminDraft(recording, 2)).toEqual(latest)
})

test('rejects divergent same-millisecond writes but permits an exact replay', async () => {
  const existing = validDraft()
  window.localStorage.setItem(
    getAdminDraftStorageKey(audioId),
    JSON.stringify(existing)
  )

  await expect(
    saveAdminDraftPayload(existing, recording, undefined, writeRequest())
  ).resolves.toHaveProperty('revision')
  await expect(
    saveAdminDraftPayload(
      { ...existing, tokenPointer: 0, cues: [cue(1, 0)] },
      recording,
      undefined,
      writeRequest()
    )
  ).rejects.toThrow(AdminDraftConflictError)
  expect(loadAdminDraft(recording, 2)).toEqual(existing)
})

test('handles denied draft reads and surfaces denied writes', async () => {
  vi.stubGlobal('window', {
    get localStorage() {
      throw new Error('storage denied')
    },
  })
  expect(loadAdminDraft(recording, 2)).toBeNull()
  await expect(
    saveAdminDraftPayload(validDraft(), recording, undefined, writeRequest())
  ).rejects.toThrow(AdminDraftStorageError)
})

test('refuses an unlocked write instead of racing browser tabs', async () => {
  vi.stubGlobal('navigator', {})

  await expect(
    saveAdminDraftPayload(validDraft(), recording, undefined, writeRequest())
  ).rejects.toThrow(AdminDraftStorageError)
  expect(window.localStorage.getItem(getAdminDraftStorageKey(audioId))).toBeNull()
})

test('does not recreate a draft deleted after this writer loaded it', async () => {
  const first = await saveAdminDraftPayload(
    validDraft(),
    recording,
    undefined,
    writeRequest()
  )
  window.localStorage.removeItem(getAdminDraftStorageKey(audioId))

  await expect(
    saveAdminDraftPayload(
      { ...validDraft(), updatedAt: 200 },
      recording,
      undefined,
      writeRequest(first.revision)
    )
  ).rejects.toThrow(AdminDraftConflictError)
  expect(window.localStorage.getItem(getAdminDraftStorageKey(audioId))).toBeNull()
})

test('preserves the full legacy draft without binding it to current media', () => {
  vi.spyOn(Date, 'now').mockReturnValue(456)
  const { audioFormat, narratorId, readingId, aliyah, mediaIdentity, ...legacy } =
    validDraft()
  void audioFormat
  void narratorId
  void readingId
  void aliyah
  void mediaIdentity
  const rawLegacy = JSON.stringify({
    ...legacy,
    notes: 'x'.repeat(40_000),
  })
  window.localStorage.setItem(getAdminDraftStorageKey(audioId), rawLegacy)

  expect(loadAdminDraft(recording, 2)).toBeNull()
  expect(window.localStorage.getItem(getAdminDraftStorageKey(audioId))).toBe(rawLegacy)
  const recovery = readAdminDraftRecoveries(audioId)[0]
  expect(recovery).toMatchObject({
    version: 1,
    audioId,
    reason: 'invalid draft schema',
    recoveredAt: 456,
  })
  expect(recovery?.rawValue).toBe(rawLegacy)
  expect(recovery?.rawValue.length).toBeGreaterThan(32_768)
})

test('keeps the original draft when recovery storage is unavailable', () => {
  const localStorage = createMemoryStorage({ failRecoveryWrites: true })
  vi.stubGlobal('window', { localStorage })
  const rawLegacy = JSON.stringify({ tokenCount: 2, cues: [] })
  localStorage.setItem(getAdminDraftStorageKey(audioId), rawLegacy)

  expect(loadAdminDraftResult(recording, 2)).toEqual({
    status: 'recovery-failed',
    rawValue: rawLegacy,
    reason: 'invalid draft schema',
    revision: `raw:${rawLegacy}`,
  })
  expect(localStorage.getItem(getAdminDraftStorageKey(audioId))).toBe(rawLegacy)
  expect(readAdminDraftRecoveries(audioId)).toEqual([])
})

test('backs up invalid source before replacing it with a valid draft', async () => {
  const rawLegacy = JSON.stringify({ tokenCount: 2, cues: [] })
  window.localStorage.setItem(getAdminDraftStorageKey(audioId), rawLegacy)
  const loaded = loadAdminDraftResult(recording, 2)

  await saveAdminDraftPayload(
    validDraft(),
    recording,
    undefined,
    writeRequest(loaded.revision)
  )

  expect(loadAdminDraft(recording, 2)).toEqual(validDraft())
  expect(readAdminDraftRecoveries(audioId)).toHaveLength(1)
  expect(readAdminDraftRecoveries(audioId)[0]).toMatchObject({
    reason: 'invalid draft schema',
    rawValue: rawLegacy,
  })
})

test('reuses one verified recovery when quota cannot hold a duplicate', async () => {
  const localStorage = createMemoryStorage({ maxRecoveryWrites: 1 })
  vi.stubGlobal('window', { localStorage })
  const rawLegacy = JSON.stringify({ tokenCount: 2, cues: [] })
  localStorage.setItem(getAdminDraftStorageKey(audioId), rawLegacy)
  const loaded = loadAdminDraftResult(recording, 2)

  await expect(
    saveAdminDraftPayload(
      validDraft(),
      recording,
      undefined,
      writeRequest(loaded.revision)
    )
  ).resolves.toHaveProperty('revision')
  expect(readAdminDraftRecoveries(audioId)).toHaveLength(1)
  expect(loadAdminDraft(recording, 2)).toEqual(validDraft())
})

test('refuses replacement when the invalid source cannot be backed up', async () => {
  const localStorage = createMemoryStorage({ failRecoveryWrites: true })
  vi.stubGlobal('window', { localStorage })
  const rawLegacy = JSON.stringify({ tokenCount: 2, cues: [] })
  localStorage.setItem(getAdminDraftStorageKey(audioId), rawLegacy)
  const loaded = loadAdminDraftResult(recording, 2)

  await expect(
    saveAdminDraftPayload(
      validDraft(),
      recording,
      undefined,
      writeRequest(loaded.revision)
    )
  ).rejects.toThrow(AdminDraftStorageError)
  expect(localStorage.getItem(getAdminDraftStorageKey(audioId))).toBe(rawLegacy)
})

test('serializes competing tab writes and preserves the newest draft', async () => {
  const newerDraft = { ...validDraft(), updatedAt: 200 }
  const newerWrite = saveAdminDraftPayload(
    newerDraft,
    recording,
    undefined,
    writeRequest(null, 'newer-writer')
  )
  const olderWrite = saveAdminDraftPayload(
    validDraft(),
    recording,
    undefined,
    writeRequest(null, 'older-writer')
  )

  await expect(newerWrite).resolves.toHaveProperty('revision')
  await expect(olderWrite).rejects.toThrow(AdminDraftConflictError)
  expect(loadAdminDraft(recording, 2)).toEqual(newerDraft)
})

test('never deletes a newer source that appears during recovery', () => {
  const storage = createMemoryStorage()
  vi.stubGlobal('window', { localStorage: storage })
  const sourceKey = getAdminDraftStorageKey(audioId)
  const invalidSource = JSON.stringify({ tokenCount: 2, cues: [] })
  const newerDraft = JSON.stringify({ ...validDraft(), updatedAt: 200 })
  storage.setItem(sourceKey, invalidSource)
  const originalSetItem = storage.setItem.bind(storage)
  let injected = false
  storage.setItem = (key, value) => {
    originalSetItem(key, value)
    if (!injected && key.startsWith('tikkun-admin-draft-recovery:v1:')) {
      injected = true
      originalSetItem(sourceKey, newerDraft)
    }
  }

  expect(loadAdminDraftResult(recording, 2)).toEqual({
    status: 'recovery-failed',
    rawValue: invalidSource,
    reason: 'invalid draft schema',
    revision: `raw:${invalidSource}`,
  })
  expect(storage.getItem(sourceKey)).toBe(newerDraft)
})

test('keeps separate recovery records when drafts change in one millisecond', () => {
  vi.spyOn(Date, 'now').mockReturnValue(789)
  window.localStorage.setItem(getAdminDraftStorageKey(audioId), 'first')
  expect(loadAdminDraft(recording, 2)).toBeNull()
  window.localStorage.setItem(getAdminDraftStorageKey(audioId), 'second')
  expect(loadAdminDraft(recording, 2)).toBeNull()

  expect(readAdminDraftRecoveries(audioId).map(({ rawValue }) => rawValue)).toEqual([
    'second',
    'first',
  ])
  expect(
    window.localStorage.getItem(
      getAdminDraftRecoveryStorageKey(audioId, 789, 1)
    )
  ).not.toBeNull()
})
