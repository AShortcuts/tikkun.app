import { expect, test, vi } from 'vitest'
import { ContentSession } from './content-session.ts'
import { createActiveContent, refreshPublishedContent } from './content-runtime.ts'
import { cue, cuePath, memoryStore, publish, recording, textWith } from './published-content.fixture.ts'

const origin = 'https://tikkunreader.com'
const app = publish([recording(1)], { [cuePath(1)]: cue(1) })

function website(content: ReturnType<typeof publish>, overrides: Record<string, string> = {}) {
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    const name = String(url).replace(`${origin}/content/v1/`, '')
    const body = overrides[name] ?? content.files.get(name)
    return body === undefined
      ? new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })
      : new Response(body, { headers: { 'content-type': 'application/json' } })
  })
  return fetcher as typeof fetcher & typeof fetch
}

async function launch(store = memoryStore()) {
  const session = new ContentSession(store, app.builtIn, vi.fn())
  await session.open()
  await session.ready()
  return { store, session }
}

test('a website that matches the app copy needs no download', async () => {
  const { store, session } = await launch()
  const fetcher = website(app)
  expect(await refreshPublishedContent({ session, store, builtIn: app.builtIn, origin, fetcher })).toBe('current')
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(session.pending).toBe(false)
})

test('new recordings and retimed cues download only the changed cue files, then apply on the next launch', async () => {
  const published = publish([recording(1), recording(2)], { [cuePath(1)]: cue(1, 0.5), [cuePath(2)]: cue(2) })
  const { store, session } = await launch()
  const fetcher = website(published)
  const onDownload = vi.fn()
  expect(await refreshPublishedContent({ session, store, builtIn: app.builtIn, origin, fetcher, onDownload })).toBe('ready')
  expect(onDownload).toHaveBeenCalledOnce()
  expect([...store.files.keys()].filter(name => name.startsWith('cues/')).sort())
    .toEqual([published.builtIn.cues[cuePath(1)], published.builtIn.cues[cuePath(2)]].map(digest => `cues/${digest}.json`).sort())
  expect(await refreshPublishedContent({ session, store, builtIn: app.builtIn, origin, fetcher })).toBe('ready')
  expect(fetcher).toHaveBeenCalledTimes(4)

  const { session: next } = await launch(store)
  expect(next.catalog?.recordings.map(entry => entry.id)).toEqual(['beresheet-1', 'beresheet-2'])
  const content = createActiveContent(next.catalog!, app.builtIn, store)
  expect(await content.cueLoader(cuePath(2))?.()).toEqual(JSON.parse(cue(2)))
  expect(await content.cueLoader(cuePath(1), async () => 'built-in')?.()).toEqual(JSON.parse(cue(1, 0.5)))
  expect(content.cueLoader('audio-cues/yoni-davidov/01 beresheet/3.json')).toBeUndefined()
})

test('unchanged cue files load from the app itself and damaged saved files are reported', async () => {
  const published = publish([recording(1), recording(2)], { [cuePath(1)]: cue(1), [cuePath(2)]: cue(2) })
  const { store, session } = await launch()
  await refreshPublishedContent({ session, store, builtIn: app.builtIn, origin, fetcher: website(published) })
  expect(store.files.has(`cues/${published.builtIn.cues[cuePath(1)]}.json`)).toBe(false)
  const { session: next } = await launch(store)
  const content = createActiveContent(next.catalog!, app.builtIn, store)
  const builtInLoader = async () => 'built-in'
  expect(content.cueLoader(cuePath(1), builtInLoader)).toBe(builtInLoader)
  store.files.set(`cues/${published.builtIn.cues[cuePath(2)]}.json`, '[]')
  await expect(content.cueLoader(cuePath(2))!()).rejects.toThrow('is damaged')
})

test('a cue file that does not match its fingerprint stops the update before anything changes', async () => {
  const published = publish([recording(1), recording(2)], { [cuePath(1)]: cue(1), [cuePath(2)]: cue(2) })
  const { store, session } = await launch()
  const fetcher = website(published, { [`cues/${published.builtIn.cues[cuePath(2)]}.json`]: cue(2, 9) })
  await expect(refreshPublishedContent({ session, store, builtIn: app.builtIn, origin, fetcher })).rejects.toThrow('fingerprint')
  expect(session.pending).toBe(false)
})

test('an unpublished site or cues made for different Torah text leave the app copy alone', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const { store, session } = await launch()
  const page = vi.fn(async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }))
  const missing = vi.fn(async () => new Response('Not found', { status: 404 }))
  for (const fetcher of [page, missing]) {
    expect(await refreshPublishedContent({ session, store, builtIn: app.builtIn, origin, fetcher })).toBe('unpublished')
  }
  const otherText = publish([recording(1), recording(2)], { [cuePath(2)]: cue(2) },
    textWith({ text: [['\u05d1\u05e8\u05d0\u05e9\u05d9\u05ea']] }))
  const fetcher = website(otherText)
  expect(await refreshPublishedContent({ session, store, builtIn: app.builtIn, origin, fetcher })).toBe('unpublished')
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(session.pending).toBe(false)
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('different Torah text'))
  warn.mockRestore()
})

test('when the website goes back to the copy in use, a staged update is dropped', async () => {
  const published = publish([recording(1), recording(2)], { [cuePath(1)]: cue(1), [cuePath(2)]: cue(2) })
  const { store, session } = await launch()
  await refreshPublishedContent({ session, store, builtIn: app.builtIn, origin, fetcher: website(published) })
  expect(session.pending).toBe(true)
  expect(await refreshPublishedContent({ session, store, builtIn: app.builtIn, origin, fetcher: website(app) })).toBe('current')
  expect(session.pending).toBe(false)
})
