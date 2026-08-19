import { readStorageItem } from '../persistence/persisted-state.ts'

// Convenience gate only. This code ships to every browser and must never
// authorize privileged data or network operations.
const LOCAL_AUTHORING_UNLOCK_CODE = 'admin'
export const CUE_AUTHORING_UNLOCKED_KEY = 'tikkun-admin-unlocked'
export const CUE_AUTHORING_PANEL_OPEN_KEY = 'tikkun-admin-panel-open'

export function verifyCueAuthoringUnlockCode(candidate: string) {
  return candidate === LOCAL_AUTHORING_UNLOCK_CODE
}

export function isCueAuthoringToggleShortcut(event: KeyboardEvent) {
  return (
    event.ctrlKey &&
    event.shiftKey &&
    event.key.toLowerCase() === 'a'
  )
}

export function readCueAuthoringAccessState(storage: Storage | null) {
  try {
    const unlocked =
      readStorageItem(storage, CUE_AUTHORING_UNLOCKED_KEY) === '1'
    return {
      unlocked,
      panelOpen:
        unlocked &&
        readStorageItem(storage, CUE_AUTHORING_PANEL_OPEN_KEY) === '1',
    }
  } catch (error) {
    console.error('Failed to read local Cue Authoring access', error)
    return { unlocked: false, panelOpen: false }
  }
}
