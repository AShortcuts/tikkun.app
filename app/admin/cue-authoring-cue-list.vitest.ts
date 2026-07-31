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

test('owns cue controls, disabled states, focus, and typed actions', () => {
  const { cueList, action } = mountCueList()
  const controls = Array.from(
    fixture!.querySelectorAll<HTMLButtonElement>(
      '.admin-panel-actions .toolbar-button'
    )
  )

  expect(controls).toHaveLength(8)
  expect(controls.map((button) => button.textContent?.trim())).toEqual([
    'Prev Saved',
    'Play Current',
    'Next Saved',
    'Trim From Here',
    '-250',
    '-50',
    '+50',
    '+250',
  ])
  expect(controls.every((button) => button.type === 'button')).toBe(true)
  expect(controls.every((button) => button.disabled)).toBe(true)

  controls[0].click()
  expect(action).not.toHaveBeenCalled()

  cueList.sync(snapshot({ selectedIndex: 0 }))
  expect(controls.map((button) => button.disabled)).toEqual([
    true,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ])

  cueList.sync(snapshot({ selectedIndex: 1 }))
  expect(controls.every((button) => !button.disabled)).toBe(true)
  controls[1].focus()
  cueList.setCurrent(1)
  cueList.sync(snapshot({ selectedIndex: 2, followIndex: null }))
  expect(
    fixture!.querySelector('[data-target-id="admin-play-current"]')
  ).toBe(controls[1])
  expect(document.activeElement).toBe(controls[1])
  expect(controls.map((button) => button.disabled)).toEqual([
    false,
    false,
    true,
    false,
    false,
    false,
    false,
    false,
  ])

  cueList.sync(snapshot({ selectedIndex: 1, followIndex: null }))
  for (const button of controls) button.click()
  expect(action.mock.calls.map(([command]) => command)).toEqual([
    { type: 'move', delta: -1 },
    { type: 'play' },
    { type: 'move', delta: 1 },
    { type: 'trim' },
    { type: 'nudge', seconds: -0.25 },
    { type: 'nudge', seconds: -0.05 },
    { type: 'nudge', seconds: 0.05 },
    { type: 'nudge', seconds: 0.25 },
  ])

  expect(controls[0].getAttribute('aria-label')).toBe(
    'Select the previous saved word timing'
  )
  expect(controls[3].title).toBe(
    'Delete saved timings after the selected word'
  )
  expect(controls[4].getAttribute('aria-label')).toBe(
    'Move the selected word timing 250 milliseconds earlier'
  )
  expect(controls[7].title).toBe(
    'Move the selected word timing 250 milliseconds later'
  )

  cueList.sync(
    snapshot({
      items: [],
      selectedIndex: -1,
      currentIndex: -1,
      followIndex: null,
    })
  )
  expect(controls.every((button) => button.disabled)).toBe(true)
})

test('preserves keyed rows across efficient selection and playback updates', () => {
  const getComputedStyle = vi.spyOn(window, 'getComputedStyle')
  const { cueList } = mountCueList()
  cueList.sync(
    snapshot({
      items: snapshot().items.slice(0, 2),
      selectedIndex: 0,
      currentIndex: 0,
      followIndex: 0,
    })
  )
  const firstRow = fixture!.querySelector<HTMLButtonElement>(
    '[data-admin-cue-index="0"]'
  )!

  cueList.setCurrent(1)
  expect(firstRow.classList.contains('is-current')).toBe(false)
  expect(
    fixture!
      .querySelector('[data-admin-cue-index="1"]')
      ?.classList.contains('is-current')
  ).toBe(true)
  const measurementCount = getComputedStyle.mock.calls.length
  cueList.setCurrent(1)
  expect(getComputedStyle).toHaveBeenCalledTimes(measurementCount)

  cueList.sync(
    snapshot({
      items: [
        { key: '1:0:0:0:0', tokenLabel: 'First', timeStart: 0.125 },
        { key: '1:0:0:1:1', tokenLabel: 'Second', timeStart: 1.5 },
      ],
      selectedIndex: 1,
      currentIndex: 1,
      followIndex: null,
    })
  )

  expect(
    fixture!.querySelector('[data-admin-cue-index="0"]')
  ).toBe(firstRow)
  expect(firstRow.textContent).toContain('0:0.125')
  expect(
    fixture!
      .querySelector('[data-admin-cue-index="1"]')
      ?.classList.contains('is-selected')
  ).toBe(true)
  expect(
    fixture!
      .querySelector('[data-admin-cue-index="1"]')
      ?.classList.contains('is-current')
  ).toBe(true)

  cueList.sync(
    snapshot({
      emptyMessage: 'No timing saved yet. Start recording, then refine it.',
      items: [],
      selectedIndex: -1,
      currentIndex: -1,
      followIndex: null,
    })
  )
  expect(fixture!.querySelectorAll('[data-admin-cue-index]')).toHaveLength(0)
  expect(fixture!.textContent).toContain('No timing saved yet.')

  destroy?.()
  destroy = null
  expect(
    fixture!.querySelector('[data-target-id="admin-cue-list-root"]')
      ?.childNodes
  ).toHaveLength(0)
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
