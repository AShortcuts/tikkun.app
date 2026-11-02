import { afterEach, expect, test, vi } from 'vitest'
import { commands, page } from 'vitest/browser'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import { resolveParshaRun } from '../view-model/navigation/parsha-routes.ts'
import { loadPassageSelection } from '../reading/passage-selection.ts'
import { BOOKMARKS_STORAGE_KEY, type ReaderBookmark } from './bookmarks.ts'
import { getVisibleReaderFocalWord } from '../reader-scroll.ts'
import { PLAYBACK_LEAD_SPACE_ENABLED } from './playback-lead-space.ts'

declare module 'vitest/internal/browser' {
  interface BrowserCommands {
    emulatePhoneTouch(): Promise<void>
    blockPhoneTextPage(pageNumber: number | null): Promise<void>
  }
}

let frame: HTMLIFrameElement | null = null
let savedStorage: Map<string, string> | null = null

afterEach(async () => {
  await commands.blockPhoneTextPage(null)
  frame?.contentDocument?.querySelector<HTMLAudioElement>('[data-target-id="reader-audio"]')?.pause()
  frame?.remove()
  frame = null
  if (savedStorage) {
    localStorage.clear()
    for (const [key, value] of savedStorage) localStorage.setItem(key, value)
    savedStorage = null
  }
  await page.viewport(390, 844)
})

async function openReader(hash: string, sides: 'one' | 'two' = 'one', layout = 'reading', bookmarks: ReaderBookmark[] = [],
  show?: 'parsha' | 'aliyah') {
  await commands.emulatePhoneTouch()
  savedStorage = new Map(Object.entries(localStorage))
  localStorage.clear()
  localStorage.setItem('tikkun.reader-preferences', JSON.stringify({
    readerTextLayout: layout, readerSideMode: sides, ...(show && { readerShow: show }),
  }))
  if (bookmarks.length) localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks))
  frame = document.createElement('iframe')
  frame.title = 'Isolated aliyah phone acceptance'
  frame.style.cssText = 'display:block;width:390px;height:844px;border:0'
  frame.src = `/reader/?isolated-test=${Date.now()}${hash}`
  document.body.append(frame)
  await vi.waitFor(() => {
    expect(frame?.contentDocument?.querySelector('[data-reader-boot-state="ready"]')).not.toBeNull()
    expect(frame?.contentDocument?.querySelector('.word[data-token-key]')).not.toBeNull()
  }, { timeout: 20_000, interval: 50 })
  expect(frame.contentWindow!.navigator.maxTouchPoints, 'phone touch fixture').toBeGreaterThan(0)
  expect(Math.min(frame.contentWindow!.screen.width, frame.contentWindow!.screen.height)).toBe(390)
  return frame.contentDocument!
}

function button(doc: Document, target: string) {
  return requiredButton(doc, target)
}

/** The remembered word stays on the focal row; words sharing that row tie for focus. */
function expectFocalRow(book: HTMLElement, tokenKey: string | undefined, message: string) {
  const focal = getVisibleReaderFocalWord(book)
  const word = book.querySelector<HTMLElement>(`[data-reader-canonical="true"] .word[data-token-key="${tokenKey}"]:not([hidden])`)
  expect(word, message).not.toBeNull()
  expect(Math.abs(focal!.getBoundingClientRect().top - word!.getBoundingClientRect().top), message).toBeLessThan(2)
}

function requiredButton(doc: Document, target: string) {
  const result = doc.querySelector<HTMLButtonElement>(`[data-target-id="${target}"]`)
  if (!result) throw new Error(`Missing ${target}`)
  return result
}

async function expectAliyah(doc: Document, index: number | 'Maftir') {
  await vi.waitFor(() => {
    expect(doc.defaultView?.location.hash).toMatch(new RegExp(`/aliyah/${index}$`))
    expect(doc.querySelector('[data-target-id="tikkun-book"]')?.getAttribute('aria-busy')).toBeNull()
    expect(doc.querySelector('.mobile-aliyah-segment[aria-current="location"]')?.getAttribute('data-aliyah-index')).toBe(String(index))
  }, { timeout: 15_000, interval: 30 })
}

