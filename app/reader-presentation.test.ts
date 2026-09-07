import { expect, test } from 'vitest'
import {
  effectiveReaderSideMode,
  isReaderSideMode,
  isReaderSideOrder,
  isReaderTextLayout,
} from './reader-presentation.ts'

test('keeps layout and side preferences independently validated', () => {
  expect(isReaderTextLayout('reading')).toBe(true)
  expect(isReaderTextLayout('match')).toBe(true)
  expect(isReaderTextLayout('two')).toBe(false)
  expect(isReaderSideMode('one')).toBe(true)
  expect(isReaderSideMode('two')).toBe(true)
  expect(isReaderSideOrder('tikkun-right')).toBe(true)
  expect(isReaderSideOrder('torah-right')).toBe(true)
})

test('temporarily collapses Two Sided only in a compact viewport', () => {
  expect(effectiveReaderSideMode('two', true)).toBe('one')
  expect(effectiveReaderSideMode('two', false)).toBe('two')
  expect(effectiveReaderSideMode('one', false)).toBe('one')
})
