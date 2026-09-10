import { afterEach, expect, test, vi } from 'vitest'
import publishedSecond from '../../audio-cues/yoni-davidov/beresheet/2.json'
import { getAdminDraftStorageKey } from '../admin/draft-storage.ts'
import { createCueDraftPayload } from '../audio/cue-draft.ts'
import { parseCueExportPayload } from '../audio/cue-validation.ts'
import { audioRecordings } from '../data/audio-catalog.ts'
import { formatTokenKey } from './token-position.ts'

let frame: HTMLIFrameElement | null = null
const previousDrafts = new Map<string, string | null>()

afterEach(() => {
  frame?.remove()
  frame = null
  for (const [key, value] of previousDrafts) {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  }
  previousDrafts.clear()
})

function isolateDrafts() {
  for (const recording of audioRecordings) {
    if (recording.reading.id !== 'beresheet') continue
    const key = getAdminDraftStorageKey(recording.id)
    previousDrafts.set(key, localStorage.getItem(key))
    localStorage.removeItem(key)
  }
}

async function openReader(hash = '#/torah/parsha/beresheet/1-1-1') {
  frame = document.createElement('iframe')
  frame.title = 'Aliyah cue status runtime test'
  frame.style.width = '1280px'
  frame.style.height = '900px'
  frame.src = `/reader/?cue-status=${Date.now()}${hash}`
  document.body.append(frame)
  await vi.waitFor(() => {
    expect(frame?.contentDocument?.querySelector('[data-page-number]')).toBeTruthy()
    expect(dot('1')?.dataset.cueStatus).toBe('published')
  }, { timeout: 15_000, interval: 50 })
}

function dot(aliyah: string) {
  return frame?.contentDocument?.querySelector<HTMLElement>(
    `.aliyah-rail-button[data-aliyah-index="${aliyah}"]`
  )
}

test('loads complete cue dots on first visit without opening or saving recordings', async () => {
  isolateDrafts()
  await openReader()
  await vi.waitFor(() => {
    for (let aliyah = 1; aliyah <= 7; aliyah++) {
      expect(dot(String(aliyah))?.dataset.cueStatus).toBe('published')
    }
  }, { timeout: 15_000, interval: 50 })
}, 30_000)

test('keeps desktop dots on the displayed reading when the preceding parsha is also loaded', async () => {
  await openReader('#/torah/parsha/behalotecha/4-8-15')
  await vi.waitFor(() => {
    const compact = frame?.contentDocument?.querySelector<HTMLElement>('.mobile-aliyah-segment')
    expect(compact?.dataset.runId).toBeTruthy()
    expect(dot('2')?.dataset.runId).toBe(compact?.dataset.runId)
    expect(dot('2')?.dataset.cueStatus).toBe('published')
  }, { timeout: 5_000, interval: 50 })
}, 30_000)

test('shows an inactive aliyah draft immediately and follows changes from another tab', async () => {
  isolateDrafts()
  const recording = audioRecordings.find(({ id }) => id === 'beresheet-2')
  const published = parseCueExportPayload(publishedSecond)
  if (!recording || !published) throw new Error('Missing real cue fixture')
  const key = getAdminDraftStorageKey(recording.id)
  const draft = createCueDraftPayload({
    recording,
    tokenCount: published.tokenCount,
    tokenKeys: published.cues.map(formatTokenKey),
    cues: published.cues.slice(0, 1),
    tokenPointer: 0,
    updatedAt: Date.now(),
  })
  localStorage.setItem(key, JSON.stringify(draft))
  await openReader()
  await vi.waitFor(() => {
    expect(dot('2')?.dataset.cueStatus).toBe('local-draft')
  }, { timeout: 15_000, interval: 50 })

  // The parent and Reader iframe are separate same-origin storage clients.
  localStorage.removeItem(key)
  await vi.waitFor(() => {
    expect(dot('2')?.dataset.cueStatus).toBe('published')
  })

  localStorage.setItem(key, JSON.stringify(draft))
  await vi.waitFor(() => {
    expect(dot('2')?.dataset.cueStatus).toBe('local-draft')
    expect(dot('1')?.dataset.cueStatus).toBe('published')
  })
}, 30_000)
