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
let restoreClipboard: (() => void) | null = null

afterEach(() => {
  destroy?.()
  destroy = null
  restoreClipboard?.()
  restoreClipboard = null
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

test('resumes an incomplete draft by previewing its last cue before recording the next word', async () => {
  const { audioController, highlightController } = createFixture()
  let startPlayback!: () => void
  let playbackAttempt = 0
  const playNetworkRecording = vi.fn(() => {
    playbackAttempt += 1
    if (playbackAttempt === 1) return Promise.resolve(false)
    return new Promise<boolean>((resolve) => {
        startPlayback = () => resolve(true)
      })
  })
  const focusReader = vi.fn()
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        playNetworkRecording,
        focusReader,
      })
    )
  })

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
  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession(session)

  const resumeDraft = required<HTMLButtonElement>(
    '[data-target-id="admin-resume-draft"]'
  )
  resumeDraft.click()
  await vi.waitFor(() => expect(playNetworkRecording).toHaveBeenCalledOnce())

  expect(cueAuthoring.isRecording()).toBe(false)
  expect(highlightController.getActiveTokenKey()).toBe(tokenKeys[0])
  expect(focusReader).not.toHaveBeenCalled()

  resumeDraft.click()
  await vi.waitFor(() => expect(playNetworkRecording).toHaveBeenCalledTimes(2))
  expect(cueAuthoring.isRecording()).toBe(false)

  startPlayback()
  await vi.waitFor(() => expect(cueAuthoring.isRecording()).toBe(true))

  expect(focusReader).toHaveBeenCalledOnce()
  expect(
    required('[data-target-id="admin-status"]').textContent
  ).toContain('recording Word 2')
  expect(
    required('[data-target-id="admin-record"]').getAttribute('aria-label')
  ).toBe('Stop recording word timings and switch to playback review')
  expect(
    required<HTMLElement>('[data-target-id="admin-resume-wrap"]').hidden
  ).toBe(true)
})

test('requires synchronized microphone capture for a missing recording', async () => {
  const { audioController, highlightController } = createFixture()
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController)
    )
  })

  const missing = { ...recording('missing', 1), status: 'missing' as const }
  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: { recording: missing, cues: [] },
    })!
  )
  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession(session)

  const captureAudio = required<HTMLInputElement>(
    '[data-target-id="admin-capture-audio"]'
  )
  expect(captureAudio.checked).toBe(true)
  expect(captureAudio.disabled).toBe(true)
  expect(
    required('[data-target-id="admin-status"]').textContent
  ).toContain('no published audio')
})

test('keeps cue selection, seeking, focus, and timing edits behind TypeScript', async () => {
  const { audioController, highlightController } = createFixture()
  const onCueNavigationChange = vi.fn()
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        onCueNavigationChange,
      })
    )
  })

  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: {
        recording: recording('current', 1),
        cues: [cue(tokenKeys[0], 0), cue(tokenKeys[1], 3.25)],
      },
    })!
  )
  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession(session)

  const firstRow = required<HTMLButtonElement>(
    '[data-admin-cue-index="0"]'
  )
  firstRow.click()
  await vi.waitFor(() => {
    expect(firstRow.classList.contains('is-selected')).toBe(true)
  })
  expect(onCueNavigationChange).toHaveBeenLastCalledWith(0)
  expect(highlightController.getActiveTokenKey()).toBe(tokenKeys[0])

  await cueAuthoring.selectReaderToken(1, { focusRow: true })
  const secondRow = required<HTMLButtonElement>(
    '[data-admin-cue-index="1"]'
  )
  expect(document.activeElement).toBe(secondRow)
  expect(secondRow.classList.contains('is-selected')).toBe(true)

  required<HTMLButtonElement>('[data-admin-nudge="0.05"]').click()
  expect(session.cues[1].timeStart).toBe(3.3)
  expect(
    required<HTMLButtonElement>('[data-admin-cue-index="1"]')
  ).toBe(secondRow)
  expect(secondRow.textContent).toContain('0:03.300')
  expect(onCueNavigationChange).toHaveBeenLastCalledWith(1)
})

