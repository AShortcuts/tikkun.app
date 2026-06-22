import { expect, test } from 'vitest'
import fuzzy from './fuzzy.ts'

test('only matches if all characters are present in order', () => {
  const haystack = [
    'matches',
    'tam',
    'nope',
    'no chance',
    'walmart',
    'mta',
    'amazing time',
    'nothing',
  ]

  const results = fuzzy(haystack, 'mat')
  const matches = ['matches', 'walmart', 'amazing time']

  expect(matches.every((match) => results.map((r) => r.item).includes(match))).toBe(true)
  expect(results.length).toBe(matches.length)
})

test('prioritizes matches that are closer together (all same-length strings)', () => {
  const haystack = ['a_b_c', 'a_bc_', 'a__bc', 'abc__', 'ab_c_', 'ab__c']

  const results = fuzzy(haystack, 'abc')
  const matches = ['abc__', 'ab_c_', 'a_bc_', 'ab__c', 'a_b_c', 'a__bc']

  expect(results.map((r) => r.item)).toEqual(matches)
})

test('prioritizes matches that are closer to the start of the string', () => {
  const haystack = ['a_bc_', '_abc_', '__abc', '_ab_c_', 'abc__', 'a__bc']

  const results = fuzzy(haystack, 'abc')
  const matches = ['abc__', '_abc_', '__abc', '_ab_c_', 'a_bc_', 'a__bc']

  expect(results.map((r) => r.item)).toEqual(matches)
})

test('returns the match indexes', () => {
  const haystack = ['c_d_ef__', '__cd_ef']

  const results = fuzzy(haystack, 'cdef')

  expect(results.map(({ match }) => match.indexes)).toEqual([
      [2, 3, 5, 6],
      [0, 2, 4, 5],
    ])
})

test('accepts an arbitrary item and a function for how to search it', () => {
  const haystack = [
    { lang: 'English', val: 'Hello' },
    { lang: 'Spanish', val: 'Hola' },
    { lang: 'French', val: 'Bonjour' },
  ]

  const results = fuzzy(haystack, 'en', (obj) => [obj.lang])

  expect(results.map((r) => r.item)).toEqual([
      { lang: 'English', val: 'Hello' },
      { lang: 'French', val: 'Bonjour' },
    ])
})

test('searches case insensitively', () => {
  const haystack = ['Abcd', 'a_bcd']

  expect(fuzzy(haystack, 'abc').map((r) => r.item)).toEqual(['Abcd', 'a_bcd'])
  expect(fuzzy(haystack, 'ABc').map((r) => r.item)).toEqual(['Abcd', 'a_bcd'])
})

test('searches multiple acceptable forms and matches the best form', () => {
  const haystack = [
    { primary: 'color', alternative: 'colour' },
    { primary: 'escalator', alternative: 'lift' },
    { primary: 'if', alternative: 'perhaps' },
  ]

  const results = fuzzy(haystack, 'if', (obj) => [obj.primary, obj.alternative])

  expect(results.map((r) => r.item)).toEqual([
      { primary: 'if', alternative: 'perhaps' },
      { primary: 'escalator', alternative: 'lift' },
    ])

  expect(results.map((r) => r.match)).toEqual([
      { index: 0, indexes: [0, 1] },
      { index: 1, indexes: [1, 2] },
    ])
})
