import { afterEach, expect, test, vi } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
import {
  createCueAuthoringCueList,
  type CueAuthoringCueList,
  type CueAuthoringCueListSnapshot,
} from './cue-authoring-cue-list.ts'

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
  overrides: Partial<CueAuthoringCueListSnapshot> = {}
): CueAuthoringCueListSnapshot {
  return {
    emptyMessage: null,
    items: [
      { key: '1:0:0:0:0', tokenLabel: 'First', timeStart: 0 },
      { key: '1:0:0:1:1', tokenLabel: 'Second', timeStart: 0 },
      { key: '1:0:0:2:2', tokenLabel: 'Third', timeStart: 9.25 },
    ],
    selectedIndex: 1,
    currentIndex: 2,
    followIndex: 2,
    ...overrides,
  }
}

function mountCueList() {
  fixture = document.createElement('aside')
  fixture.className = 'admin-panel'
  fixture.dataset.targetId = 'admin-panel'
  fixture.innerHTML = '<div data-target-id="admin-cue-list-root"></div>'
  document.body.appendChild(fixture)
  const action = vi.fn()
  let cueList!: CueAuthoringCueList

  destroy = createMount()((scope) => {
    cueList = createCueAuthoringCueList(scope, {
      document,
      view: window,
      formatTimestamp: (seconds) => `0:${seconds.toFixed(3)}`,
      action,
    })
  })

  return { cueList, action }
}

test('renders cue rows, warnings, selection, and current playback state', () => {
  const { cueList, action } = mountCueList()
  expect(fixture!.textContent).toContain('Select an aliyah to load timing.')

  cueList.sync(snapshot())
  const rows = fixture!.querySelectorAll<HTMLButtonElement>(
    '[data-admin-cue-index]'
  )

  expect(rows).toHaveLength(3)
  expect(rows[0].textContent).toContain('First')
  expect(rows[0].textContent).toContain('start')
  expect(rows[1].classList.contains('is-selected')).toBe(true)
  expect(rows[1].classList.contains('mod-invalid')).toBe(true)
  expect(rows[1].textContent).toContain('Out of order')
  expect(rows[2].classList.contains('is-current')).toBe(true)
  expect(rows[2].classList.contains('mod-warning')).toBe(true)
  expect(rows[2].textContent).toContain('Long gap 9.250s')
  expect(rows[2].getAttribute('aria-label')).toBe(
    'Select saved timing for Third at 0:9.250. Long gap 9.250s'
  )

  rows[2].click()
  expect(action).toHaveBeenCalledWith({ type: 'select', index: 2 })
  cueList.focus(1)
  expect(document.activeElement).toBe(rows[1])
})

test('measures five rows, follows the active cue, and cancels pending work', () => {
  const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame')
  const { cueList } = mountCueList()
  const items = Array.from({ length: 6 }, (_, index) => ({
    key: `1:0:0:${index}:${index}`,
    tokenLabel: `Word ${index + 1}`,
    timeStart: index,
  }))
  cueList.sync(
    snapshot({
      items,
      selectedIndex: 0,
      currentIndex: 0,
      followIndex: null,
    })
  )

  const list = fixture!.querySelector<HTMLElement>(
    '[data-target-id="admin-cue-list"]'
  )!
  const rows = Array.from(
    fixture!.querySelectorAll<HTMLButtonElement>('[data-admin-cue-index]')
  )
  for (const row of rows) {
    Object.defineProperty(row, 'offsetHeight', {
      configurable: true,
      value: 20,
    })
  }
  Object.defineProperty(list, 'scrollTop', {
    configurable: true,
    value: 0,
    writable: true,
  })
  list.getBoundingClientRect = () =>
    ({ top: 0, bottom: 100 } as DOMRect)
  rows[5].getBoundingClientRect = () =>
    ({ top: 120, bottom: 140 } as DOMRect)

  cueList.sync(
    snapshot({
      items,
      selectedIndex: 5,
      currentIndex: 5,
      followIndex: 5,
    })
  )

  expect(list.style.maxHeight).toBe('100px')
  expect(list.scrollTop).toBe(40)

  destroy?.()
  destroy = null
  expect(cancelAnimationFrame).toHaveBeenCalled()
})
