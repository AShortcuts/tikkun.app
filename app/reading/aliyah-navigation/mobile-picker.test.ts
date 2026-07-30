import { expect, test } from 'vitest'
import { getMobileAliyahCapsuleState } from './mobile-picker.ts'

test('maps mobile aliyah playback to default, loaded, and playing states', () => {
  expect(
    getMobileAliyahCapsuleState({ loaded: false, playing: false })
  ).toBe('default')
  expect(
    getMobileAliyahCapsuleState({ loaded: true, playing: false })
  ).toBe('loaded')
  expect(
    getMobileAliyahCapsuleState({ loaded: true, playing: true })
  ).toBe('playing')
})
