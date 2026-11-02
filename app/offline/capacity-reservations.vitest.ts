import { afterEach, expect, test } from 'vitest'
import { CAPACITY_KEY, createCapacityReservations } from './capacity-reservations.ts'

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
