import { expect, test } from 'vitest'
import { cuePayloadPathForRecording } from '../data/audio-cues/index.ts'
import type { ParshaAudioRecording } from './types.ts'
import {
  aliyahFileKey,
  cueFileNameForRecording,
  cueFileRelativePath,
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
  expect(cueFileNameForRecording(recording)).toBe('lech-lecha-ו-yd.json')
  expect(cueFileRelativePath(recording)).toBe(
    'src/data/audio-cues/lech-lecha/lech-lecha-ו-yd.json'
  )
  expect(cuePayloadPathForRecording(recording)).toBe(
    './lech-lecha/lech-lecha-ו-yd.json'
  )
})

test('rejects unsupported narrator and aliyah identities consistently', () => {
  const unknownNarrator = { ...recording, narratorId: 'future-reader' }
  const invalidAliyah = { ...recording, aliyah: 8 }

  expect(cueFileNameForRecording(unknownNarrator)).toBeNull()
  expect(cuePayloadPathForRecording(unknownNarrator)).toBeNull()
  expect(() => cueFileRelativePath(unknownNarrator)).toThrow('No cue-file identity')
  expect(aliyahFileKey(8)).toBeNull()
  expect(cueFileNameForRecording(invalidAliyah)).toBeNull()
  expect(cuePayloadPathForRecording(invalidAliyah)).toBeNull()
  expect(() => cueFileRelativePath(invalidAliyah)).toThrow('No cue-file identity')
})
