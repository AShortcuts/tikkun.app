import { expect, test } from 'vitest'
import { generateTorahReferenceHash } from './torah-reference.ts'

test('generates Torah reference hashes', () => {
  expect(generateTorahReferenceHash({ book: 1, chapter: 1, verse: 1 })).toBe('#/torah/1-1-1')
})
