import { CapacitorException, ExceptionCode } from '@capacitor/core'
import { expect, test, vi } from 'vitest'
import { CONTENT_STATE_FILE, ContentSession, parseContentState, storedCueFiles } from './content-session.ts'
import { parsePublishedCatalog } from './published-content.ts'
import { cue, cuePath, memoryStore, publish, recording, sha256 } from './published-content.fixture.ts'

const app = publish([recording(1)], { [cuePath(1)]: cue(1) })
const website = publish([recording(1), recording(2)], { [cuePath(1)]: cue(1), [cuePath(2)]: cue(2) })
const latest = (content: typeof website) => content.files.get('latest.json')!
const saved = (content = website) => ({ digest: sha256(latest(content)), catalog: latest(content), builtIn: app.builtIn.digest })

async function launch(store: ReturnType<typeof memoryStore>, builtIn = app.builtIn) {
  const report = vi.fn()
  const session = new ContentSession(store, builtIn, report)
  await session.open()
  return { session, report }
}

test('new content waits for the next launch, then becomes the working copy once the Reader starts', async () => {
  const store = memoryStore()
  const { session: first } = await launch(store)
  await first.stage(saved())
  expect(first.catalog).toBeNull()
  expect(first.pending).toBe(true)

  const { session: next } = await launch(store)
  expect(next.catalog?.recordings.map(entry => entry.id)).toEqual(['beresheet-1', 'beresheet-2'])
  expect(parseContentState(await store.read(CONTENT_STATE_FILE)).trial).toBe(saved().digest)
  await next.ready()
  const state = parseContentState(await store.read(CONTENT_STATE_FILE))
  expect(state).toMatchObject({ trial: null, pending: null, active: saved() })
})

test('content that never finished starting the Reader is set aside for the last working copy', async () => {
  const store = memoryStore()
  const retimed = publish([recording(1)], { [cuePath(1)]: cue(1, 0.25) })
  const { session: first } = await launch(store)
  await first.stage(saved())
  const { session: started } = await launch(store)
  await started.ready()
  await started.stage(saved(retimed))
  await launch(store)  // tries the retimed copy, then the app is closed before the Reader starts

  const { session: recovered, report } = await launch(store)
  expect(recovered.usingDigest).toBe(saved().digest)
  expect(report).not.toHaveBeenCalled()
  await expect(recovered.stage(saved(retimed))).rejects.toThrow('failed to start the Reader')
})

test('an app update replaces content saved for the previous version', async () => {
  const store = memoryStore()
  const { session: first } = await launch(store)
  await first.stage(saved())
  const updatedApp = { ...website.builtIn }
  const { session } = await launch(store, updatedApp)
  expect(session.catalog).toBeNull()
  expect(session.usingDigest).toBe(updatedApp.digest)
  expect(parseContentState(await store.read(CONTENT_STATE_FILE)).pending).toBeNull()
})

test('damaged saved content is rejected without losing the built-in copy', async () => {
  const store = memoryStore()
  await store.write(CONTENT_STATE_FILE, JSON.stringify({ active: null, trial: null, rejected: [],
    pending: { ...saved(), catalog: latest(website).replace('Beresheet Aliyah 2', 'Beresheet Aliyah 3') } }))
  const { session, report } = await launch(store)
  expect(session.catalog).toBeNull()
  expect(session.usingDigest).toBe(app.builtIn.digest)
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'Saved content checksum mismatch' }))
})

test('only cue files that differ from the app copy are kept on the device', () => {
  const catalog = parsePublishedCatalog(JSON.parse(latest(website)))
  expect(storedCueFiles(catalog, app.builtIn)).toEqual([`cues/${website.builtIn.cues[cuePath(2)]}.json`])
})

test('an App Store build without the storage methods fails cleanly without reporting or saving', async () => {
  const missing = new CapacitorException('"TikkunMedia.readContent()" is not implemented on ios', ExceptionCode.Unimplemented)
  const store = { read: vi.fn(async () => { throw missing }), write: vi.fn(async () => {}), prune: vi.fn(async () => {}) }
  const report = vi.fn()
  await expect(new ContentSession(store, app.builtIn, report).open()).rejects.toBe(missing)
  expect(report).not.toHaveBeenCalled()
  expect(store.write).not.toHaveBeenCalled()
})