test('routes Cue List controls through TypeScript behavior', async () => {
  const { audioController, highlightController } = createFixture()
  const playNetworkRecording = vi.fn(async () => true)
  const onCueNavigationChange = vi.fn()
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        playNetworkRecording,
        onCueNavigationChange,
      })
    )
  })

  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: {
        recording: recording('current', 1),
        cues: [cue(tokenKeys[0], 0), cue(tokenKeys[1], 3.25)],
      },
    })!
  )
  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession(session)
  await cueAuthoring.selectReaderToken(1)

  const previous = required<HTMLButtonElement>(
    '[data-target-id="admin-prev-saved"]'
  )
  const play = required<HTMLButtonElement>(
    '[data-target-id="admin-play-current"]'
  )
  const next = required<HTMLButtonElement>(
    '[data-target-id="admin-next-saved"]'
  )
  const trim = required<HTMLButtonElement>(
    '[data-target-id="admin-trim-here"]'
  )

  expect(previous.disabled).toBe(false)
  expect(next.disabled).toBe(true)

  previous.click()
  await vi.waitFor(() => {
    expect(
      required('[data-admin-cue-index="0"]').classList.contains(
        'is-selected'
      )
    ).toBe(true)
  })
  expect(previous.disabled).toBe(true)
  expect(next.disabled).toBe(false)

  next.click()
  await vi.waitFor(() => {
    expect(
      required('[data-admin-cue-index="1"]').classList.contains(
        'is-selected'
      )
    ).toBe(true)
  })
  expect(next.disabled).toBe(true)

  play.click()
  await vi.waitFor(() => {
    expect(playNetworkRecording).toHaveBeenCalledOnce()
  })
  expect(onCueNavigationChange).toHaveBeenLastCalledWith(1)

  trim.click()
  await vi.waitFor(() => {
    expect(session.cues).toHaveLength(1)
  })
  expect(document.querySelectorAll('[data-admin-cue-index]')).toHaveLength(1)
  expect(previous.disabled).toBe(true)
  expect(next.disabled).toBe(true)
  expect(
    JSON.parse(localStorage.getItem('tikkun-admin-draft:current') ?? '{}')
      .cues
  ).toHaveLength(1)
})

test('exports Cue Data through the Svelte sheet and revokes replaced downloads', async () => {
  const { audioController, highlightController } = createFixture()
  const writeText = vi.fn().mockResolvedValue(undefined)
  installClipboard(writeText)
  const createObjectURL = vi
    .spyOn(URL, 'createObjectURL')
    .mockReturnValueOnce('blob:cues-1')
    .mockReturnValueOnce('blob:cues-2')
  const revokeObjectURL = vi
    .spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => {})
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController)
    )
  })

  const session = createActiveAudioSession(
    buildPlaybackPlan({
      target: { runId: 'run', index: 1 },
      tokenKeys,
      current: {
        recording: recording('current', 1),
        cues: [cue(tokenKeys[0], 0), cue(tokenKeys[1], 3.25)],
      },
    })!
  )
  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession(session)

  const exportButton = required<HTMLButtonElement>(
    '[data-target-id="admin-export"]'
  )
  exportButton.click()
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))

  const modal = required<HTMLElement>('[data-target-id="export-modal"]')
  const textarea = required<HTMLTextAreaElement>(
    '[data-target-id="export-text"]'
  )
  const cueDownload = required<HTMLAnchorElement>(
    '[data-target-id="export-download"]'
  )
  const payload = JSON.parse(textarea.value)

  expect(modal.classList).not.toContain('u-hidden')
  expect(payload).toMatchObject({
    audioId: 'current',
    audioFormat: 'mp3',
    narratorId: 'reader',
    readingId: 'test',
    aliyah: 1,
    tokenCount: 2,
    cueCount: 2,
    issues: [],
    cues: [
      {
        cueNumber: 1,
        timeStart: 0,
        pageNumber: 1,
        lineIndex: 0,
        fragmentIndex: 0,
        wordIndex: 0,
      },
      {
        cueNumber: 2,
        timeStart: 3.25,
        pageNumber: 1,
        lineIndex: 0,
        fragmentIndex: 0,
        wordIndex: 1,
      },
    ],
  })
  expect(
    required('[data-target-id="export-target-path"]').textContent
  ).toContain('audio-cues/reader/test/1.json')
  expect(cueDownload.href).toBe('blob:cues-1')
  expect(cueDownload.download).toBe('1.json')
  expect(writeText).toHaveBeenLastCalledWith(textarea.value)
  expect(
    required('[data-target-id="export-copy-status"]').textContent
  ).toContain('Copied to clipboard.')
  expect(createObjectURL).toHaveBeenCalledOnce()

  exportButton.click()
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
  expect(revokeObjectURL).toHaveBeenCalledTimes(1)
  expect(revokeObjectURL).toHaveBeenNthCalledWith(1, 'blob:cues-1')
  expect(cueDownload.href).toBe('blob:cues-2')

  required<HTMLButtonElement>('[data-target-id="export-close"]').click()
  expect(modal.classList).toContain('u-hidden')
  expect(revokeObjectURL).toHaveBeenCalledTimes(2)
  expect(revokeObjectURL).toHaveBeenNthCalledWith(2, 'blob:cues-2')
  expect(cueDownload.hasAttribute('href')).toBe(false)
  expect(cueDownload.hasAttribute('download')).toBe(false)
})

