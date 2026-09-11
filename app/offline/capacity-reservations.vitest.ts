import { afterEach, expect, test } from 'vitest'
import { CAPACITY_KEY, capacityRequired, createCapacityReservations } from './capacity-reservations.ts'

const asset = (id: string, byteLength = 10_000_000) => ({ url: `https://tikkun.test/${id}`, byteLength })
const releases: (() => Promise<void>)[] = []
afterEach(async () => {
  await Promise.all(releases.splice(0).map((release) => release()))
  localStorage.removeItem(CAPACITY_KEY)
})
const reserve = async (assets = [asset('one')], availableBytes: number | null = 60_000_000) => {
  const release = await createCapacityReservations(localStorage, navigator.locks)
    .reserve(async () => ({ assets, availableBytes }), new AbortController().signal)
  releases.push(release)
  return release
}

test('concurrent owners cannot both spend the same capacity; shared files count once', async () => {
  const results = await Promise.allSettled([reserve(), reserve([asset('two')])])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
  const records = JSON.parse(localStorage.getItem(CAPACITY_KEY)!)
  await reserve(records[0].assets)
  await Promise.all(releases.splice(0).map((release) => release()))
  await reserve([asset('two')])
})

test('dead-owner records are reclaimed, unknown space stays usable, and release is idempotent', async () => {
  localStorage.setItem(CAPACITY_KEY, JSON.stringify([{ owner: crypto.randomUUID(), assets: [asset('dead', 1_000_000_000)] }]))
  const release = await reserve()
  expect(JSON.parse(localStorage.getItem(CAPACITY_KEY)!)).toHaveLength(1)
  await release(); await release()
  expect(JSON.parse(localStorage.getItem(CAPACITY_KEY)!)).toEqual([])
  await reserve([asset('large', 1_000_000_000)], null)
})

test('invalid persistence and failed measurement do not leak locks or overwrite data', async () => {
  const capacity = createCapacityReservations(localStorage, navigator.locks)
  const signal = new AbortController().signal
  await expect(capacity.reserve(async () => { throw new Error('Offline') }, signal)).rejects.toThrow('Offline')
  localStorage.setItem(CAPACITY_KEY, 'invalid')
  await expect(reserve()).rejects.toThrow('invalid')
  expect(localStorage.getItem(CAPACITY_KEY)).toBe('invalid')
  expect((await navigator.locks.query()).held?.filter((lock) => lock.name?.startsWith(CAPACITY_KEY))).toEqual([])
  expect(capacityRequired([asset('one'), asset('one')])).toBe(53_554_432)
  expect(() => capacityRequired([asset('bad', -1)])).toThrow('Invalid')
  expect(() => capacityRequired([asset('huge', Number.MAX_SAFE_INTEGER)])).toThrow('too large')
  const controller = new AbortController(); controller.abort()
  await expect(capacity.reserve(async () => ({ assets: [], availableBytes: 0 }), controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
})