test('only the selected passage is mounted, with all divisions and correctly aligned endpoint controls', async () => {
  const doc = await openReader('#/torah/parsha/beresheet')
  await expectAliyah(doc, 1)
  expect(doc.documentElement.dataset.readerIsolated).toBe('true')
  expect(doc.querySelectorAll('.mobile-aliyah-segment')).toHaveLength(8)
  const next = button(doc, 'isolated-aliyah-next')
  const previous = button(doc, 'isolated-aliyah-previous')
  expect(previous.disabled).toBe(true)
  expect(next.disabled).toBe(false)
  expect(previous.getBoundingClientRect().left).toBeLessThan(next.getBoundingClientRect().left)
  expect(next.getBoundingClientRect().width).toBeGreaterThanOrEqual(44)
  const surface = next.querySelector<HTMLElement>('.isolated-aliyah-step-surface')!
  expect(surface.getBoundingClientRect().width).toBe(32)
  const generator = new LeiningGenerator({ ashkenazi: true, israel: false, includeModernHolidays: false })
  const run = resolveParshaRun(generator, 'beresheet')!.run
  const passage = await loadPassageSelection([run.aliyot[0]])
  const allowed = new Set([...passage.projection.annotated, ...passage.projection.unannotated])
  const actual = [...doc.querySelectorAll<HTMLElement>('.word[data-token-key]')].map(word => word.dataset.tokenKey!)
  expect(actual.length).toBeGreaterThan(100)
  expect(actual.every(key => allowed.has(key))).toBe(true)
  const book = doc.querySelector<HTMLElement>('[data-target-id="tikkun-book"]')!
  book.scrollTop = book.scrollHeight
  book.dispatchEvent(new Event('scroll'))
  await new Promise(resolve => setTimeout(resolve, 100))
  expect([...doc.querySelectorAll<HTMLElement>('.word[data-token-key]')].every(word => allowed.has(word.dataset.tokenKey!))).toBe(true)
}, 30_000)

test('resizing keeps One aliyah, switches only the phone chrome at 550px, and preserves the focal token, preference and history', async () => {
  const doc = await openReader('#/torah/parsha/beresheet/1-2-4/aliyah/2', 'two')
  await expectAliyah(doc, 2)
  const view = doc.defaultView!
  Object.defineProperty(view.navigator, 'maxTouchPoints', { configurable: true, value: 0 })
  Object.defineProperties(view.screen, {
    width: { configurable: true, value: 1920 },
    height: { configurable: true, value: 1080 },
  })
  const historyLength = view.history.length
  const book = doc.querySelector<HTMLElement>('.tikkun-book')!
  const resize = async (width: number, height = 900) => {
    await page.viewport(width, height)
    frame!.style.width = `${width}px`
    frame!.style.height = `${height}px`
  }
  await resize(1200)
  await vi.waitFor(() => {
    expect(doc.documentElement.dataset.readerIsolated).toBe('true')
    expect(doc.documentElement.dataset.readerPhone).toBeUndefined()
    expect(book.getAttribute('aria-busy')).toBeNull()
    expect(book.dataset.readerSides).toBe('two')
  }, { timeout: 15_000 })
  await expectAliyah(doc, 2)
  expect(doc.querySelector('[data-target-id="isolated-aliyah-controls"]')).toBeNull()
  // Mid-passage, so the focal word stays restorable at every width.
  book.scrollTop = book.scrollHeight * 0.4
  book.dispatchEvent(new Event('scroll'))
  await new Promise(resolve => view.requestAnimationFrame(() => view.requestAnimationFrame(resolve)))
  const focalKey = getVisibleReaderFocalWord(book)!.dataset.tokenKey
  await resize(550)
  await vi.waitFor(() => expect(doc.documentElement.dataset.readerPhone).toBe('true'))
  await expectAliyah(doc, 2)
  expect(doc.documentElement.dataset.readerIsolated).toBe('true')
  await vi.waitFor(() => expect(book.dataset.readerSides).toBe('one'))
  expect(doc.querySelector('[data-target-id="isolated-aliyah-controls"]')).not.toBeNull()
  await vi.waitFor(() => expectFocalRow(book, focalKey, 'enter phone chrome'))
  const word = doc.querySelector('.word[data-token-key]')!
  await resize(430)
  await vi.waitFor(() => expect(view.innerWidth).toBe(430))
  await new Promise(resolve => view.requestAnimationFrame(() => view.requestAnimationFrame(resolve)))
  expect(word.isConnected).toBe(true)
  await resize(551)
  await vi.waitFor(() => {
    expect(doc.documentElement.dataset.readerPhone).toBeUndefined()
    expect(doc.documentElement.dataset.readerIsolated).toBe('true')
    expect(book.getAttribute('aria-busy')).toBeNull()
    expect(book.dataset.readerSides).toBe('two')
  }, { timeout: 15_000 })
  await vi.waitFor(() => expectFocalRow(book, focalKey, 'leave phone chrome'))
  expect(view.history.length).toBe(historyLength)
  expect(JSON.parse(localStorage.getItem('tikkun.reader-preferences')!).readerSideMode).toBe('two')
}, 30_000)

