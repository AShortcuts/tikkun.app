import { expect, test } from 'vitest'
import { isSemanticallyRoutableReaderHash } from './routable-reader-hash.ts'

test.each(['torah', 'r'])('accepts saved %s references and rejects nonexistent verses', (prefix) => {
  expect(isSemanticallyRoutableReaderHash(`#/${prefix}/5-33-24`)).toBe(true)
  expect(isSemanticallyRoutableReaderHash(`#/${prefix}/5-33-999`)).toBe(false)
  expect(isSemanticallyRoutableReaderHash(`#/${prefix}/6-1-1`)).toBe(false)
})

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
