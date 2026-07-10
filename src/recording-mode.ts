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
  const fullViewport = () => ({
    x: 0,
    y: 0,
    width: evenSize(viewport.width),
    height: evenSize(viewport.height),
  })
  if (!contentRect) {
    return fullViewport()
  }

  const contentRight = contentRect.x + contentRect.width
  const contentBottom = contentRect.y + contentRect.height
  if (
    contentRight <= 0 ||
    contentRect.x >= viewport.width ||
    contentBottom <= 0 ||
    contentRect.y >= viewport.height
  ) {
    return fullViewport()
  }

  const contentCenter = contentRect.x + contentRect.width / 2
  const croppedLeft = Math.max(0, Math.floor(contentRect.x - margin))
  const croppedRight = Math.min(viewport.width, Math.ceil(contentRight + margin))
  const width = Math.min(viewport.width, croppedRight - croppedLeft)
  const x = Math.max(0, Math.min(viewport.width - width, Math.floor(contentCenter - width / 2)))

  return {
    x,
    y: 0,
    width: evenSize(width),
    height: evenSize(viewport.height),
  }
}

export function applyRecordingModePreferences(
  preferences: ReaderPreferences
): ReaderPreferences {
  return {
    ...preferences,
    playbackRate: 1,
    autoScrollWithPlayback: true,
    focalPointMode: 'reader',
    disableShiftNekudotHide: false,
    themeMode: 'light',
  }
}
