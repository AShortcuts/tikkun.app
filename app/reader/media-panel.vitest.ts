import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { flushSync, mount, unmount } from 'svelte'
import axe from 'axe-core'
import '../../css/master.css'
import { audioRecordings, audioNarrators } from '../../generated/audio-manifest.ts'
import { createDownloadLibrary } from '../offline/download-library.ts'
import { descriptorForRecording } from '../offline/recording-download.ts'
import { recordingAssetKey, resolveRecordingAsset, type RecordingStorage } from '../offline/recording-storage.ts'
import type { StoredRecording } from '../offline/recording-inventory.ts'
import type { MediaReading } from '../offline/media-catalog.ts'
import type { MediaPanelApi } from './media-panel.ts'
import MediaPanel from './MediaPanel.svelte'
import { applyReaderPreferences, defaultReaderPreferences } from '../reader-preferences.ts'

const recordings = audioRecordings.filter((recording) => recording.reading.id === 'beresheet')
const readings: MediaReading[] = [
  { id: 'beresheet', name: 'Beresheet', hebrew: 'בְּרֵאשִׁית', group: 'Genesis', aliyot: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'noach', name: 'Noach', hebrew: 'נֹחַ', group: 'Genesis', aliyot: [1, 2, 3, 4, 5, 6, 7] },
]
let cleanup: (() => Promise<void>) | undefined
afterEach(async () => { await cleanup?.(); cleanup = undefined; document.documentElement.removeAttribute('data-reader-theme'); document.documentElement.removeAttribute('data-reader-custom-scheme'); document.documentElement.style.colorScheme = ''; vi.restoreAllMocks() })

async function setup(saved = 1, inUse = false, availableRecordings = recordings) {
  const assets = availableRecordings.map((recording) => resolveRecordingAsset(descriptorForRecording(recording)!, document.baseURI))
  const stored = new Map<string, StoredRecording>(assets.slice(0, saved).map((asset) => [recordingAssetKey(asset), asset]))
  const backend: RecordingStorage = { supported: true, location: 'device', inventory: async () => [...stored.values()],
    preflight: vi.fn(async () => {}),
    download: vi.fn(async (asset) => { stored.set(recordingAssetKey(asset), asset); return asset }),
    remove: vi.fn(async (asset) => { stored.delete(recordingAssetKey(asset)) }), destroy: vi.fn() }
  const library = createDownloadLibrary({ assets, backend, intent: { read: async () => [], update: async () => {} },
    dependencies: { check: async () => 'ready', prepare: async () => 'ready' }, inUse: () => inUse })
  await library.refresh()
  const target = document.createElement('div')
  const trigger = document.createElement('button')
  trigger.textContent = 'Open media'
  document.body.append(trigger, target)
  let connected: MediaPanelApi | undefined
  const component = mount(MediaPanel, { target, props: { library, readings, recordings: availableRecordings, narrators: audioNarrators,
    initialNarrator: audioNarrators[0].id, baseUrl: document.baseURI,
    meter: { measure: async () => ({ categories: [
      { id: 'core', label: 'App and core text', bytes: 6_014_015 },
      { id: 'audio', label: 'Audio downloads', bytes: [...stored.values()].reduce((sum, asset) => sum + asset.byteLength, 0) },
      { id: 'temporary', label: 'Temporary files', bytes: 0 },
    ], availableBytes: null, availableLabel: 'Device space available for downloads', note: 'Logical file sizes. Personal data is not included.' }) },
    connect: (api: MediaPanelApi) => { connected = api },
  } })
  flushSync()
  const api = connected!
  api.open({ returnFocus: trigger })
  cleanup = async () => { await unmount(component); library.destroy(); target.remove(); trigger.remove() }
  await expect.element(page.getByRole('button', { name: 'Refresh downloads', exact: true })).toBeEnabled()
  return { api, trigger, library, backend, assets }
}

