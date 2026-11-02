import { afterEach, expect, test, vi } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
import {
  createCueAuthoringPanel,
  type CueAuthoringPanel,
  type CueAuthoringPanelSnapshot,
} from './cue-authoring-panel.ts'

let fixture: HTMLElement | null = null
let destroy: (() => void) | null = null

afterEach(() => {
  destroy?.()
  destroy = null
  fixture?.remove()
  fixture = null
  vi.restoreAllMocks()
})

function snapshot(
  overrides: Partial<CueAuthoringPanelSnapshot> = {}
): CueAuthoringPanelSnapshot {
  return {
    visible: true,
    cueCountText: '2 / 5 Words - 3',
    statusText: 'Reader: 2/5 Words saved. Resume from Word 3.',
    problems: [],
    draftStatusText: 'Local draft active for Reader.',
    syncNoteVisible: true,
    captureAudio: {
      requested: true,
      disabled: false,
      statusText: 'Microphone ready.',
      tone: 'confirm',
    },
    record: {
      disabled: false,
      mode: 'timing',
    },
    canStepBack: true,
    canUndo: true,
    canMarkIssue: true,
    canReset: true,
    canExport: true,
    exportChanged: true,
    resumeWord: 3,
    ...overrides,
  }
}

function mountPanel() {
  fixture = document.createElement('div')
  fixture.innerHTML =
    '<div data-target-id="cue-authoring-panel-root"></div>'
  document.body.appendChild(fixture)
  const action = vi.fn()
  let panel!: CueAuthoringPanel

  destroy = createMount()((scope) => {
    panel = createCueAuthoringPanel(scope, { document, action })
  })

  return { action, panel }
}

function required<ElementType extends Element>(selector: string) {
  const element = fixture?.querySelector<ElementType>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}

test('presents actionable problems with progressive technical details', () => {
  const { action, panel } = mountPanel()
  panel.sync(snapshot({
    problems: [{
      id: 'published-cue-data',
      tone: 'warning',
      title: 'Published cue file needs repair',
      message: 'Published timing was skipped so playback can continue.',
      details: [
        'File: audio-cues/reader/test/1.json',
        'cueCount: cueCount does not match cues.',
      ],
      action: {
        type: 'retry-cue-data',
        label: 'Retry Cue File',
        pendingLabel: 'Checking Cue File...',
        pending: false,
      },
    }],
  }))

  const problem = required<HTMLElement>(
    '[data-admin-problem="published-cue-data"]'
  )
  expect(problem.textContent).toContain('Published cue file needs repair')
  expect(problem.textContent).toContain('Technical details')
  expect(problem.querySelector('details')?.open).toBe(false)

  required<HTMLButtonElement>(
    '[data-admin-problem-action="retry-cue-data"]'
  ).click()
  expect(action).toHaveBeenCalledWith({ type: 'retry-cue-data' })
})
