import { readStorageItem } from '../persistence/persisted-state.ts'

const encodedAdminPassword = [98, 99, 110, 104, 111]
export const CUE_AUTHORING_UNLOCKED_KEY = 'tikkun-admin-unlocked'
export const CUE_AUTHORING_PANEL_OPEN_KEY = 'tikkun-admin-panel-open'

function decodePassword(encoded: number[]) {
  return encoded
    .map((codePoint, index) => String.fromCharCode(codePoint + (index % 2 === 0 ? -1 : 1)))
    .join('')
}

export function verifyAdminPassword(candidate: string) {
  return candidate === decodePassword(encodedAdminPassword)
}

export function isCueAuthoringToggleShortcut(event: KeyboardEvent) {
  return (
    event.ctrlKey &&
    event.shiftKey &&
    event.key.toLowerCase() === 'a'
  )
}

export function readCueAuthoringAccessState(storage: Storage | null) {
  const unlocked =
    readStorageItem(storage, CUE_AUTHORING_UNLOCKED_KEY) === '1'
  return {
    unlocked,
    panelOpen:
      unlocked &&
      readStorageItem(storage, CUE_AUTHORING_PANEL_OPEN_KEY) === '1',
  }
}
