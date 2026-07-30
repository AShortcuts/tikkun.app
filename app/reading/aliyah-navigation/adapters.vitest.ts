import { afterEach, expect, test, vi } from 'vitest'
import { createMount } from '../../lifecycle/mount.ts'
import { createDesktopAliyahRail } from './desktop-rail.ts'
import { createMobileAliyahPicker } from './mobile-picker.ts'
import type {
  AliyahNavigationPlayback,
  AliyahNavigationSnapshot,
  AliyahNavigationTarget,
} from './model.ts'

let fixture: HTMLElement | null = null
let destroy: (() => void) | null = null

afterEach(() => {
  destroy?.()
  destroy = null
  fixture?.remove()
  fixture = null
  delete document.documentElement.dataset.aliyahRailVisibility
})

test('desktop rail owns reveal state, cue status, and selection interactions', async () => {
  fixture = createFixture(`
    <header class="app-toolbar"></header>
    <nav data-target-id="aliyah-rail" class="u-hidden"></nav>
  `)
  const root = required<HTMLElement>('[data-target-id="aliyah-rail"]')
  const toolbar = required<HTMLElement>('.app-toolbar')
  vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue(
    { bottom: 72 } as DOMRect
  )
  const selected: AliyahNavigationTarget[] = []
  let adapter: ReturnType<typeof createDesktopAliyahRail> | null = null

  destroy = createMount()((scope) => {
    adapter = createDesktopAliyahRail(scope, {
      root,
      toolbar,
      onSelect: (target) => selected.push(target),
      onHidden: vi.fn(),
      loadCueStatus: async (item) =>
        item.target.aliyahIndex === 1 ? 'published' : 'none',
      onLoadError: vi.fn(),
    })
  })

  adapter!.render(snapshot)
  await flushPromises()

  const buttons = [...root.querySelectorAll<HTMLButtonElement>('button')]
  expect(buttons).toHaveLength(2)
  expect(buttons[0].dataset.cueStatus).toBe('published')
  expect(buttons[1].classList.contains('is-active')).toBe(true)
  expect(document.documentElement.style.getPropertyValue('--aliyah-rail-top')).toBe(
    '72px'
  )

  adapter!.reveal('expanded')
  expect(document.documentElement.dataset.aliyahRailVisibility).toBe('expanded')
  expect(root.getAttribute('aria-hidden')).toBe('false')

  buttons[0].click()
  expect(selected).toEqual([{ runId: 'run-a', aliyahIndex: 1 }])
})

test('mobile picker renders the shared snapshot with mobile-only sheet behavior', async () => {
  fixture = createFixture(`
    <button data-target-id="toggle" class="u-hidden" aria-expanded="false">
      <span data-target-id="speaker" class="u-hidden"></span>
      <span data-target-id="label"></span>
      <span data-target-id="chevron"></span>
    </button>
    <nav data-target-id="segments" class="u-hidden"></nav>
    <div data-target-id="picker" class="u-hidden" aria-hidden="true" inert>
      <button data-target-id="backdrop"></button>
      <button data-target-id="close"></button>
      <div data-target-id="grid"></div>
    </div>
    <main data-target-id="reader" tabindex="-1"></main>
  `)
  const selected: AliyahNavigationTarget[] = []
  const played: AliyahNavigationTarget[] = []
  const pausedPlayback: AliyahNavigationPlayback = {
    target: { runId: 'run-a', aliyahIndex: 1 },
    playing: false,
    progressLabel: '0:10/2:05',
  }
  let adapter: ReturnType<typeof createMobileAliyahPicker> | null = null

  destroy = createMount()((scope) => {
    adapter = createMobileAliyahPicker(scope, {
      picker: required('[data-target-id="picker"]'),
      toggle: required('[data-target-id="toggle"]'),
      label: required('[data-target-id="label"]'),
      speaker: required('[data-target-id="speaker"]'),
      chevron: required('[data-target-id="chevron"]'),
      segments: required('[data-target-id="segments"]'),
      grid: required('[data-target-id="grid"]'),
      backdrop: required('[data-target-id="backdrop"]'),
      closeButton: required('[data-target-id="close"]'),
      onSelect: (target) => selected.push(target),
      onPlay: async (target) => {
        played.push(target)
        return pausedPlayback
      },
      onBeforeOpen: () => pausedPlayback,
      onAfterNavigate: vi.fn(),
      focusReturnTarget: vi.fn(),
      getReaderFocusTarget: () => required('[data-target-id="reader"]'),
      loadDurationLabel: async () => '2:05',
      onLoadError: vi.fn(),
    })
  })

  adapter!.render(snapshot)
  adapter!.syncCapsule({
    visible: true,
    target: { runId: 'run-a', aliyahIndex: 2 },
    label: 'שני',
    playbackState: 'loaded',
  })
  await flushPromises()

  expect(document.querySelectorAll('.mobile-aliyah-segment')).toHaveLength(2)
  expect(document.querySelectorAll('.mobile-aliyah-card')).toHaveLength(2)
  expect(document.querySelectorAll('.mobile-aliyah-play')).toHaveLength(1)
  expect(
    required<HTMLElement>('.mobile-aliyah-card-status').dataset.durationLabel
  ).toBe('2:05')
  expect(required<HTMLElement>('[data-target-id="label"]').textContent).toBe('שני')

  required<HTMLButtonElement>('[data-target-id="toggle"]').click()
  expect(required('[data-target-id="picker"]').getAttribute('aria-hidden')).toBe(
    'false'
  )

  required<HTMLButtonElement>('.mobile-aliyah-segment').click()
  expect(selected).toEqual([{ runId: 'run-a', aliyahIndex: 1 }])

  required<HTMLButtonElement>('.mobile-aliyah-play').click()
  await flushPromises()
  expect(played).toEqual([{ runId: 'run-a', aliyahIndex: 1 }])
})

const idlePlayback: AliyahNavigationPlayback = {
  target: null,
  playing: false,
  progressLabel: '',
}

const snapshot: AliyahNavigationSnapshot = {
  signature: 'narrator-a:run-a:1:audio-1|run-a:2:',
  active: { runId: 'run-a', aliyahIndex: 2 },
  playback: idlePlayback,
  items: [
    {
      key: 'run-a:1',
      target: { runId: 'run-a', aliyahIndex: 1 },
      label: 'ראשון',
      compactLabel: '1',
      audioKey: 'audio-1',
    },
    {
      key: 'run-a:2',
      target: { runId: 'run-a', aliyahIndex: 2 },
      label: 'שני',
      compactLabel: '2',
      audioKey: null,
    },
  ],
}

function createFixture(markup: string) {
  const root = document.createElement('section')
  root.innerHTML = markup
  document.body.appendChild(root)
  return root
}

function required<T extends Element = HTMLElement>(selector: string) {
  const element = fixture?.querySelector<T>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}
