import { expect, test } from 'vitest'
import { createPlaybackProtection, playbackLockName } from './playback-protection.ts'
import { renderRecordingMutationLocks } from '../../scripts/recording-mutation-locks.mjs'

interface WorkerLocks {
  withUnusedRecordings<T>(urls: readonly string[], task: () => Promise<T>): Promise<T>
  withRecordingSave<T>(url: string, signal: AbortSignal | undefined, task: () => Promise<T>): Promise<T>
}
const worker = (): WorkerLocks => new Function('self', `${renderRecordingMutationLocks(crypto.randomUUID())}; return {withUnusedRecordings, withRecordingSave}`)(globalThis)
const abortSignal = () => new AbortController().signal

test('protects every unique segment through pauses and blocks whole bulk removal before any deletion', async () => {
  const base = `https://tikkun.test/${crypto.randomUUID()}/`
  const urls = ['first', 'later'].map((name) => new URL(name, base).href)
  const protect = createPlaybackProtection(navigator.locks, base)
  const first = await protect(['first', 'later', 'first', 'blob:test'], abortSignal())
  const second = await protect(['first'], abortSignal())
  const api = worker()
  let deleted = false
  try {
    expect((await navigator.locks.query()).held?.filter((lock) => lock.name?.includes(base))).toHaveLength(3)
    await expect(api.withUnusedRecordings([urls[1]], async () => { deleted = true })).rejects.toThrow('open for playback')
    await expect(api.withUnusedRecordings([new URL('unrelated', base).href, ...urls], async () => { deleted = true })).rejects.toThrow('open for playback')
    expect(deleted).toBe(false)
    await api.withUnusedRecordings([new URL('unrelated', base).href], async () => {})
    // Saving an offline copy while it is playing must remain possible.
    await api.withRecordingSave(urls[0], undefined, async () => {})
    first()
    await expect(api.withUnusedRecordings([urls[0]], async () => {})).rejects.toThrow('open for playback')
  } finally { first(); second() }
  await expect.poll(async () => (await navigator.locks.query()).held?.filter((lock) => lock.name?.includes(base))).toEqual([])
  await api.withUnusedRecordings(urls, async () => {})
  expect((await navigator.locks.query()).held?.filter((lock) => lock.name?.includes(base))).toEqual([])
})

test('cancelling partial acquisition releases granted locks and never installs a later lease', async () => {
  const base = `https://tikkun.test/${crypto.randomUUID()}/`
  let releaseRemoval!: () => void, entered!: () => void
  const held = new Promise<void>((resolve) => { releaseRemoval = resolve })
  const ready = new Promise<void>((resolve) => { entered = resolve })
  const removing = navigator.locks.request(playbackLockName(new URL('later', base).href), () => { entered(); return held })
  await ready
  const controller = new AbortController()
  const acquisition = createPlaybackProtection(navigator.locks, base)(['first', 'later'], controller.signal)
  const cancelled = expect(acquisition).rejects.toMatchObject({ name: 'AbortError' })
  try {
    await expect.poll(async () => (await navigator.locks.query()).pending?.filter((lock) => lock.name?.includes(base)).length).toBe(1)
    controller.abort()
    await cancelled
  } finally { controller.abort(); releaseRemoval(); await removing }
  await expect.poll(async () => (await navigator.locks.query()).held?.filter((lock) => lock.name?.includes(base))).toEqual([])
  expect((await navigator.locks.query()).pending?.filter((lock) => lock.name?.includes(base))).toEqual([])
})

test('failed acquisition releases other granted leases instead of leaving partial protection', async () => {
  const base = `https://tikkun.test/${crypto.randomUUID()}/`
  // Invalid lock managers must not be treated as successful protection.
  const locks = new Proxy(navigator.locks, {
    get(target, property) {
      if (property === 'request') return (name: string, options: LockOptions, callback: LockGrantedCallback<unknown>) =>
        name.endsWith('later') ? Promise.reject(new Error('lock failure')) : target.request(name, options, callback)
      return Reflect.get(target, property, target)
    },
  })
  await expect(createPlaybackProtection(locks, base)(['first', 'later'], abortSignal())).rejects.toThrow('lock failure')
  await expect.poll(async () => (await navigator.locks.query()).held?.filter((lock) => lock.name?.includes(base))).toEqual([])
  expect((await navigator.locks.query()).pending?.filter((lock) => lock.name?.includes(base))).toEqual([])
})
