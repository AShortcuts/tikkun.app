import { afterEach, expect, test, vi } from 'vitest'
import type { ParshaAudioRecording, WordCue } from '../audio/types.ts'
import { createMount } from '../lifecycle/mount.ts'
import { TOKENIZATION_VERSION } from '../reader-preferences.ts'
import {
  AudioController,
  createActiveAudioSession,
} from '../reading/audio-controller.ts'
import { HighlightController } from '../reading/highlight-controller.ts'
import { buildPlaybackPlan } from '../reading/playback-plan.ts'
import { createCueAuthoring, type CueAuthoring } from './cue-authoring.ts'

let fixture: HTMLElement | null = null
let destroy: (() => void) | null = null

afterEach(() => {
  destroy?.()
  destroy = null
  fixture?.remove()
  fixture = null
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

test('owns its DOM listeners across replacement mounts without duplicating editor UI', () => {
  const { audioController, highlightController } = createFixture()
  const mount = createMount()
  const firstRestore = vi.fn(async () => {})
  const secondRestore = vi.fn(async () => {})
  let first: CueAuthoring | null = null
  let second: CueAuthoring | null = null

  mount((scope) => {
    first = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        restoreReaderSession: firstRestore,
      })
    )
  })
  first!.setVisible(true)

  destroy = mount((scope) => {
    second = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        restoreReaderSession: secondRestore,
      })
    )
  })
  second!.setVisible(true)
  required<HTMLButtonElement>('[data-target-id="admin-close"]').click()

  expect(
    document.querySelectorAll('[data-target-id="admin-draft-status"]')
  ).toHaveLength(1)
  expect(firstRestore).not.toHaveBeenCalled()
  expect(secondRestore).toHaveBeenCalledTimes(1)
  expect(second!.isVisible()).toBe(false)
})

test('restores access and binds a validated local Cue Draft to one authoring session', async () => {
  const { audioController, highlightController } = createFixture()
  const prepareAuthoringSession = vi.fn(async () => {})
  let cueAuthoring: CueAuthoring | null = null

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        prepareAuthoringSession,
      })
    )
  })

  sessionStorage.setItem('tikkun-admin-unlocked', '1')
  sessionStorage.setItem('tikkun-admin-panel-open', '1')
  cueAuthoring!.restoreAccessState()
  expect(cueAuthoring!.isActive()).toBe(true)
  expect(prepareAuthoringSession).toHaveBeenCalledTimes(1)

  const tokenKeys = ['1:0:0:0', '1:0:0:1']
  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: {
        recording: recording('current', 1),
        cues: [cue(tokenKeys[0], 0)],
      },
    })!
  )
  const draftCues = [cue(tokenKeys[0], 0), cue(tokenKeys[1], 3.25)]
  localStorage.setItem(
    'tikkun-admin-draft:current',
    JSON.stringify({
      audioId: 'current',
      tokenCount: tokenKeys.length,
      tokenPointer: 1,
      tokenizationVersion: TOKENIZATION_VERSION,
      updatedAt: 100,
      cues: draftCues,
    })
  )

  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring!.bindSession(session)

  expect(session.cues).toEqual(draftCues)
  expect(
    required<HTMLElement>('[data-target-id="admin-cue-count"]')
      .textContent
  ).toBe('2 / 2 Words - 2')
  expect(document.querySelectorAll('[data-admin-cue-index]')).toHaveLength(2)

  required<HTMLButtonElement>('[data-target-id="admin-record"]').click()
  expect(cueAuthoring!.isRecording()).toBe(true)
})

test('owns the admin shortcut, access check, and panel toggle', () => {
  const { audioController, highlightController } = createFixture()
  const prompt = vi.spyOn(window, 'prompt').mockReturnValue('admin')
  let cueAuthoring: CueAuthoring | null = null

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController)
    )
  })

  const openEvent = new KeyboardEvent('keydown', {
    key: 'a',
    ctrlKey: true,
    shiftKey: true,
    cancelable: true,
  })
  expect(cueAuthoring!.handleKeydown(openEvent)).toBe(true)
  expect(openEvent.defaultPrevented).toBe(true)
  expect(prompt).toHaveBeenCalledWith('Admin password')
  expect(cueAuthoring!.isActive()).toBe(true)
  expect(sessionStorage.getItem('tikkun-admin-unlocked')).toBe('1')
  expect(sessionStorage.getItem('tikkun-admin-panel-open')).toBe('1')

  const closeEvent = new KeyboardEvent('keydown', {
    key: 'A',
    ctrlKey: true,
    shiftKey: true,
    cancelable: true,
  })
  expect(cueAuthoring!.handleKeydown(closeEvent)).toBe(true)
  expect(cueAuthoring!.isVisible()).toBe(false)
  expect(prompt).toHaveBeenCalledTimes(1)
})