test('Whole parsha stays continuous across resizes and preserves the visible word', async () => {
  const doc = await openReader('#/torah/parsha/beresheet', 'two', 'reading', [], 'parsha')
  const book = doc.querySelector<HTMLElement>('.tikkun-book')!
  frame!.style.width = '1200px'
  await vi.waitFor(() => {
    expect(doc.documentElement.dataset.readerIsolated).toBeUndefined()
    expect(book.getAttribute('aria-busy')).toBeNull()
    expect(book.dataset.readerSides).toBe('two')
  }, { timeout: 15_000 })
  book.scrollTop = book.scrollHeight * 0.65
  book.dispatchEvent(new Event('scroll'))
  await new Promise(resolve => doc.defaultView!.requestAnimationFrame(() => doc.defaultView!.requestAnimationFrame(resolve)))
  const focalKey = getVisibleReaderFocalWord(book)!.dataset.tokenKey
  frame!.style.width = '390px'
  await vi.waitFor(() => {
    expect(doc.documentElement.dataset.readerPhone).toBe('true')
    expect(doc.documentElement.dataset.readerIsolated).toBeUndefined()
    expect(book.getAttribute('aria-busy')).toBeNull()
    expect(book.dataset.readerSides).toBe('one')
    expect(getVisibleReaderFocalWord(book)?.dataset.tokenKey).toBe(focalKey)
  }, { timeout: 15_000 })
}, 30_000)

test('selection, same-item no-op, endpoints, and browser Back/Forward preserve aliyah identity', async () => {
  const doc = await openReader('#/torah/parsha/beresheet')
  await expectAliyah(doc, 1)
  const view = doc.defaultView!
  const historyLength = view.history.length
  doc.querySelector<HTMLButtonElement>('.mobile-aliyah-segment[aria-current="location"]')!.click()
  expect(view.history.length).toBe(historyLength)
  button(doc, 'isolated-aliyah-next').click()
  await expectAliyah(doc, 2)
  expect(view.history.length).toBe(historyLength + 1)
  view.history.back()
  await expectAliyah(doc, 1)
  view.history.forward()
  await expectAliyah(doc, 2)
  doc.querySelector<HTMLButtonElement>('.mobile-aliyah-segment[data-aliyah-index="Maftir"]')!.click()
  await expectAliyah(doc, 'Maftir')
  expect(button(doc, 'isolated-aliyah-next').disabled).toBe(true)
  expect(button(doc, 'isolated-aliyah-previous').disabled).toBe(false)
}, 40_000)

