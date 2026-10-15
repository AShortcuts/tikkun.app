import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { CUE_AUTHORING_PANEL_OPEN_KEY, CUE_AUTHORING_UNLOCKED_KEY } from '../admin/access.ts'
import { getAdminDraftStorageKey } from '../admin/draft-storage.ts'
import { createCueDraftPayload } from '../audio/cue-draft.ts'
import { publishedCueSourceForRecording } from '../audio/cue-data.ts'
import { getCueProgressForRecording } from '../audio/library.ts'
import { loadPassageTokens } from '../audio/passage-tokens.ts'
import { createRecordingRangeResolver } from '../audio/recording-ranges.ts'
import { audioRecordings } from '../data/audio-catalog.ts'
import { parseTokenKey } from './token-position.ts'

let frame: HTMLIFrameElement | null = null
const restoredStorage: Array<{ storage: Storage; key: string; value: string | null }> = []

afterEach(() => {
  frame?.remove()
  frame = null
  for (const { storage, key, value } of restoredStorage.reverse()) {
    if (value === null) storage.removeItem(key)
    else storage.setItem(key, value)
  }
  restoredStorage.length = 0
})

function setStorage(storage: Storage, key: string, value: string | null) {
  restoredStorage.push({ storage, key, value: storage.getItem(key) })
  if (value === null) storage.removeItem(key)
  else storage.setItem(key, value)
}

function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const result = frame?.contentDocument?.querySelector<T>(selector)
  if (!result) throw new Error(`Admin audio test requires ${selector}`)
  return result
}

const inlineSelector = '[data-audio-button="true"][data-aliyah-index="7"]'
const railSelector = '.aliyah-rail-button[data-aliyah-index="7"]'
const panelSelector = '[data-target-id="cue-authoring-panel-root"]'
const recording = audioRecordings.find(entry => entry.id === 'vezot-haberacha-7')
if (!recording) throw new Error('Missing seventh aliyah recording fixture')
const publishedProgress = await getCueProgressForRecording(recording)
const publishedStatus = publishedCueSourceForRecording(recording)
  ? publishedProgress.isComplete ? 'published' : publishedProgress.isUnfinished ? 'pending' : 'none'
  : 'none'

async function clickPlay(width: number) {
  const selector = width < 768 ? '[data-target-id="mobile-aliyah-play-toggle"]' : inlineSelector
  element(selector).dataset.testid = 'uncued-aliyah-play'
  await page.frameLocator(page.getByTitle('Published cue status and admin playback'))
    .getByTestId('uncued-aliyah-play').click({ timeout: 5000 })
}

async function openReader(width: number, readerTextLayout = 'match', readerSideMode = 'one') {
  await page.viewport(1440, 1000)
  setStorage(localStorage, 'tikkun.reader-preferences', JSON.stringify({ readerTextLayout, readerSideMode }))
  setStorage(sessionStorage, CUE_AUTHORING_UNLOCKED_KEY, '1')
  setStorage(sessionStorage, CUE_AUTHORING_PANEL_OPEN_KEY, '1')
  frame = document.createElement('iframe')
  frame.title = 'Published cue status and admin playback'
  frame.style.cssText = `display:block;width:${width}px;height:900px;border:0`
  frame.src = `/reader/?admin-audio=${Date.now()}#/torah/parsha/vezot-haberacha/5-34-1`
  document.body.append(frame)
  await vi.waitFor(() => {
    expect(element('[data-target-id="app-root"]').dataset.readerBootState).toBe('ready')
    expect(frame?.contentDocument?.documentElement.dataset.readerMode).toBe('admin-authoring')
    expect(element('.aliyah-rail-button[data-aliyah-index="1"]').dataset.cueStatus).toBe('published')
  }, { timeout: 15_000, interval: 50 })
}

