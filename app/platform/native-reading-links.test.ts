import { expect, test, vi } from 'vitest'
import { createNativeReadingLinks, readingHashFromNativeUrl } from './native-reading-links.ts'

const first = 'https://tikkunreader.com/reader/#/torah/parsha/beresheet/1-4-19'
const second = 'https://tikkunreader.com/reader/#/torah/parsha/noach/5-1-1'

test.each([
  [first, '#/torah/parsha/beresheet/1-4-19'],
  [`${first}?recording=1`, '#/torah/parsha/beresheet/1-4-19'],
  ['https://tikkunreader.com/reader?utm_source=test#/esther/page/2', '#/esther/page/2'],
  ['https://tikkunreader.com/reader/#/r/1-1-1', '#/r/1-1-1'],
  ['https://tikkunreader.com/reader/#/run/2026-09-12/1-1-1', '#/run/2026-09-12/1-1-1'],
])('maps only the reading portion of %s', (url, expected) => {
  expect(readingHashFromNativeUrl(url)).toBe(expected)
})

test.each([
  '/reader/#/torah/page/1', 'javascript:alert(1)',
  'https://tikkunreader.com.evil.test/reader/#/torah/page/1',
  'https://tikkunreader.com@evil.test/reader/#/torah/page/1',
  'https://user:pass@tikkunreader.com/reader/#/torah/page/1',
  'http://tikkunreader.com/reader/#/torah/page/1',
  'https://tikkunreader.com:8443/reader/#/torah/page/1',
  'https://tikkunreader.com/admin/#/torah/page/1',
  'https://tikkunreader.com/reader/extra/#/torah/page/1',
  'https://tikkunreader.com/reader/#/about',
  'https://tikkunreader.com/reader/#/next',
  'https://tikkunreader.com/reader/#/torah/page/0',
  'https://tikkunreader.com/reader/#/torah/page/1#extra',
  'https://tikkunreader.com/reader/',
])('rejects unsupported or untrusted URL %s', (url) => {
  expect(readingHashFromNativeUrl(url)).toBeNull()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function fixture(launch: Promise<{ url: string } | undefined> = Promise.resolve(undefined)) {
  let emit!: (event: { url: string }) => void
  const remove = vi.fn(async () => {})
  const app = {
    addListener: vi.fn(async (_event: 'appUrlOpen', listener: typeof emit): Promise<{ remove(): Promise<void> }> => {
      emit = listener
      return { remove }
    }),
    getLaunchUrl: vi.fn(() => launch),
  }
  const navigate = vi.fn<(hash: string) => Promise<void>>(async () => {})
  const reportError = vi.fn()
  const loadApp = vi.fn(async () => ({ app }))
  const owner = createNativeReadingLinks({ loadApp, navigate, reportError })
  return { owner, navigate, reportError, remove, app, loadApp, emit: (url: string) => emit({ url }) }
}

test('waits for the launch reading before releasing Reader startup, and subscribes once', async () => {
  const launch = deferred<{ url: string }>()
  const f = fixture(launch.promise)
  let ready = false
  void f.owner.ready.then(() => { ready = true })
  const start = f.owner.start()
  await vi.waitFor(() => expect(f.app.getLaunchUrl).toHaveBeenCalledOnce())
  expect(ready).toBe(false)
  launch.resolve({ url: first })
  await start
  expect(f.navigate).toHaveBeenCalledExactlyOnceWith('#/torah/parsha/beresheet/1-4-19')
  expect(ready).toBe(true)
  await f.owner.start()
  expect(f.app.addListener).toHaveBeenCalledOnce()
  f.owner.destroy()
  expect(f.remove).toHaveBeenCalledOnce()
})

test('does not assimilate a Capacitor plugin proxy as a promise', async () => {
  const f = fixture(Promise.resolve({ url: first }))
  const app = new Proxy(f.app, {
    get(target, key, receiver) {
      if (key === 'then') throw new Error('A plugin proxy must not be awaited')
      return Reflect.get(target, key, receiver)
    },
  })
  f.loadApp.mockResolvedValue({ app })
  await f.owner.start()
  expect(f.reportError).not.toHaveBeenCalled()
  expect(f.navigate).toHaveBeenCalledOnce()
  f.owner.destroy()
})

test('an explicit initial reading skips stale launch lookup but retains warm links', async () => {
  const f = fixture(Promise.resolve({ url: first }))
  const owner = createNativeReadingLinks({ loadApp: f.loadApp, navigate: f.navigate, reportError: f.reportError, readLaunchUrl: false })
  await owner.start()
  expect(f.app.getLaunchUrl).not.toHaveBeenCalled()
  expect(f.navigate).not.toHaveBeenCalled()
  f.emit(second)
  await vi.waitFor(() => expect(f.navigate).toHaveBeenCalledExactlyOnceWith('#/torah/parsha/noach/5-1-1'))
  owner.destroy()
  f.owner.destroy()
})

test('newer open event wins over a stale launch response', async () => {
  const launch = deferred<{ url: string }>()
  const f = fixture(launch.promise)
  const start = f.owner.start()
  await vi.waitFor(() => expect(f.app.getLaunchUrl).toHaveBeenCalledOnce())
  f.emit(second)
  launch.resolve({ url: first })
  await start
  expect(f.navigate).toHaveBeenCalledExactlyOnceWith('#/torah/parsha/noach/5-1-1')
  f.owner.destroy()
})

test('serializes navigation and keeps the newest pending reading', async () => {
  const f = fixture()
  await f.owner.start()
  const navigation = deferred<void>()
  f.navigate.mockImplementationOnce(() => navigation.promise)
  f.emit(first)
  f.emit('https://tikkunreader.com/reader/#/torah/page/10')
  f.emit(second)
  expect(f.navigate).toHaveBeenCalledTimes(1)
  navigation.resolve()
  await vi.waitFor(() => expect(f.navigate).toHaveBeenCalledTimes(2))
  expect(f.navigate).toHaveBeenLastCalledWith('#/torah/parsha/noach/5-1-1')
  f.owner.destroy()
  f.emit(first)
  expect(f.navigate).toHaveBeenCalledTimes(2)
})

test('rejects invalid links without navigating and accepts the next valid link', async () => {
  const f = fixture()
  await f.owner.start()
  f.emit('https://evil.test/reader/#/torah/page/1')
  expect(f.reportError).toHaveBeenCalledOnce()
  expect(f.navigate).not.toHaveBeenCalled()
  f.emit(first)
  await vi.waitFor(() => expect(f.navigate).toHaveBeenCalledOnce())
  f.owner.destroy()
})

test('launch lookup failure does not strand startup or remove the warm listener', async () => {
  const launch = deferred<{ url: string }>()
  const f = fixture(launch.promise)
  const start = f.owner.start()
  await vi.waitFor(() => expect(f.app.getLaunchUrl).toHaveBeenCalledOnce())
  const error = new Error('launch unavailable')
  launch.reject(error)
  await start
  await f.owner.ready
  expect(f.reportError).toHaveBeenCalledWith(error)
  f.emit(first)
  await vi.waitFor(() => expect(f.navigate).toHaveBeenCalledOnce())
  f.owner.destroy()
})

test('teardown during asynchronous registration removes the eventual listener', async () => {
  const registration = deferred<{ remove(): Promise<void> }>()
  const f = fixture()
  f.app.addListener.mockImplementation(() => registration.promise)
  const start = f.owner.start()
  await vi.waitFor(() => expect(f.app.addListener).toHaveBeenCalledOnce())
  f.owner.destroy()
  await f.owner.ready
  registration.resolve({ remove: f.remove })
  await start
  expect(f.remove).toHaveBeenCalledOnce()
  expect(f.app.getLaunchUrl).not.toHaveBeenCalled()
  expect(f.navigate).not.toHaveBeenCalled()
})

test('navigation failure is reported and does not prevent future links', async () => {
  const f = fixture()
  await f.owner.start()
  const error = new Error('route unavailable')
  f.navigate.mockRejectedValueOnce(error)
  f.emit(first)
  await vi.waitFor(() => expect(f.reportError).toHaveBeenCalledWith(error))
  f.emit(second)
  await vi.waitFor(() => expect(f.navigate).toHaveBeenCalledTimes(2))
  f.owner.destroy()
})
