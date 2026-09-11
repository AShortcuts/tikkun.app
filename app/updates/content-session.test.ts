import { expect, test, vi } from 'vitest'
import { contentCompatibility, digestText, parseContentSnapshot } from './content-schema.ts'
import { ContentSession, emptyContentState, parseContentState, type ContentStore } from './content-session.ts'

export function fixture() {
  return parseContentSnapshot({ schema: 1,
    pages: { 'torah/1': [{ text: [['\u05d0\u05d1']], verses: [{ book: 1, chapter: 1, verse: 1 }], aliyot: [], isPetucha: false }] },
    recordings: [{ id: 'test-1', narratorId: 'yoni-davidov', reading: { kind: 'parsha', id: 'test', name: 'Test' },
      parshaSlug: 'test', parshaName: 'Test', aliyah: 1, title: 'Test', format: 'm4a', status: 'available',
      playSrc: '/audio/test/1.m4a', downloadSrc: '/audio/test/1.m4a', mediaIdentity: { algorithm: 'sha256', digest: 'a'.repeat(64), byteLength: 10 } }],
    cues: {},
  })
}
async function saved(snapshot = fixture()) {
  const payload = JSON.stringify(snapshot)
  return { payload, digest: await digestText(payload) }
}
function memoryStore() {
  let value: string | null = null
  return { read: vi.fn(async () => value), write: vi.fn(async (next: string) => { value = next }) } satisfies ContentStore
}
async function setup() {
  const store = memoryStore()
  const compatibility = await contentCompatibility(fixture())
  const report = vi.fn()
  const session = new ContentSession(store, compatibility, report)
  await session.open()
  return { store, compatibility, report, session }
}

test('stages without changing the open session, activates on fresh launch, commits after ready', async () => {
  const { store, compatibility, report, session } = await setup()
  await session.stage(await saved())
  expect(session.snapshot).toBeNull()
  const next = new ContentSession(store, compatibility, report)
  await next.open()
  expect(next.snapshot).toEqual(fixture())
  expect(parseContentState(await store.read()).trial).not.toBeNull()
  await next.ready()
  expect(parseContentState(await store.read()).trial).toBeNull()
  expect(parseContentState(await store.read()).active).not.toBeNull()
})

test('failed trial returns to the last working content and quarantines the failed release', async () => {
  const { store, compatibility, report } = await setup()
  const first = await saved()
  const changed = fixture(); changed.pages['torah/1'][0].text = [['\u05d0\u05d2']]
  const pending = await saved(changed)
  await store.write(JSON.stringify({ ...emptyContentState(), active: first, pending }))
  const trial = new ContentSession(store, compatibility, report)
  await trial.open()
  const afterCrash = new ContentSession(store, compatibility, report)
  await afterCrash.open()
  expect(afterCrash.snapshot).toEqual(fixture())
  expect(afterCrash.has(pending.digest)).toBe(true)
  await afterCrash.stage(pending)
  expect(parseContentState(await store.read()).pending).toBeNull()
})

test('rejects tampered content and structural changes without replacing active state', async () => {
  const { session, store } = await setup()
  const original = await saved()
  await expect(session.stage({ ...original, payload: original.payload + ' ' })).rejects.toThrow('checksum')
  const changed = fixture(); changed.pages['torah/1'][0].verses[0].verse = 2
  await expect(session.stage(await saved(changed))).rejects.toThrow('incompatible')
  expect(await store.read()).toBeNull()
  await session.stage(await saved())
  expect(parseContentState(await store.read()).pending).not.toBeNull()
})

test('write failure cannot activate an update', async () => {
  const { session, store } = await setup()
  store.write.mockRejectedValueOnce(new Error('Disk full'))
  await expect(session.stage(await saved())).rejects.toThrow('Disk full')
  expect(session.snapshot).toBeNull()
  expect(await store.read()).toBeNull()
})

test('corrupt pending snapshot falls back to verified active content', async () => {
  const { store, compatibility, report } = await setup()
  await store.write(JSON.stringify({ ...emptyContentState(), active: await saved(), pending: { digest: 'f'.repeat(64), payload: '{}' } }))
  const next = new ContentSession(store, compatibility, report)
  await next.open()
  expect(next.snapshot).toEqual(fixture())
  expect(report).toHaveBeenCalledOnce()
})

test('rejects malformed saved state', () => {
  expect(() => parseContentState('{}')).toThrow('Invalid saved')
})

test('recovers a damaged state file without disabling future updates', async () => {
  const { store, compatibility, report } = await setup()
  await store.write('{damaged')
  const session = new ContentSession(store, compatibility, report)
  await session.open()
  expect(session.snapshot).toBeNull()
  expect(report).toHaveBeenCalledOnce()
  await session.stage(await saved())
  expect(parseContentState(await store.read()).pending).not.toBeNull()
})

test('rejects executable markup, traversal URLs and unbound cue identities', () => {
  const markup = fixture(); markup.pages['torah/1'][0].text = [['<img onerror=alert(1)>']]
  expect(() => parseContentSnapshot(markup)).toThrow('text')
  const traversal = fixture(); traversal.recordings[0].playSrc = '/audio/../secret.m4a'
  expect(() => parseContentSnapshot(traversal)).toThrow('media path')
  const payload = fixture()
  payload.cues['audio-cues/yoni-davidov/test/1.json'] = { audioId: 'test-1', audioFormat: 'm4a', narratorId: 'yoni-davidov',
    readingId: 'test', aliyah: 1, cueCount: 1, tokenCount: 1, tokenizationVersion: 'v2',
    cues: [{ cueNumber: 1, timeStart: 0, pageNumber: 1, lineIndex: 0, fragmentIndex: 0, wordIndex: 0 }] }
  expect(() => parseContentSnapshot(payload)).toThrow('cue/audio identity')
})
