import { expect, test, vi } from 'vitest'
import { RetryablePromiseCache } from './retryable-promise-cache.ts'

test('deduplicates concurrent loads for the same key', async () => {
  const cache = new RetryablePromiseCache<string, number>()
  const load = vi.fn(async () => 7)

  const first = cache.get('cue', load)
  const second = cache.get('cue', load)

  expect(first).toBe(second)
  await expect(first).resolves.toBe(7)
  expect(load).toHaveBeenCalledTimes(1)
})

test('evicts rejected loads so a later attempt can recover', async () => {
  const cache = new RetryablePromiseCache<string, number>()
  const load = vi
    .fn<() => Promise<number>>()
    .mockRejectedValueOnce(new Error('temporary failure'))
    .mockResolvedValueOnce(9)

  await expect(cache.get('cue', load)).rejects.toThrow('temporary failure')
  await expect(cache.get('cue', load)).resolves.toBe(9)
  expect(load).toHaveBeenCalledTimes(2)
})

test('supports deliberate invalidation without disturbing other entries', async () => {
  const cache = new RetryablePromiseCache<string, number>()
  const load = vi.fn()
    .mockResolvedValueOnce(1)
    .mockResolvedValueOnce(2)

  await expect(cache.get('cue', load)).resolves.toBe(1)
  expect(cache.delete('cue')).toBe(true)
  await expect(cache.get('cue', load)).resolves.toBe(2)
  expect(load).toHaveBeenCalledTimes(2)
})

test('does not let an older load evict a newer replacement', async () => {
  const cache = new RetryablePromiseCache<string, number>()
  const first = cache.get('cue', async () => 1)

  expect(cache.delete('cue', first)).toBe(true)
  const replacement = cache.get('cue', async () => 2)

  expect(cache.delete('cue', first)).toBe(false)
  expect(cache.get('cue', async () => 3)).toBe(replacement)
  await expect(replacement).resolves.toBe(2)
})
