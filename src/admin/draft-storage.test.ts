import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { TOKENIZATION_VERSION } from '../reader-preferences.ts'
import {
  AdminDraftConflictError,
  AdminDraftStorageError,
  getAdminDraftStorageKey,
  loadAdminDraft,
  readAdminDraftSummary,
  saveAdminDraftPayload,
  type AdminDraftPayload,
} from './draft-storage.ts'

const audioId = 'test-audio'
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
  tokenCount: 2,
  tokenPointer: 1,
  tokenizationVersion: TOKENIZATION_VERSION,
  updatedAt: 100,
  cues: [cue(0, 0)],
})

beforeEach(() => {
  const store = new Map<string, string>()
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  }
  vi.stubGlobal('window', { localStorage })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('round-trips a valid draft through the storage adapter', () => {
  const draft = validDraft()
  saveAdminDraftPayload(draft)

  expect(loadAdminDraft(audioId, ['1:0:0:0', '1:0:0:1'])).toEqual(draft)
  expect(readAdminDraftSummary(audioId)).toEqual({
    audioId,
    tokenCount: 2,
    cueCount: 1,
    updatedAt: 100,
    isIncomplete: true,
  })
})

test('rejects and removes a draft when any cue is malformed', () => {
  window.localStorage.setItem(
    getAdminDraftStorageKey(audioId),
    JSON.stringify({
      ...validDraft(),
      cues: [cue(0, 0), { nonsense: true }],
    })
  )

  expect(loadAdminDraft(audioId, 2)).toBeNull()
  expect(window.localStorage.getItem(getAdminDraftStorageKey(audioId))).toBeNull()
  expect(
    window.localStorage.getItem(`${getAdminDraftStorageKey(audioId)}:quarantine`)
  ).not.toBeNull()
})

test('rejects cues whose positions no longer match the token sequence', () => {
  saveAdminDraftPayload(validDraft())

  expect(loadAdminDraft(audioId, ['1:0:0:9', '1:0:0:1'])).toBeNull()
})

test('rejects malformed or duplicate expected token identities', () => {
  saveAdminDraftPayload(validDraft())
  expect(loadAdminDraft(audioId, ['1::0:0', '1:0:0:1'])).toBeNull()

  saveAdminDraftPayload(validDraft())
  expect(loadAdminDraft(audioId, ['1:0:0:0', '1:0:0:0'])).toBeNull()
})

test('preserves structurally valid out-of-order times for admin repair', () => {
  const draft = {
    ...validDraft(),
    cues: [cue(4, 0), cue(2, 1)],
  }
  saveAdminDraftPayload(draft)

  expect(loadAdminDraft(audioId, ['1:0:0:0', '1:0:0:1'])?.cues).toEqual(
    draft.cues
  )
})

test('refuses to persist an invalid draft envelope', () => {
  expect(() =>
    saveAdminDraftPayload({ ...validDraft(), tokenPointer: 0.5 })
  ).toThrow('Cannot persist an invalid admin draft')
})

test('removes a stored non-object draft instead of retrying it forever', () => {
  window.localStorage.setItem(getAdminDraftStorageKey(audioId), 'null')

  expect(readAdminDraftSummary(audioId)).toBeNull()
  expect(window.localStorage.getItem(getAdminDraftStorageKey(audioId))).toBeNull()
  expect(
    window.localStorage.getItem(`${getAdminDraftStorageKey(audioId)}:quarantine`)
  ).not.toBeNull()
})

test('refuses to overwrite a newer draft from another writer', () => {
  const newerDraft = { ...validDraft(), updatedAt: 200 }
  window.localStorage.setItem(
    getAdminDraftStorageKey(audioId),
    JSON.stringify(newerDraft)
  )

  expect(() => saveAdminDraftPayload(validDraft())).toThrow(
    AdminDraftConflictError
  )
  expect(loadAdminDraft(audioId, 2)).toEqual(newerDraft)
})

test('handles denied draft reads and surfaces denied writes', () => {
  vi.stubGlobal('window', {
    get localStorage() {
      throw new Error('storage denied')
    },
  })
  expect(loadAdminDraft(audioId, 2)).toBeNull()
  expect(() => saveAdminDraftPayload(validDraft())).toThrow(
    AdminDraftStorageError
  )
})