for (const width of [320, 390, 768, 1280]) test(`Media download disclosure, stable completion control and Storage at ${width}px`, async () => {
  await page.viewport(width, 844)
  const { library } = await setup()
  const button = document.querySelector<HTMLButtonElement>('.media-download')!
  expect(button.textContent).toContain('1/7')
  const before = button.getBoundingClientRect()
  const title = document.querySelector<HTMLElement>('.media-reading-title')!
  const englishLabel = title.querySelector<HTMLElement>('.media-english')!
  const hebrewLabel = title.querySelector<HTMLElement>('.media-hebrew')!
  const english = englishLabel.getBoundingClientRect()
  const hebrew = title.querySelector('.media-hebrew')!.getBoundingClientRect()
  expect(getComputedStyle(englishLabel).fontSize).toBe(getComputedStyle(hebrewLabel).fontSize)
  expect(getComputedStyle(englishLabel).color).toBe(getComputedStyle(hebrewLabel).color)
  expect(getComputedStyle(englishLabel).fontWeight).toBe('400')
  expect(getComputedStyle(hebrewLabel).fontWeight).toBe('700')
  expect(Array.from(title.children, (part) => part.textContent).join(' ')).toBe('Beresheet - בְּרֵאשִׁית')
  expect(Math.abs(english.top - hebrew.top)).toBeLessThan(2)
  expect(english.right).toBeLessThan(hebrew.left)
  expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth)
  await page.getByRole('button', { name: /Beresheet.*remaining/ }).click()
  await expect.element(page.getByRole('button', { name: 'Download Beresheet Aliyah 2', exact: true })).toBeVisible()
  await page.screenshot({ path: `../../.vitest-attachments/media-${width}.png` })
  await page.getByRole('button', { name: 'Download remaining 6 aliyot for Beresheet', exact: true }).click()
  await expect.poll(() => library.snapshot().inventory.length).toBe(7)
  await expect.element(page.getByRole('button', { name: 'Beresheet: Downloaded', exact: true })).toBeDisabled()
  expect(document.querySelector('.media-download')).toBe(button)
  expect(button.getBoundingClientRect().width).toBe(before.width)
  expect(button.getBoundingClientRect().height).toBe(before.height)
  expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth)
  expect(document.querySelector('.media-panel')!.scrollWidth).toBeLessThanOrEqual(width)
  await page.getByRole('tab', { name: 'Storage', exact: true }).click()
  await expect.element(page.getByText('Device space available for downloads:')).toBeVisible()
  await page.screenshot({ path: `../../.vitest-attachments/storage-${width}.png` })
  const panel = document.querySelector<HTMLElement>('.media-panel')!
  expect(panel.querySelector('.media-body')!.scrollWidth).toBeLessThanOrEqual(panel.clientWidth)
  for (const control of panel.querySelectorAll<HTMLElement>('button, select, input[type=search], label:has(input[type=checkbox])')) {
    if (!control.checkVisibility()) continue
    const rect = control.getBoundingClientRect()
    expect(rect.width, control.outerHTML).toBeGreaterThanOrEqual(44)
    expect(rect.height, control.outerHTML).toBeGreaterThanOrEqual(44)
    expect(rect.left, control.outerHTML).toBeGreaterThanOrEqual(panel.getBoundingClientRect().left)
    expect(rect.right, control.outerHTML).toBeLessThanOrEqual(panel.getBoundingClientRect().right + 1)
  }
})

test('shows download controls only for readings and aliyot with audio', async () => {
  await page.viewport(390, 844)
  await setup(0, false, recordings.slice(0, 1))
  const noach = [...document.querySelectorAll('.media-reading')].find((row) => row.textContent?.includes('Noach'))!
  expect(noach.querySelector('.media-download')).toBeNull()
  await page.getByRole('button', { name: /Noach.*Audio unavailable/ }).click()
  expect(noach.querySelectorAll('.media-aliyah')).toHaveLength(7)
  expect(noach.querySelectorAll('.media-aliyah button')).toHaveLength(0)
  await page.getByRole('button', { name: /Beresheet.*1 of 7 available/ }).click()
  await expect.element(page.getByRole('button', { name: 'Download Beresheet Aliyah 1', exact: true })).toBeEnabled()
  await expect.element(page.getByRole('button', { name: 'Download Aliyah 2', exact: true })).not.toBeInTheDocument()
})

test('omits bulk downloads when the catalog has no audio', async () => {
  await setup(0, false, [])
  expect(document.querySelector('.media-download')).toBeNull()
  await expect.element(page.getByRole('button', { name: 'Download library', exact: true })).not.toBeInTheDocument()
})

