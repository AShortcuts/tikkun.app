import { expect, test } from 'vitest'
import { findTidbit, tidbits } from './tidbits.ts'

test('publishes no fabricated Tidbit entries', () => {
  expect(tidbits).toEqual([])
  expect(findTidbit('placeholder')).toBeNull()
})
