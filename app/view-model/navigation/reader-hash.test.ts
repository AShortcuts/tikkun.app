import { expect, test } from 'vitest'
import {
  isReaderHash,
  isSemanticParshaHash,
  preserveSemanticParshaRoute,
} from './reader-hash.ts'

test.each([
  '#/run/2026-10-17:shacharis,main',
  '#/torah/parsha/noach',
  '#/esther/megillah-esther',
  '#/r/1-1-1',
])('accepts reader hash %s', (hash) => {
  expect(isReaderHash(hash)).toBe(true)
})

test.each([
  '#/torah/not-a-route',
  '#/torah/parsha/',
  '#/torah/parsha/noach/not-a-ref',
  '#/torah/page/0',
  '#/esther/page/-1',
  '#/run/id/1-2',
  '#/r/1-2-3/extra',
])('rejects malformed reader hash %s', (hash) => {
  expect(isReaderHash(hash)).toBe(false)
})

test.each(['#/about', '#/next', '/reader/#/torah/page/1', '', null])(
  'rejects non-reader hash %s',
  (hash) => {
    expect(isReaderHash(hash)).toBe(false)
  }
)

test.each([
  '#/torah/parsha/haazinu/5-32-1',
  '#/esther/megillah-esther/1-1-1',
])('recognizes semantic parsha hash %s', (hash) => {
  expect(isSemanticParshaHash(hash)).toBe(true)
})

test.each([
  '#/run/2026-09-05:shacharis,main/5-31-20',
  '#/r/5-31-20',
  '#/torah/page/242',
  '#/esther/page/1',
])('does not treat non-parsha reader hash %s as semantic', (hash) => {
  expect(isSemanticParshaHash(hash)).toBe(false)
})

test('keeps the active parsha route while adopting a scrolled run reference', () => {
  expect(
    preserveSemanticParshaRoute(
      '#/torah/parsha/haazinu/5-32-1',
      '#/run/2026-09-05:shacharis,main/5-31-28'
    )
  ).toBe('#/torah/parsha/haazinu/5-31-28')
})

test('allows a semantic route to promote across a parsha boundary', () => {
  expect(
    preserveSemanticParshaRoute(
      '#/torah/parsha/beresheet/1-5-25',
      '#/torah/parsha/noach/1-6-9'
    )
  ).toBe('#/torah/parsha/noach/1-6-9')
})
