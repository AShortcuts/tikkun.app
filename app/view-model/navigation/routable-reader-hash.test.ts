import { expect, test } from 'vitest'
import { isSemanticallyRoutableReaderHash } from './routable-reader-hash.ts'

test('accepts routes valid in another supported calendar mode', () => {
  expect(
    isSemanticallyRoutableReaderHash('#/run/2025-04-20:shacharis,main')
  ).toBe(true)
})

test('accepts contextual Parsha refs while rejecting dead routes', () => {
  expect(
    isSemanticallyRoutableReaderHash(
      '#/torah/parsha/haazinu/5-31-28'
    )
  ).toBe(true)
  expect(isSemanticallyRoutableReaderHash('#/torah/page/999999')).toBe(false)
  expect(
    isSemanticallyRoutableReaderHash('#/torah/parsha/not-a-real-parsha')
  ).toBe(false)
  expect(
    isSemanticallyRoutableReaderHash('#/torah/parsha/beresheet/99-99-99')
  ).toBe(false)
})
