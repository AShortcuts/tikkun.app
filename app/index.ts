import { getBrowserStorage } from './persistence/persisted-state.ts'
import { getRecordingModeConfig } from './recording-mode.ts'
import {
  startReaderRuntime,
  type ReaderRuntime,
} from './reader/reader-runtime.ts'

let runtime: ReaderRuntime | null = null

export function startApp() {
  if (runtime) return runtime
  const appRoot = document.querySelector<HTMLElement>(
    '[data-target-id="app-root"]'
  )
  const aboutHref = appRoot?.dataset.aboutHref
  if (!aboutHref) {
    throw new Error('Reader bootstrap requires an About page URL')
  }
  runtime = startReaderRuntime({
    document,
    view: window,
    localStorage: getBrowserStorage('local'),
    sessionStorage: getBrowserStorage('session'),
    recordingMode: getRecordingModeConfig(new URL(window.location.href)),
    aboutHref,
  })
  return runtime
}

export function stopApp() {
  runtime?.destroy()
  runtime = null
}
