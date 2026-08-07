import { expect, test } from 'vitest'
import { parseHttpByteRange } from './http-byte-range.ts'

test('parses bounded, open-ended, and suffix byte ranges', () => {
  expect(parseHttpByteRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 })
  expect(parseHttpByteRange('bytes=7-', 10)).toEqual({ start: 7, end: 9 })
  expect(parseHttpByteRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 })
})

test('clamps ranges to the available representation', () => {
  expect(parseHttpByteRange('bytes=7-99', 10)).toEqual({ start: 7, end: 9 })
  expect(parseHttpByteRange('bytes=-99', 10)).toEqual({ start: 0, end: 9 })
})

test.each([
  ['items=0-1', 10],
  ['bytes=0-1,4-5', 10],
  ['bytes=-0', 10],
  ['bytes=5-4', 10],
  ['bytes=10-', 10],
  ['bytes=-', 10],
  ['bytes=0-1', 0],
] as const)('rejects an invalid byte range: %s', (header, totalLength) => {
  expect(parseHttpByteRange(header, totalLength)).toBeNull()
})
