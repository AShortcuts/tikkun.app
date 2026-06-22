import { expect, test } from 'vitest'
import hebrewNumeralFromInteger from './hebrew-numeral.ts'

test('exact value returns the letter', () => {
  expect(hebrewNumeralFromInteger(4)).toBe('ד')
})

test('exact value returns the letter (again)', () => {
  expect(hebrewNumeralFromInteger(30)).toBe('ל')
})

test('two character numbers', () => {
  expect(hebrewNumeralFromInteger(42)).toBe('מב')
})

test('טו gets special treatment', () => {
  expect(hebrewNumeralFromInteger(15)).toBe('טו')
})

test('טז gets special treatment', () => {
  expect(hebrewNumeralFromInteger(16)).toBe('טז')
})

test('three character numbers', () => {
  expect(hebrewNumeralFromInteger(421)).toBe('תכא')
})
