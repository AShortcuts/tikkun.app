import type { ReaderPreferences } from './reader-preferences.ts'

export interface RecordingModeConfig {
  enabled: boolean
  audioId: string | null
}

export interface CaptureRect {
  x: number
  y: number
  width: number
  height: number
}

export function recordingModeAliyahLabel(label: string, aliyahIndex: number | null) {
  return aliyahIndex === 1 ? 'ראשון' : label
}

export function getRecordingModeConfig(url = new URL(window.location.href)): RecordingModeConfig {
  const enabled = url.searchParams.get('recording') === '1'
  return {
    enabled,
    audioId: enabled ? url.searchParams.get('audioId') : null,
  }
}

export function calculateCaptureRect({
  contentRect,
  viewport,
  margin,
}: {
  contentRect: CaptureRect | null
  viewport: { width: number; height: number }
  margin: number
}): CaptureRect {
  const evenSize = (value: number) => Math.max(2, Math.floor(value / 2) * 2)
  if (!contentRect) {
    return {
      x: 0,
      y: 0,
      width: evenSize(viewport.width),
      height: evenSize(viewport.height),
    }
  }

  const x = Math.max(0, Math.floor(contentRect.x - margin))
  const y = Math.max(0, Math.floor(contentRect.y - margin))
  const right = Math.min(
    viewport.width,
    Math.ceil(contentRect.x + contentRect.width + margin)
  )
  const bottom = Math.min(
    viewport.height,
    Math.ceil(contentRect.y + contentRect.height + margin)
  )

  return {
    x,
    y,
    width: evenSize(right - x),
    height: evenSize(bottom - y),
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
