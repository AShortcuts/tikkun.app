import { expect, test } from 'vitest'
import { cuePayloadPathForRecording } from './cue-data.ts'
import type { ParshaAudioRecording } from './types.ts'
import {
  cueContentKeyForPath,
  cueFileNameForRecording,
  cueFileRelativePath,
  cueReadingFolderName,
} from './cue-file.ts'

const recording: ParshaAudioRecording = {
  id: 'lech-lecha-6',
  narratorId: 'yoni-davidov',
  reading: { kind: 'parsha', id: 'lech-lecha', name: 'Lech Lecha' },
  parshaSlug: 'lech-lecha',
  parshaName: 'Lech Lecha',
  aliyah: 6,
  title: 'Lech Lecha 6',
  playSrc: '/lech-lecha-6.m4a',
  downloadSrc: '/lech-lecha-6.m4a',
  format: 'm4a',
  status: 'available',
}

test('uses one cue-file identity for export and runtime lookup', () => {
  expect(cueFileNameForRecording(recording)).toBe('6.json')
  expect(cueFileRelativePath(recording)).toBe(
    'audio-cues/yoni-davidov/03 lech-lecha/6.json'
  )
  expect(cuePayloadPathForRecording(recording)).toBe(
    '../../audio-cues/yoni-davidov/03 lech-lecha/6.json'
  )
})

test('numbers parsha folders in Torah order and keeps update keys unnumbered', () => {
  expect(cueReadingFolderName({ kind: 'parsha', id: 'beresheet', name: 'Beresheet' })).toBe('01 beresheet')
  expect(cueReadingFolderName({ kind: 'parsha', id: 'korach', name: 'Korach' })).toBe('38 korach')
  expect(cueReadingFolderName({ kind: 'parsha', id: 'vezot-haberacha', name: 'Vezot Haberacha' })).toBe('54 vezot-haberacha')
  expect(cueReadingFolderName({ kind: 'range', id: 'korach', name: 'Range' })).toBe('korach')
  expect(cueContentKeyForPath('audio-cues/yoni-davidov/38 korach/1.json')).toBe(
    'audio-cues/yoni-davidov/korach/1.json'
  )
})

test('rejects unsafe path segments and invalid aliyah identities consistently', () => {
  const unsafeNarrator = { ...recording, narratorId: '../future-reader' }
  const invalidAliyah = { ...recording, aliyah: 8 }

  expect(cuePayloadPathForRecording(unsafeNarrator)).toBeNull()
  expect(() => cueFileRelativePath(unsafeNarrator)).toThrow('No cue-file identity')
  expect(cueFileNameForRecording(invalidAliyah)).toBeNull()
  expect(cuePayloadPathForRecording(invalidAliyah)).toBeNull()
  expect(() => cueFileRelativePath(invalidAliyah)).toThrow('No cue-file identity')
})