function expectCueStatus(status: 'none' | 'local-draft' | 'published' | 'pending') {
  const tone = status === 'published' ? 'normal' : 'cue'
  const inline = element<HTMLButtonElement>(inlineSelector)
  expect(element(railSelector).dataset.cueStatus).toBe(status)
  expect(element(railSelector).dataset.runId).toBe(inline.dataset.runId)
  expect(inline.dataset.cueStatus).toBe(status)
  expect(inline.dataset.audioTone).toBe(tone)
  expect(inline.getAttribute('aria-disabled')).toBe('false')
  expect(element('[data-target-id="toolbar-current-aliyah-audio"]').dataset.audioTone).toBe(tone)
  expect(element('[data-target-id="mobile-aliyah-capsule"]').dataset.audioTone).toBe(tone)
  expect(element('.mobile-aliyah-play[data-aliyah-index="7"]').dataset.audioTone).toBe(tone)
}

test.each([
  [1280, 'match', 'one'], [1280, 'match', 'two'],
  [1280, 'reading', 'one'], [1280, 'reading', 'two'],
  [390, 'match', 'one'], [390, 'match', 'two'],
  [390, 'reading', 'one'], [390, 'reading', 'two'],
] as const)('uses the seventh aliyah published cue file across reader controls at %ipx / %s / %s', async (width, layout, sides) => {
  setStorage(localStorage, getAdminDraftStorageKey('vezot-haberacha-7'), null)
  await openReader(width, layout, sides)
  await vi.waitFor(() => expectCueStatus(publishedStatus))
  expect(frame?.contentDocument?.querySelectorAll('.aliyah-rail-button')).toHaveLength(7)
  // Reading hides the inline gutter; mobile provides its own visible play control.
  if (width < 768 || layout === 'match') {
    await clickPlay(width)
    await vi.waitFor(() => {
      expect(element(panelSelector).textContent).toContain('Vezot Haberacha Aliyah 7')
      expect(element<HTMLAudioElement>('audio').currentSrc).toContain('/vezot-haberacha/7.m4a')
      expectCueStatus(publishedStatus)
    }, { timeout: 10_000, interval: 50 })
    const audio = element<HTMLAudioElement>('audio')
    await vi.waitFor(() => expect(audio.paused).toBe(false))
    await clickPlay(width)
    await vi.waitFor(() => expect(audio.paused).toBe(true))
    expectCueStatus(publishedStatus)
  }
}, 30_000)

test.each([1280, 390])('a complete local cue draft cannot turn the seventh aliyah green or blue at %ipx', async width => {
  const range = createRecordingRangeResolver()(recording)
  if (!range) throw new Error('Missing seventh aliyah recording range')
  const tokenKeys = await loadPassageTokens(range)
  const draft = createCueDraftPayload({
    recording, tokenKeys, tokenCount: tokenKeys.length, tokenPointer: tokenKeys.length - 1,
    updatedAt: Date.now(),
    cues: tokenKeys.map((key, index) => {
      const position = parseTokenKey(key)
      if (!position) throw new Error(`Invalid fixture token ${key}`)
      return { ...position, timeStart: index, timeEnd: index + 0.9 }
    }),
  })
  const key = getAdminDraftStorageKey(recording.id)
  setStorage(localStorage, key, JSON.stringify(draft))
  await openReader(width)
  await vi.waitFor(() => expectCueStatus('local-draft'))
  await clickPlay(width)
  await vi.waitFor(() => {
    expect(element(panelSelector).textContent).toContain(`${tokenKeys.length} / ${tokenKeys.length}`)
    expectCueStatus('local-draft')
  }, { timeout: 10_000, interval: 50 })
  const audio = element<HTMLAudioElement>('audio')
  await vi.waitFor(() => expect(audio.currentTime).toBeGreaterThan(0))
  await clickPlay(width)
  await vi.waitFor(() => expect(audio.paused).toBe(true))
  localStorage.removeItem(key)
  await vi.waitFor(() => expectCueStatus(publishedStatus))
  localStorage.setItem(key, JSON.stringify(draft))
  await vi.waitFor(() => expectCueStatus('local-draft'))
}, 30_000)
