import { afterEach, expect, test, vi } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
import {
  createCueAuthoringExportSheet,
  type CueAuthoringExportSheet,
  type CueAuthoringExportSheetContent,
} from './cue-authoring-export-sheet.ts'

let fixture: HTMLElement | null = null
let destroy: (() => void) | null = null

afterEach(() => {
  destroy?.()
  destroy = null
  fixture?.remove()
  fixture = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function content(
  overrides: Partial<CueAuthoringExportSheetContent> = {}
): CueAuthoringExportSheetContent {
  return {
    cueDownload: {
      href: 'blob:cues',
      fileName: '3.json',
    },
    audioDownload: {
      href: 'blob:audio',
      fileName: 'reader-3-recorded.webm',
      statusText:
        'Recorded audio: reader-3-recorded.webm (0:42). Convert it to MP3 before publishing this recording.',
    },
    targetPath: 'audio-cues/reader/test/3.json',
    serialized: '{\n  "cueCount": 2\n}\n',
    ...overrides,
  }
}

function mountSheet() {
  fixture = document.createElement('div')
  fixture.innerHTML =
    '<div data-target-id="cue-authoring-export-sheet-root"></div>'
  document.body.appendChild(fixture)
  const closeRequested = vi.fn()
  let sheet!: CueAuthoringExportSheet

  destroy = createMount()((scope) => {
    sheet = createCueAuthoringExportSheet(scope, {
      document,
      view: window,
      closeRequested,
    })
  })

  return { closeRequested, sheet }
}

function required<ElementType extends Element>(selector: string) {
  const element = fixture?.querySelector<ElementType>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}

test('owns export presentation and preserves native download elements', async () => {
  const select = vi.spyOn(HTMLTextAreaElement.prototype, 'select')
  const { sheet } = mountSheet()
  const modal = required<HTMLElement>('[data-target-id="export-modal"]')
  const cueLink = required<HTMLAnchorElement>(
    '[data-target-id="export-download"]'
  )
  const audioLink = required<HTMLAnchorElement>(
    '[data-target-id="export-audio-download"]'
  )
  const textarea = required<HTMLTextAreaElement>(
    '[data-target-id="export-text"]'
  )

  expect(modal.classList).toContain('u-hidden')
  expect(cueLink.hasAttribute('href')).toBe(false)
  expect(audioLink.classList).toContain('u-hidden')

  sheet.open(content())

  expect(modal.classList).not.toContain('u-hidden')
  expect(cueLink.href).toBe('blob:cues')
  expect(cueLink.download).toBe('3.json')
  expect(audioLink.href).toBe('blob:audio')
  expect(audioLink.download).toBe('reader-3-recorded.webm')
  expect(audioLink.classList).not.toContain('u-hidden')
  expect(
    required<HTMLElement>('[data-target-id="export-audio-status"]').hidden
  ).toBe(false)
  expect(
    required('[data-target-id="export-audio-status"]').textContent
  ).toContain('Convert it to MP3')
  expect(
    required('[data-target-id="export-target-path"]').textContent
  ).toContain('audio-cues/reader/test/3.json')
  expect(textarea.value).toBe('{\n  "cueCount": 2\n}\n')
  await vi.waitFor(() => expect(select).toHaveBeenCalledOnce())

  textarea.value = 'locally selected text'
  textarea.focus()
  sheet.setCopyStatus('Copied to clipboard.')

  expect(
    required('[data-target-id="export-copy-status"]').textContent
  ).toContain('Copied to clipboard.')
  expect(
    required('[data-target-id="export-download"]')
  ).toBe(cueLink)
  expect(
    required('[data-target-id="export-audio-download"]')
  ).toBe(audioLink)
  expect(required('[data-target-id="export-text"]')).toBe(textarea)
  expect(textarea.value).toBe('locally selected text')
  expect(document.activeElement).toBe(textarea)
})
