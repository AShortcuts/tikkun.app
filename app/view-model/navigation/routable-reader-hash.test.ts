import { expect, test } from 'vitest'
import { isSemanticallyRoutableReaderHash } from './routable-reader-hash.ts'

test('accepts routes valid in another supported calendar mode', () => {
  expect(
    isSemanticallyRoutableReaderHash('#/run/2025-04-20:shacharis,main')
  ).toBe(true)
})

test('rejects dead pages, unknown readings, and out-of-reading references', () => {
  expect(isSemanticallyRoutableReaderHash('#/torah/page/999999')).toBe(false)
  expect(
    isSemanticallyRoutableReaderHash('#/torah/parsha/not-a-real-parsha')
  ).toBe(false)
  expect(
    isSemanticallyRoutableReaderHash('#/torah/parsha/beresheet/1-13-1')
  ).toBe(false)
})