test('keeps the export available when clipboard copying is blocked', async () => {
  const { audioController, highlightController } = createFixture()
  const writeText = vi.fn().mockRejectedValue(new Error('blocked'))
  installClipboard(writeText)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cues')
  const revokeObjectURL = vi
    .spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => {})
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController)
    )
  })

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
  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession(session)

  required<HTMLButtonElement>('[data-target-id="admin-export"]').click()
  await vi.waitFor(() => {
    expect(
      required('[data-target-id="export-copy-status"]').textContent
    ).toContain('Automatic clipboard copy was blocked.')
  })

  expect(
    required<HTMLElement>('[data-target-id="export-modal"]').classList
  ).not.toContain('u-hidden')
  expect(
    required<HTMLAnchorElement>('[data-target-id="export-download"]')
      .href
  ).toBe('blob:cues')

  cueAuthoring.closeOverlays()
  expect(
    required<HTMLElement>('[data-target-id="export-modal"]').classList
  ).toContain('u-hidden')
  expect(revokeObjectURL).toHaveBeenCalledOnce()
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:cues')
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

test('keeps the Svelte issue dialog open when persistence fails and retries safely', async () => {
  const { audioController, highlightController } = createFixture()
  const onRecordingIssuesChanged = vi.fn()
  let cueAuthoring!: CueAuthoring

  destroy = createMount()((scope) => {
    cueAuthoring = createCueAuthoring(
      scope,
      createOptions(audioController, highlightController, {
        onRecordingIssuesChanged,
      })
    )
  })

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
  await audioController.loadSession(session)
  highlightController.setSequence(tokenKeys)
  await cueAuthoring.bindSession(session)
  cueAuthoring.openIssue()

  const modal = required<HTMLElement>(
    '[data-target-id="recording-issue-modal"]'
  )
  expect(modal.getAttribute('aria-hidden')).toBe('false')
  const firstIssue = required<HTMLButtonElement>('[data-issue-kind]')
  expect(document.activeElement).toBe(firstIssue)

  const storageFailure = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'QuotaExceededError')
    })
  firstIssue.click()

  expect(modal.getAttribute('aria-hidden')).toBe('false')
  expect(onRecordingIssuesChanged).not.toHaveBeenCalled()

  storageFailure.mockRestore()
  firstIssue.click()
  expect(modal.getAttribute('aria-hidden')).toBe('true')
  expect(onRecordingIssuesChanged).toHaveBeenCalledOnce()
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
    playNetworkRecording: async () => true,
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
    <div data-target-id="cue-authoring-panel-root"></div>
    <div data-target-id="recording-issue-dialog-root"></div>
    <div data-target-id="cue-authoring-export-sheet-root"></div>
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

function installClipboard(writeText: (text: string) => Promise<void>) {
  const descriptor = Object.getOwnPropertyDescriptor(
    navigator,
    'clipboard'
  )
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  restoreClipboard = () => {
    if (descriptor) {
      Object.defineProperty(navigator, 'clipboard', descriptor)
    } else {
      Reflect.deleteProperty(navigator, 'clipboard')
    }
  }
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