test.each([true])('Play selecting another aliyah retains gesture authorization (rapid requests: %s)', async rapid => {
  const doc = await openReader('#/torah/parsha/beresheet')
  await expectAliyah(doc, 1)
  const audio = doc.querySelector<HTMLAudioElement>('[data-target-id="reader-audio"]')!
  const calls: Array<{ kind: string; inGesture: boolean; hash: string; source: string }> = []
  let inGesture = false
  let paused = true
  Object.defineProperties(audio, {
    paused: { configurable: true, get: () => paused },
    readyState: { configurable: true, value: 4 },
    duration: { configurable: true, value: 300 },
  })
  vi.spyOn(audio, 'load').mockImplementation(() => { calls.push({ kind: 'load', inGesture, hash: doc.defaultView!.location.hash, source: audio.src }) })
  vi.spyOn(audio, 'pause').mockImplementation(() => { paused = true; audio.dispatchEvent(new Event('pause')) })
  vi.spyOn(audio, 'play').mockImplementation(async () => {
    calls.push({ kind: 'play', inGesture, hash: doc.defaultView!.location.hash, source: audio.src })
    paused = false
    audio.dispatchEvent(new Event('play'))
    audio.dispatchEvent(new Event('playing'))
  })
  button(doc, 'mobile-aliyah-picker-toggle').click()
  let play: HTMLButtonElement | null = null
  await vi.waitFor(() => {
    play = doc.querySelector('.mobile-aliyah-play[data-aliyah-index="2"]')
    expect(play?.getAttribute('aria-disabled')).not.toBe('true')
    expect(play).not.toBeNull()
  }, { timeout: 10_000 })
  inGesture = true
  play!.click()
  if (rapid) {
    button(doc, 'mobile-aliyah-picker-toggle').click()
    doc.querySelector<HTMLButtonElement>('.mobile-aliyah-play[data-aliyah-index="3"]')!.click()
  }
  inGesture = false
  const authorization = calls.findIndex(call => call.kind === 'load' && call.inGesture && call.source)
  expect(authorization, JSON.stringify(calls)).toBeGreaterThanOrEqual(0)
  expect(calls[authorization].hash).toMatch(/\/aliyah\/1$/)
  const destination = rapid ? 3 : 2
  await expectAliyah(doc, destination)
  await vi.waitFor(() => expect(calls.some(call => call.kind === 'play' && !call.inGesture && call.hash.endsWith(`/aliyah/${destination}`)), JSON.stringify(calls)).toBe(true), { timeout: 10_000 })
  expect(calls.slice(authorization + 1).filter(call => call.kind === 'load' && !call.source && !call.inGesture)).toHaveLength(0)
  audio.dispatchEvent(new Event('ended'))
  await new Promise(resolve => setTimeout(resolve, 100))
  expect(doc.defaultView!.location.hash).toMatch(new RegExp(`/aliyah/${destination}$`))
  button(doc, 'isolated-aliyah-next').click()
  await expectAliyah(doc, destination + 1)
  expect(paused).toBe(true)
}, 30_000)

