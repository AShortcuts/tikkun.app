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
