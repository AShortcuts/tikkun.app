import { expect, test, vi } from 'vitest'
import {
  CUE_AUTHORING_PANEL_OPEN_KEY,
  CUE_AUTHORING_UNLOCKED_KEY,
  readCueAuthoringAccessState,
} from './access.ts'

test('reads a saved local authoring convenience state', () => {
  const storage = {
    getItem(key: string) {
      return [CUE_AUTHORING_UNLOCKED_KEY, CUE_AUTHORING_PANEL_OPEN_KEY].includes(key)
        ? '1'
        : null
    },
  } as Storage

  expect(readCueAuthoringAccessState(storage)).toEqual({
    unlocked: true,
    panelOpen: true,
  })
})

test('keeps the Reader usable when session storage is unavailable', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})

  expect(readCueAuthoringAccessState(null)).toEqual({
    unlocked: false,
    panelOpen: false,
  })
  expect(log).toHaveBeenCalledWith(
    'Failed to read local Cue Authoring access',
    expect.any(Error)
  )
})
