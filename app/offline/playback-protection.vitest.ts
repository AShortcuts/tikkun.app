import { expect, test } from 'vitest'
import { createPlaybackProtection } from './playback-protection.ts'
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
