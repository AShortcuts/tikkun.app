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

test('owns panel presentation while preserving its nested mount targets', () => {
  const { panel } = mountPanel()
  const panelElement = required<HTMLElement>(
    '[data-target-id="admin-panel"]'
  )
  expect(panelElement.classList.contains('u-hidden')).toBe(true)

  const cueListRoot = required<HTMLElement>(
    '[data-target-id="admin-cue-list-root"]'
  )
  const waveformBars = required<HTMLElement>(
    '[data-target-id="admin-waveform-bars"]'
  )
  const recordButton = required<HTMLButtonElement>(
    '[data-target-id="admin-record"]'
  )

  panel.sync(snapshot())

  expect(panelElement.classList.contains('u-hidden')).toBe(false)
  expect(
    required('[data-target-id="admin-cue-count"]').textContent
  ).toBe('2 / 5 Words - 3')
  expect(required('[data-target-id="admin-status"]').textContent).toContain(
    '2/5 Words saved'
  )
  expect(
    required('[data-target-id="admin-draft-status"]').textContent
  ).toContain('Local draft active')
  expect(
    required<HTMLInputElement>(
      '[data-target-id="admin-capture-audio"]'
    ).checked
  ).toBe(true)
  expect(
    required('[data-target-id="admin-audio-capture-status"]').classList
  ).toContain('mod-confirm')
  expect(recordButton.classList).toContain('is-recording')
  expect(recordButton.getAttribute('aria-label')).toBe(
    'Stop recording word timings and switch to playback review'
  )
  expect(
    recordButton
      .closest('.admin-icon-control')
      ?.querySelector('.admin-icon-caption')?.textContent
  ).toContain('Stop Recording')
  expect(
    required<HTMLElement>('[data-target-id="admin-resume-wrap"]').hidden
  ).toBe(false)
  expect(
    required('[data-target-id="admin-resume-draft"]').getAttribute(
      'aria-label'
    )
  ).toBe('Resume timing draft from Word 3')
  expect(
    required<HTMLElement>('[data-target-id="admin-sync-note"]').hidden
  ).toBe(false)
  expect(
    required('[data-target-id="admin-export"]').classList
  ).toContain('has-local-cue-diff')

  recordButton.focus()
  panel.sync(
    snapshot({
      record: { disabled: false, mode: 'confirm' },
      captureAudio: {
        requested: false,
        disabled: true,
        statusText: 'Microphone failed.',
        tone: 'error',
      },
      syncNoteVisible: false,
      resumeWord: null,
      exportChanged: false,
    })
  )

  expect(
    required('[data-target-id="admin-record"]')
  ).toBe(recordButton)
  expect(document.activeElement).toBe(recordButton)
  expect(recordButton.classList).toContain('is-confirming')
  expect(recordButton.classList).not.toContain('is-recording')
  expect(recordButton.getAttribute('aria-label')).toBe(
    'Confirm a fresh synchronized microphone audio and timing pass'
  )
  expect(
    required('[data-target-id="admin-audio-capture-status"]').classList
  ).toContain('mod-error')
  expect(
    required<HTMLElement>('[data-target-id="admin-resume-wrap"]').hidden
  ).toBe(true)
  expect(
    required('[data-target-id="admin-cue-list-root"]')
  ).toBe(cueListRoot)
  expect(
    required('[data-target-id="admin-waveform-bars"]')
  ).toBe(waveformBars)
})

test('emits semantic actions and honors disabled controls', () => {
  const { action, panel } = mountPanel()
  required<HTMLButtonElement>('[data-target-id="admin-record"]').click()
  expect(action).not.toHaveBeenCalled()

  panel.sync(snapshot())
  required<HTMLButtonElement>('[data-target-id="admin-close"]').click()
  required<HTMLInputElement>(
    '[data-target-id="admin-capture-audio"]'
  ).click()
  required<HTMLButtonElement>('[data-target-id="admin-record"]').click()
  required<HTMLButtonElement>(
    '[data-target-id="admin-step-back"]'
  ).click()
  required<HTMLButtonElement>('[data-target-id="admin-undo"]').click()
  required<HTMLButtonElement>(
    '[data-target-id="admin-mark-issue"]'
  ).click()
  required<HTMLButtonElement>('[data-target-id="admin-reset"]').click()
  required<HTMLButtonElement>(
    '[data-target-id="admin-resume-draft"]'
  ).click()
  required<HTMLButtonElement>('[data-target-id="admin-export"]').click()

  expect(action.mock.calls.map(([command]) => command)).toEqual([
    { type: 'close' },
    { type: 'capture-audio', requested: false },
    { type: 'record' },
    { type: 'step-back' },
    { type: 'undo' },
    { type: 'mark-issue' },
    { type: 'reset' },
    { type: 'resume' },
    { type: 'export' },
  ])
})

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

test('updates progress without replacing controls or waveform targets', () => {
  const { panel } = mountPanel()
  const progress = required<HTMLElement>(
    '[data-target-id="admin-progress"]'
  )
  const waveformLane = required<HTMLElement>(
    '[data-target-id="admin-waveform-lane"]'
  )
  const closeButton = required<HTMLButtonElement>(
    '[data-target-id="admin-close"]'
  )
  closeButton.focus()

  panel.syncProgress({
    wordLabel: '4 / 12',
    durationLabel: '0:18 / 1:00',
    audioRatio: 0.3,
    cueRatio: 1 / 3,
  })

  expect(
    required('[data-target-id="admin-meta-cues"]').textContent
  ).toBe('4 / 12')
  expect(
    required('[data-target-id="admin-meta-duration"]').textContent
  ).toBe('0:18 / 1:00')
  expect(progress.style.getPropertyValue('--audio-progress-ratio')).toBe(
    '0.3'
  )
  expect(Number(progress.style.getPropertyValue('--cue-progress-ratio'))).toBe(
    1 / 3
  )
  expect(
    required('[data-target-id="admin-waveform-lane"]')
  ).toBe(waveformLane)
  expect(
    required('[data-target-id="admin-close"]')
  ).toBe(closeButton)
  expect(document.activeElement).toBe(closeButton)

  destroy?.()
  destroy = null
  expect(
    required('[data-target-id="cue-authoring-panel-root"]').childNodes
  ).toHaveLength(0)
})
