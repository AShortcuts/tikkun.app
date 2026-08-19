import { expect, test } from 'vitest'
import { isReaderHash } from './reader-hash.ts'

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
