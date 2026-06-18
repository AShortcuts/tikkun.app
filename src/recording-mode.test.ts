import test from 'ava'
import {
  applyRecordingModePreferences,
  calculateCaptureRect,
  getRecordingModeConfig,
  recordingModeAliyahLabel,
} from './recording-mode.ts'
import type { ReaderPreferences } from './reader-preferences.ts'

const preferences: ReaderPreferences = {
  narratorId: 'custom-narrator',
  playbackRate: 1.35,
  highlightFill: '#123456',
  highlightOpacity: 0.2,
  outlineColor: '#654321',
  outlineWidth: 3,
  outlineOffset: 2,
  radius: 8,
  glow: 2,
  autoScrollWithPlayback: false,
  focalPointMode: 'browser',
  disableShiftNekudotHide: true,
  themeMode: 'dark',
}

test('recording mode is enabled through search params without changing hash routing', (t) => {
  const config = getRecordingModeConfig(
    new URL('https://example.com/?recording=1&audioId=bereshit-1#/parsha/beresheet')
  )

  t.deepEqual(config, {
    enabled: true,
    audioId: 'bereshit-1',
  })
})

test('recording mode is disabled by default', (t) => {
  const config = getRecordingModeConfig(
    new URL('https://example.com/#/parsha/beresheet')
  )

  t.deepEqual(config, {
    enabled: false,
    audioId: null,
  })
})

test('recording mode locks playback and visual preferences', (t) => {
  t.like(applyRecordingModePreferences(preferences), {
    narratorId: 'custom-narrator',
    playbackRate: 1,
    autoScrollWithPlayback: true,
    disableShiftNekudotHide: false,
    themeMode: 'light',
  })
})

test('recording mode labels the first aliyah as rishon', (t) => {
  t.is(recordingModeAliyahLabel('בראשית', 1), 'ראשון')
  t.is(recordingModeAliyahLabel('שני', 2), 'שני')
  t.is(recordingModeAliyahLabel('סוף ראשון', null), 'סוף ראשון')
})

test('capture rect applies margin and stays inside the viewport', (t) => {
  t.deepEqual(
    calculateCaptureRect({
      contentRect: { x: 300, y: 40, width: 900, height: 1000 },
      viewport: { width: 1280, height: 720 },
      margin: 48,
    }),
    { x: 252, y: 0, width: 996, height: 720 }
  )
})

test('capture rect can crop tightly around narrow centered content', (t) => {
  t.deepEqual(
    calculateCaptureRect({
      contentRect: { x: 710, y: 160, width: 500, height: 500 },
      viewport: { width: 1920, height: 1080 },
      margin: 48,
    }),
    { x: 662, y: 0, width: 596, height: 1080 }
  )
})

test('capture rect uses full viewport when content is offscreen', (t) => {
  t.deepEqual(
    calculateCaptureRect({
      contentRect: { x: 300, y: -1400, width: 900, height: 800 },
      viewport: { width: 1280, height: 720 },
      margin: 48,
    }),
    { x: 0, y: 0, width: 1280, height: 720 }
  )
})

test('capture rect uses full viewport when content is unavailable', (t) => {
  t.deepEqual(
    calculateCaptureRect({
      contentRect: null,
      viewport: { width: 1280, height: 720 },
      margin: 48,
    }),
    { x: 0, y: 0, width: 1280, height: 720 }
  )
})