test('iOS-style segmented navigation supports the keyboard and dark appearance', async () => {
  await page.viewport(390, 844)
  document.documentElement.dataset.readerTheme = 'dark'
  await setup()
  await page.getByRole('tab', { name: 'Media', exact: true }).click()
  document.querySelector('#media-tab-media')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  await expect.element(page.getByRole('tab', { name: 'Storage', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect.element(page.getByRole('tab', { name: 'Storage', exact: true })).toHaveFocus()
  await expect.element(page.getByRole('img', { name: /^Measured storage:/ })).toBeVisible()
  expect(getComputedStyle(document.querySelector('.media-panel')!).backgroundColor).toBe('rgb(0, 0, 0)')
  expect((await axe.run(document.querySelector('.media-panel')!)).violations).toEqual([])
  await page.screenshot({ path: '../../.vitest-attachments/storage-dark.png' })
  document.querySelector('#media-tab-storage')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
  await expect.element(page.getByRole('tab', { name: 'Media', exact: true })).toHaveAttribute('aria-selected', 'true')
  expect((await axe.run(document.querySelector('.media-panel')!)).violations).toEqual([])
  await page.screenshot({ path: '../../.vitest-attachments/media-dark.png' })
})

test('Media remains opaque through automatic, explicit and custom theme changes', async () => {
  await setup()
  const panel = document.querySelector<HTMLElement>('.media-panel')!
  const root = document.documentElement
  const cases = [
    { themeMode: 'light', expected: 'rgb(242, 242, 247)' },
    { themeMode: 'sepia', expected: 'rgb(242, 242, 247)' },
    { themeMode: 'dark', expected: 'rgb(0, 0, 0)' },
    { themeMode: 'custom', customBackgroundColor: '#112233', expected: 'rgb(0, 0, 0)' },
    { themeMode: 'custom', customBackgroundColor: '#fafafa', expected: 'rgb(242, 242, 247)' },
    { themeMode: 'automatic', expected: matchMedia('(prefers-color-scheme: dark)').matches ? 'rgb(0, 0, 0)' : 'rgb(242, 242, 247)' },
  ] as const
  for (const { expected, ...preferences } of cases) {
    applyReaderPreferences({ ...defaultReaderPreferences, ...preferences })
    expect(getComputedStyle(panel).backgroundColor).toBe(expected)
    expect(getComputedStyle(root).getPropertyValue('--header-audio-ink').trim())
      .toBe(expected === 'rgb(0, 0, 0)' ? '#62b3ff' : '#006bc7')
  }
  await page.getByRole('tab', { name: 'Storage', exact: true }).click()
  expect(getComputedStyle(panel).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
})

test('bulk download requires confirmation and cancel keeps the queue unchanged', async () => {
  await page.viewport(320, 844)
  const { library } = await setup(0)
  const download = document.querySelector<HTMLButtonElement>('.media-download')!
  expect(download.scrollWidth).toBeLessThanOrEqual(download.clientWidth)
  expect(download.getBoundingClientRect().height).toBe(44)
  await page.screenshot({ path: '../../.vitest-attachments/media-empty-320.png' })
  await page.getByRole('button', { name: 'Download library', exact: true }).click()
  await expect.element(page.getByRole('heading', { name: 'Download library?', exact: true })).toBeVisible()
  expect(library.snapshot().inventory).toHaveLength(0)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(library.snapshot().entries.every((entry) => entry.phase === 'idle')).toBe(true)
})

test('low-space batch rejection is visible and leaves individual download actions available', async () => {
  const { library, backend } = await setup(0)
  vi.mocked(backend.preflight!).mockRejectedValueOnce(new Error('Not enough storage. Remove downloads or choose fewer recordings.'))
  await page.getByRole('button', { name: 'Download library', exact: true }).click()
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  await expect.element(page.getByRole('alert')).toHaveTextContent('Not enough storage. Remove downloads or choose fewer recordings.')
  expect(library.snapshot().entries.every((entry) => entry.phase === 'idle')).toBe(true)
  expect(backend.download).not.toHaveBeenCalled()
  await page.getByRole('button', { name: /Beresheet.*remaining/ }).click()
  await page.getByRole('button', { name: 'Download Beresheet Aliyah 1', exact: true }).click()
  await expect.poll(() => library.snapshot().inventory.length).toBe(1)
  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
})

test('removal is Storage-only, confirmed, and deferred for current playback', async () => {
  const { backend, library } = await setup(1, true)
  await expect.element(page.getByRole('button', { name: 'Remove downloads', exact: true })).not.toBeInTheDocument()
  await page.getByRole('tab', { name: 'Storage', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Select Beresheet Aliyah 1', exact: true }).click()
  await page.getByRole('button', { name: 'Remove downloads', exact: true }).click()
  await expect.element(page.getByRole('heading', { name: 'Remove downloads?', exact: true })).toBeVisible()
  await page.screenshot({ path: '../../.vitest-attachments/media-confirm.png' })
  expect(backend.remove).not.toHaveBeenCalled()
  await page.getByRole('button', { name: 'Remove downloads', exact: true }).click()
  await expect.poll(() => library.snapshot().entries[0].phase).toBe('removal-pending')
  expect(backend.remove).not.toHaveBeenCalled()
  await expect.element(page.getByText('Removal pending: current playback session', { exact: true })).toBeVisible()
})

test('empty downloaded filter, Hebrew search and closing preserve Reader focus and owner', async () => {
  const { api, trigger, backend } = await setup(0)
  await page.getByRole('combobox', { name: 'Download filter', exact: true }).selectOptions('downloaded')
  await expect.element(page.getByText('No downloaded readings.', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Download filter', exact: true }).selectOptions('all')
  await page.getByRole('searchbox', { name: 'Search parshiot', exact: true }).fill('בראשית')
  await expect.element(page.getByRole('button', { name: /Noach/ })).not.toBeInTheDocument()
  api.close()
  await expect.poll(() => document.activeElement).toBe(trigger)
  expect(backend.destroy).not.toHaveBeenCalled()
})

test('dialog isolates Reader shortcuts and both tabs pass accessibility checks', async () => {
  await setup()
  const key = vi.fn()
  document.addEventListener('keydown', key)
  try {
    document.querySelector('.media-panel')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(key).not.toHaveBeenCalled()
    expect((await axe.run(document.querySelector('.media-panel')!)).violations).toEqual([])
    await page.getByRole('tab', { name: 'Storage', exact: true }).click()
    await expect.element(page.getByRole('img', { name: /^Measured storage:/ })).toBeVisible()
    expect((await axe.run(document.querySelector('.media-panel')!)).violations).toEqual([])
  } finally { document.removeEventListener('keydown', key) }
})
