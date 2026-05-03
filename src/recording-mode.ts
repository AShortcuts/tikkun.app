import type { ReaderPreferences } from './reader-preferences.ts'

export interface RecordingModeConfig {
  enabled: boolean
  audioId: string | null
}

export function getRecordingModeConfig(url = new URL(window.location.href)): RecordingModeConfig {
  const enabled = url.searchParams.get('recording') === '1'
  return {
    enabled,
    audioId: enabled ? url.searchParams.get('audioId') : null,
  }
}

export function applyRecordingModePreferences(
  preferences: ReaderPreferences
): ReaderPreferences {
  return {
    ...preferences,
    playbackRate: 1,
    autoScrollWithPlayback: true,
    disableShiftNekudotHide: false,
    themeMode: 'light',
  }
}