test.skipIf(!PLAYBACK_LEAD_SPACE_ENABLED)('Play makes room above the opening words so the highlight starts on the focal row, with pasuk numbers moving along', async () => {
  const doc = await openReader('#/torah/parsha/beresheet')
  await expectAliyah(doc, 1)
  const book = doc.querySelector<HTMLElement>('[data-target-id="tikkun-book"]')!
  const audio = doc.querySelector<HTMLAudioElement>('[data-target-id="reader-audio"]')!
  let paused = true
  Object.defineProperties(audio, {
    paused: { configurable: true, get: () => paused },
    readyState: { configurable: true, value: 4 },
    duration: { configurable: true, value: 300 },
  })
  vi.spyOn(audio, 'load').mockImplementation(() => {})
  vi.spyOn(audio, 'pause').mockImplementation(() => { paused = true; audio.dispatchEvent(new Event('pause')) })
  vi.spyOn(audio, 'play').mockImplementation(async () => {
    paused = false
    audio.dispatchEvent(new Event('play'))
    audio.dispatchEvent(new Event('playing'))
  })
  const firstWord = book.querySelector<HTMLElement>('[data-reader-canonical="true"] .word:not([hidden])')!
  const pasuk = [...book.querySelectorAll<HTMLElement>('.line-gutter.mod-verses .location-indicator')]
    .find(label => label.getBoundingClientRect().height > 0)!
  const pasukOffset = pasuk.getBoundingClientRect().top - firstWord.getBoundingClientRect().top
  expect(getVisibleReaderFocalWord(book)?.dataset.tokenKey, 'the opening word starts above the focal row').not.toBe(firstWord.dataset.tokenKey)

  button(doc, 'mobile-aliyah-play-toggle').click()
  await vi.waitFor(() => expect(paused).toBe(false), { timeout: 10_000 })
  await vi.waitFor(() => expectFocalRow(book, firstWord.dataset.tokenKey, 'the opening word reaches the focal row'), { timeout: 5_000 })
  expect(doc.querySelector('.is-active-word')).toBe(firstWord)
  expect(pasuk.getBoundingClientRect().top - firstWord.getBoundingClientRect().top).toBeCloseTo(pasukOffset, 0)

  button(doc, 'isolated-aliyah-next').click()
  await expectAliyah(doc, 2)
  expect(book.style.getPropertyValue('--reader-playback-lead'), 'the next aliyah starts without the added room').toBe('')
}, 30_000)

test('special service rail crosses run identities and stops after Maftir', async () => {
  const doc = await openReader('#/run/2026-10-04:shacharis,main/5-34-1/aliyah/6')
  await expectAliyah(doc, 6)
  expect(doc.querySelectorAll('.mobile-aliyah-segment')).toHaveLength(8)
  button(doc, 'isolated-aliyah-next').click()
  await expectAliyah(doc, 7)
  expect(doc.defaultView!.location.hash).toContain(':shacharis,last-aliyah/1-1-1/')
  button(doc, 'isolated-aliyah-next').click()
  await expectAliyah(doc, 'Maftir')
  expect(doc.defaultView!.location.hash).toContain(':shacharis,maftir/')
  expect(button(doc, 'isolated-aliyah-next').disabled).toBe(true)
}, 30_000)

test('a missing boundary shows an error with navigation available, and retry reloads the complete passage', async () => {
  await commands.emulatePhoneTouch()
  await commands.blockPhoneTextPage(1)
  savedStorage = new Map(Object.entries(localStorage))
  localStorage.clear()
  localStorage.setItem('tikkun.reader-preferences', JSON.stringify({ readerTextLayout: 'reading' }))
  frame = document.createElement('iframe')
  frame.style.cssText = 'display:block;width:390px;height:844px;border:0'
  frame.src = `/reader/?isolated-error=${Date.now()}#/torah/parsha/beresheet/1-1-1/aliyah/1`
  document.body.append(frame)
  await vi.waitFor(() => expect(frame?.contentDocument?.querySelector('.reader-passage-status[role="alert"]')).not.toBeNull(), { timeout: 20_000 })
  const doc = frame.contentDocument!
  await vi.waitFor(() => expect(doc.querySelector('[data-reader-boot-state="ready"]')).not.toBeNull())
  expect(doc.querySelector('.word[data-token-key]')).toBeNull()
  expect(button(doc, 'isolated-aliyah-next').disabled).toBe(false)
  await commands.blockPhoneTextPage(null)
  doc.querySelector<HTMLButtonElement>('.reader-passage-status button')!.click()
  await vi.waitFor(() => expect(frame?.contentDocument?.querySelector('.word[data-token-key]')).not.toBeNull(), { timeout: 20_000 })
  await expectAliyah(frame.contentDocument!, 1)
}, 40_000)
