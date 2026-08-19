import { flushSync } from 'svelte'
import { beforeEach, expect, test } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
import {
  createReaderShell,
  type ReaderShell,
} from './reader-shell.ts'

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}

function installFixture() {
  document.body.innerHTML = `
    <div class="app" data-target-id="app-root">
      <div data-target-id="reader-shell-anchor" hidden></div>
      <div data-external-node="true"></div>
    </div>
  `
}

beforeEach(installFixture)

test('updates shell presentation without replacing stable reader targets', () => {
  const mountShell = createMount()
  let shell!: ReaderShell
  let titleClicks = 0
  let aboutClicks = 0
  let annotationChanges = 0

  const destroy = mountShell((scope) => {
    shell = createReaderShell(scope, {
      document,
      initialTitle: 'בראשית',
      initialAnnotationsEnabled: true,
      onTitleClick: () => {
        titleClicks += 1
      },
      onAboutClick: () => {
        aboutClicks += 1
      },
      onAnnotationsChange: (enabled) => {
        annotationChanges += 1
        shell.setAnnotationsEnabled(enabled)
      },
    })
  })

  const reader = required<HTMLElement>('[data-target-id="reader-shell"]')
  const book = required<HTMLElement>('[data-target-id="tikkun-book"]')
  const optionalView = required<HTMLElement>('[data-target-id="about-view"]')
  const floatingPlayerRoot = required<HTMLElement>(
    '[data-target-id="floating-player-root"]'
  )
  const controlsRoot = required<HTMLElement>(
    '[data-target-id="reader-controls-root"]'
  )
  const settingsRoot = required<HTMLElement>('[data-target-id="settings-root"]')
  const aliyahToolbarRoot = required<HTMLElement>(
    '[data-target-id="aliyah-toolbar-root"]'
  )
  const aliyahLayerRoot = required<HTMLElement>(
    '[data-target-id="aliyah-navigation-layer-root"]'
  )
  expect(aliyahToolbarRoot.childElementCount).toBe(0)
  expect(aliyahLayerRoot.childElementCount).toBe(0)
  const sentinel = document.createElement('div')
  sentinel.dataset.dynamicReaderChild = 'true'
  reader.append(sentinel)

  shell.setTitle('Beresheet')
  shell.setProgress({ label: 'שני', percent: 42.4 })

  expect(required('[data-target-id="parsha-title"]').textContent?.trim()).toBe(
    'Beresheet'
  )
  expect(
    required<HTMLElement>('[data-target-id="reader-progress-fill"]').style.getPropertyValue(
      '--reader-progress-ratio'
    )
  ).toBe(
    '0.42'
  )
  expect(
    required<HTMLElement>(
      '[data-target-id="reader-progress-mobile-fill"]'
    ).style.getPropertyValue('--reader-progress-ratio')
  ).toBe('0.42')
  expect(
    required('[data-target-id="reader-progress-percent"]').textContent?.trim()
  ).toBe('42%')
  expect(required('[data-target-id="reader-progress-label"]').textContent?.trim()).toBe(
    'שני'
  )
  const progress = required<HTMLElement>('[data-target-id="reader-progress"]')
  expect(progress.getAttribute('role')).toBe('progressbar')
  expect(progress.getAttribute('aria-valuenow')).toBe('42')
  expect(progress.getAttribute('aria-valuetext')).toBe('שני, 42%')
  expect(reader.tagName).toBe('MAIN')

  shell.setPickerOpen(true)
  expect(book.classList.contains('u-hidden')).toBe(true)
  expect(required('[data-target-id="settings-toggle"]').classList.contains('u-hidden')).toBe(
    true
  )
  expect(required('[data-target-id="reader-progress"]').classList.contains('u-hidden')).toBe(
    true
  )
  expect(reader.contains(sentinel)).toBe(true)

  shell.setPickerOpen(false)
  shell.setView('optional')
  expect(reader.classList.contains('u-hidden')).toBe(true)
  expect(optionalView.classList.contains('u-hidden')).toBe(false)
  expect(shell.isReaderVisible()).toBe(false)

  shell.setView('reader')
  expect(reader.classList.contains('u-hidden')).toBe(false)
  expect(optionalView.classList.contains('u-hidden')).toBe(true)
  expect(shell.isReaderVisible()).toBe(true)

  expect(required('[data-target-id="tikkun-book"]')).toBe(book)
  expect(required('[data-target-id="floating-player-root"]')).toBe(
    floatingPlayerRoot
  )
  expect(required('[data-target-id="reader-controls-root"]')).toBe(controlsRoot)
  expect(required('[data-target-id="settings-root"]')).toBe(settingsRoot)
  expect(required('[data-target-id="aliyah-toolbar-root"]')).toBe(
    aliyahToolbarRoot
  )
  expect(required('[data-target-id="aliyah-navigation-layer-root"]')).toBe(
    aliyahLayerRoot
  )

  const title = required<HTMLButtonElement>('[data-target-id="parsha-title"]')
  title.click()
  shell.focusTitle()
  expect(titleClicks).toBe(1)
  expect(document.activeElement).toBe(title)

  required<HTMLButtonElement>('[data-target-id="about-link"]').click()
  required<HTMLButtonElement>('[data-target-id="mobile-library"]').click()
  expect(aboutClicks).toBe(2)

  const annotations = required<HTMLButtonElement>(
    '[data-test-id="annotations-toggle"]'
  )
  expect(annotations.querySelector('input')).toBeNull()
  expect(annotations.getAttribute('aria-pressed')).toBe('true')
  expect(annotations.getAttribute('aria-label')).toBe(
    'Hide vowels and cantillation marks'
  )
  annotations.click()
  flushSync()
  expect(annotationChanges).toBe(1)
  expect(annotations.getAttribute('aria-pressed')).toBe('false')
  expect(annotations.getAttribute('aria-label')).toBe(
    'Show vowels and cantillation marks'
  )
  expect(book.classList.contains('mod-annotations-off')).toBe(true)

  destroy()
  expect(document.querySelector('[data-reader-shell-owner="true"]')).toBeNull()
  expect(document.querySelector('[data-external-node="true"]')).not.toBeNull()
})

test('replacement mounts cleanly and does not duplicate shell actions', () => {
  const mountShell = createMount()
  let titleClicks = 0

  const mountReplacement = () =>
    mountShell((scope) => {
      createReaderShell(scope, {
        document,
        initialTitle: 'Tikkun',
        initialAnnotationsEnabled: true,
        onTitleClick: () => {
          titleClicks += 1
        },
        onAboutClick: () => {},
        onAnnotationsChange: () => {},
      })
    })

  const destroyFirst = mountReplacement()
  const firstTitle = required<HTMLButtonElement>('[data-target-id="parsha-title"]')
  firstTitle.click()

  const destroySecond = mountReplacement()
  const secondTitle = required<HTMLButtonElement>('[data-target-id="parsha-title"]')
  secondTitle.click()

  expect(titleClicks).toBe(2)
  expect(secondTitle).not.toBe(firstTitle)
  expect(document.querySelectorAll('[data-reader-shell-owner="true"]')).toHaveLength(1)

  destroyFirst()
  expect(document.querySelectorAll('[data-reader-shell-owner="true"]')).toHaveLength(1)

  destroySecond()
  expect(document.querySelector('[data-reader-shell-owner="true"]')).toBeNull()
})