function createOptions(
  audioController: AudioController,
  highlightController: HighlightController,
  overrides: Partial<
    Parameters<typeof createCueAuthoring>[1]
  > = {}
): Parameters<typeof createCueAuthoring>[1] {
  return {
    document,
    view: window,
    audioController,
    highlightController,
    localStorage,
    sessionStorage,
    prepareAuthoringSession: async () => {},
    restoreReaderSession: async () => {},
    playNetworkRecording: async () => {},
    getAutoScroll: () => false,
    getActiveTokenKey: () => tokenKeys[0],
    getDisplayTime: () => audioController.currentTime,
    getRecordingIssues: () => [],
    focusReader: () => {},
    formatDuration: (seconds) => `0:${String(Math.floor(seconds)).padStart(2, '0')}`,
    onChange: () => {},
    onCueNavigationChange: () => {},
    onRecordingIssuesChanged: () => {},
    showPersistenceNotice: () => {},
    ...overrides,
  }
}

const tokenKeys = ['1:0:0:0', '1:0:0:1']

function createFixture() {
  fixture = document.createElement('div')
  fixture.innerHTML = `
    <main data-target-id="tikkun-book" tabindex="-1">
      <span class="word" data-token-key="${tokenKeys[0]}">First</span>
      <span class="word" data-token-key="${tokenKeys[1]}">Second</span>
    </main>
    <aside class="admin-panel u-hidden" data-target-id="admin-panel">
      <span data-target-id="admin-cue-count">0 Words</span>
      <button data-target-id="admin-close"></button>
      <div data-target-id="admin-status"></div>
      <input type="checkbox" data-target-id="admin-capture-audio" />
      <div data-target-id="admin-audio-capture-status"></div>
      <button data-target-id="admin-record"></button>
      <button data-target-id="admin-step-back"></button>
      <button data-target-id="admin-undo"></button>
      <button data-target-id="admin-mark-issue"></button>
      <button data-target-id="admin-reset"></button>
      <button data-target-id="admin-export"></button>
    </aside>
    <div class="u-hidden" data-target-id="recording-issue-modal">
      <button data-target-id="recording-issue-close"></button>
      <div data-target-id="recording-issue-options"></div>
      <input data-target-id="recording-issue-note" />
      <input type="checkbox" data-target-id="recording-issue-reader-visible" checked />
    </div>
    <div class="u-hidden" data-target-id="export-modal">
      <button data-target-id="export-close"></button>
      <a data-target-id="export-download"></a>
      <a data-target-id="export-audio-download"></a>
      <div data-target-id="export-audio-status"></div>
      <div data-target-id="export-target-path"></div>
      <div data-target-id="export-copy-status"></div>
      <textarea data-target-id="export-text"></textarea>
    </div>
    <audio data-target-id="reader-audio"></audio>
  `
  document.body.appendChild(fixture)
  const audioController = new AudioController(
    required<HTMLAudioElement>('[data-target-id="reader-audio"]')
  )
  const highlightController = new HighlightController(
    required<HTMLElement>('[data-target-id="tikkun-book"]')
  )
  return { audioController, highlightController }
}

function required<ElementType extends Element>(selector: string) {
  const element = document.querySelector<ElementType>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}

function recording(
  id: string,
  aliyah: number
): ParshaAudioRecording {
  return {
    id,
    narratorId: 'reader',
    reading: { kind: 'parsha', id: 'test', name: 'Test' },
    parshaSlug: 'test',
    parshaName: 'Test',
    aliyah,
    title: id,
    playSrc: `/${id}.mp3`,
    downloadSrc: `/${id}.mp3`,
    format: 'mp3',
    status: 'available',
  }
}

function cue(key: string, timeStart: number): WordCue {
  const [pageNumber, lineIndex, fragmentIndex, wordIndex] = key
    .split(':')
    .map(Number)
  return {
    pageNumber,
    lineIndex,
    fragmentIndex,
    wordIndex,
    timeStart,
  }
}
