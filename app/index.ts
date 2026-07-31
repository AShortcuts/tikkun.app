import { getBrowserStorage } from './persistence/persisted-state.ts'
import { getRecordingModeConfig } from './recording-mode.ts'
import {
  startReaderRuntime,
  type ReaderRuntime,
} from './reader/reader-runtime.ts'

let runtime: ReaderRuntime | null = null

export function startApp() {
  if (runtime) return runtime
  runtime = startReaderRuntime({
    document,
    view: window,
    localStorage: getBrowserStorage('local'),
    sessionStorage: getBrowserStorage('session'),
    recordingMode: getRecordingModeConfig(new URL(window.location.href)),
  })
  return runtime
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp, { once: true })
} else {
  startApp()
}
