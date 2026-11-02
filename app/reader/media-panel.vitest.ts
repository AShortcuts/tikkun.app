import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { flushSync, mount, unmount } from 'svelte'
import '../../css/master.css'
import { audioRecordings, audioNarrators } from '../../generated/audio-manifest.ts'
import { createDownloadLibrary } from '../offline/download-library.ts'
import { descriptorForRecording } from '../offline/recording-download.ts'
import { recordingAssetKey, resolveRecordingAsset, type RecordingStorage } from '../offline/recording-storage.ts'
import type { StoredRecording } from '../offline/recording-inventory.ts'
import type { MediaReading } from '../offline/media-catalog.ts'
import type { MediaPanelApi } from './media-panel.ts'
import MediaPanel from './MediaPanel.svelte'

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
