import { expect, test } from 'vitest'
import slugify from './slugify.ts'

test('slugify lowercases all letters', () => {
  expect(slugify('HelLo') === 'hello').toBeTruthy()
})

test('hyphenates multiple words', () => {
  expect(slugify('Hello all the People') === 'hello-all-the-people').toBeTruthy()
})

test('collapses multiple spaces', () => {
  expect(slugify('multiple      spaces') === 'multiple-spaces').toBeTruthy()
})

test('removes non-alpha-numeric', () => {
  expect(slugify(`k33'#p*( )Th--_i#s`) === 'k33p-this').toBeTruthy()
})
