import { expect, test } from 'vitest'
import { defaultReaderPreferences, mergeReaderPreferences } from './reader-preferences.ts'

test('motion preferences merge without changing cue or highlight appearance preferences', () => {
  const preferences = mergeReaderPreferences(defaultReaderPreferences, { reducedMotion: 'on' })
  expect(preferences).toEqual({ ...defaultReaderPreferences, reducedMotion: 'on' })
})
