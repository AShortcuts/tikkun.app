import { afterEach, expect, test, vi } from 'vitest'
import { commands, page } from 'vitest/browser'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import { resolveParshaRun } from '../view-model/navigation/parsha-routes.ts'
import { loadPassageSelection } from '../reading/passage-selection.ts'
import { createBookmark, BOOKMARKS_STORAGE_KEY, type ReaderBookmark } from './bookmarks.ts'
import { getVisibleReaderFocalWord } from '../reader-scroll.ts'

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

async function openReader(hash: string, sides: 'one' | 'two' = 'one', layout = 'reading', bookmarks: ReaderBookmark[] = []) {
  await commands.emulatePhoneTouch()
  savedStorage = new Map(Object.entries(localStorage))
  localStorage.clear()
  localStorage.setItem('tikkun.reader-preferences', JSON.stringify({ readerTextLayout: layout, readerSideMode: sides }))
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

test('a small non-touch viewport keeps isolated Reading and aliyah navigation', async () => {
  const doc = await openReader('#/torah/parsha/beresheet')
  Object.defineProperty(doc.defaultView!.navigator, 'maxTouchPoints', { configurable: true, value: 0 })
  Object.defineProperties(doc.defaultView!.screen, {
    width: { configurable: true, value: 1920 },
    height: { configurable: true, value: 1080 },
  })
  doc.defaultView!.location.hash = '#/torah/parsha/noach'
  await expectAliyah(doc, 1)
  expect(doc.documentElement.dataset.readerIsolated).toBe('true')
  button(doc, 'isolated-aliyah-next').click()
  await expectAliyah(doc, 2)
})

test('resizing a desktop window switches isolation at 550px and preserves the focal token, preference and history', async () => {
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
    expect(doc.documentElement.dataset.readerIsolated).toBeUndefined()
    expect(book.getAttribute('aria-busy')).toBeNull()
    expect(book.dataset.readerSides).toBe('two')
    expect(doc.querySelector('.is-active-word')).not.toBeNull()
  }, { timeout: 15_000 })
  const focalKey = doc.querySelector<HTMLElement>('.is-active-word')!.dataset.tokenKey
  await resize(550)
  await vi.waitFor(() => expect(doc.documentElement.dataset.readerIsolated).toBe('true'))
  await expectAliyah(doc, 2)
  expect(doc.documentElement.dataset.readerIsolated).toBe('true')
  expect(book.dataset.readerSides).toBe('one')
  await vi.waitFor(() => expect(doc.querySelector<HTMLElement>('.is-active-word')?.dataset.tokenKey, 'enter isolation').toBe(focalKey))
  const word = doc.querySelector('.word[data-token-key]')!
  await resize(430)
  await vi.waitFor(() => expect(view.innerWidth).toBe(430))
  await new Promise(resolve => view.requestAnimationFrame(() => view.requestAnimationFrame(resolve)))
  expect(word.isConnected).toBe(true)
  await resize(551)
  await vi.waitFor(() => {
    expect(doc.documentElement.dataset.readerIsolated).toBeUndefined()
    expect(book.getAttribute('aria-busy')).toBeNull()
    expect(book.dataset.readerSides).toBe('two')
  }, { timeout: 15_000 })
  await vi.waitFor(() => expect(doc.querySelector<HTMLElement>('.is-active-word')?.dataset.tokenKey, 'leave isolation').toBe(focalKey))
  expect(view.history.length).toBe(historyLength)
  expect(JSON.parse(localStorage.getItem('tikkun.reader-preferences')!).readerSideMode).toBe('two')
}, 30_000)

test('rapid viewport reversals settle on the latest size without stale passage restoration', async () => {
  const doc = await openReader('#/torah/parsha/beresheet/1-2-4/aliyah/2')
  await expectAliyah(doc, 2)
  const view = doc.defaultView!
  const historyLength = view.history.length
  for (const width of [1000, 390, 1000, 390]) {
    frame!.style.width = `${width}px`
    await new Promise(resolve => view.requestAnimationFrame(() => view.requestAnimationFrame(resolve)))
  }
  await expectAliyah(doc, 2)
  await new Promise(resolve => setTimeout(resolve, 100))
  expect(doc.documentElement.dataset.readerIsolated).toBe('true')
  expect(view.history.length).toBe(historyLength)
  expect(doc.querySelector('.reader-passage-status')).toBeNull()
}, 30_000)

test('resizing after manual scrolling preserves the visible word instead of a paused highlight', async () => {
  const doc = await openReader('#/torah/parsha/beresheet', 'two')
  const book = doc.querySelector<HTMLElement>('.tikkun-book')!
  frame!.style.width = '1200px'
  await vi.waitFor(() => {
    expect(doc.documentElement.dataset.readerIsolated).toBeUndefined()
    expect(book.getAttribute('aria-busy')).toBeNull()
    expect(doc.querySelector('.is-active-word')).not.toBeNull()
  }, { timeout: 15_000 })
  const pausedKey = doc.querySelector<HTMLElement>('.is-active-word')!.dataset.tokenKey
  book.scrollTop = book.scrollHeight * 0.65
  book.dispatchEvent(new Event('scroll'))
  await new Promise(resolve => doc.defaultView!.requestAnimationFrame(() => doc.defaultView!.requestAnimationFrame(resolve)))
  const focalKey = getVisibleReaderFocalWord(book)!.dataset.tokenKey
  expect(focalKey).not.toBe(pausedKey)
  frame!.style.width = '390px'
  await vi.waitFor(() => {
    expect(doc.documentElement.dataset.readerIsolated).toBe('true')
    expect(book.getAttribute('aria-busy')).toBeNull()
    expect(doc.querySelector<HTMLElement>('.is-active-word')?.dataset.tokenKey).toBe(focalKey)
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

test.each(['one', 'two'] as const)('rotation keeps isolation and saved %s side preference', async sides => {
  const doc = await openReader('#/torah/parsha/beshalach/2-14-26/aliyah/4', sides)
  await expectAliyah(doc, 4)
  const book = doc.querySelector<HTMLElement>('[data-target-id="tikkun-book"]')!
  expect(book.dataset.readerSides).toBe('one')
  const hash = doc.defaultView!.location.hash
  await page.viewport(844, 390)
  frame!.style.width = '844px'
  frame!.style.height = '390px'
  await vi.waitFor(() => expect(book.dataset.readerSides).toBe(sides))
  expect(doc.documentElement.dataset.readerIsolated).toBe('true')
  expect(doc.defaultView!.location.hash).toBe(hash)
  expect(button(doc, 'isolated-aliyah-next').getBoundingClientRect().width).toBe(44)
  expect(button(doc, 'mobile-aliyah-play-toggle').getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  expect(button(doc, 'mobile-aliyah-picker-toggle').getBoundingClientRect().width).toBeGreaterThan(0)
  button(doc, 'mobile-aliyah-picker-toggle').click()
  await vi.waitFor(() => expect(doc.querySelector('.mobile-aliyah-sheet')?.getBoundingClientRect().height).toBeGreaterThan(100))
  doc.querySelector<HTMLButtonElement>('.mobile-aliyah-sheet-close')!.click()
  expect(JSON.parse(localStorage.getItem('tikkun.reader-preferences')!).readerSideMode).toBe(sides)
  frame!.style.width = '390px'
  frame!.style.height = '844px'
  await page.viewport(390, 844)
  await vi.waitFor(() => expect(book.dataset.readerSides).toBe('one'))
  expect(doc.defaultView!.location.hash).toBe(hash)
}, 30_000)

test('rapid rail requests reveal only the latest selected aliyah', async () => {
  const doc = await openReader('#/torah/parsha/beresheet')
  await expectAliyah(doc, 1)
  for (const index of [2, 4, 3]) {
    doc.querySelector<HTMLButtonElement>(`.mobile-aliyah-segment[data-aliyah-index="${index}"]`)!.click()
  }
  await expectAliyah(doc, 3)
  await new Promise(resolve => setTimeout(resolve, 200))
  await expectAliyah(doc, 3)
  expect(doc.querySelector('.reader-passage-status')).toBeNull()
  for (const index of [4, 3]) {
    doc.querySelector<HTMLButtonElement>(`.mobile-aliyah-segment[data-aliyah-index="${index}"]`)!.click()
  }
  await expectAliyah(doc, 3)
}, 30_000)

test('phone Match remains continuous and has no isolated controls', async () => {
  const doc = await openReader('#/torah/parsha/beresheet', 'one', 'match')
  expect(doc.documentElement.dataset.readerIsolated).toBeUndefined()
  expect(doc.querySelector('[data-target-id="isolated-aliyah-controls"]')).toBeNull()
  expect(doc.defaultView!.location.hash).not.toContain('/aliyah/')
}, 30_000)

test('switching between Reading and Match preserves the selected reading and focal word without history entries', async () => {
  const doc = await openReader('#/torah/parsha/beshalach/2-15-1/aliyah/4')
  await expectAliyah(doc, 4)
  const view = doc.defaultView!
  const historyLength = view.history.length
  button(doc, 'settings-toggle').click()
  await vi.waitFor(() => expect(doc.querySelector('[data-reader-text-layout="match"]')).not.toBeNull())
  doc.querySelector<HTMLButtonElement>('[data-reader-text-layout="match"]')!.click()
  await vi.waitFor(() => {
    expect(doc.documentElement.dataset.readerIsolated).toBeUndefined()
    expect(doc.querySelector('[data-target-id="tikkun-book"]')?.getAttribute('aria-busy')).toBeNull()
    expect(doc.querySelector('.is-active-word')).not.toBeNull()
  })
  const focal = doc.querySelector<HTMLElement>('.is-active-word')!.dataset.tokenKey
  expect(doc.querySelector('[data-target-id="isolated-aliyah-controls"]')).toBeNull()
  doc.querySelector<HTMLButtonElement>('[data-reader-text-layout="reading"]')!.click()
  await expectAliyah(doc, 4)
  expect(doc.querySelector(`.is-active-word[data-token-key="${focal}"]`)).not.toBeNull()
  expect(view.history.length).toBe(historyLength)
}, 30_000)

test.each([false, true])('Play selecting another aliyah retains gesture authorization (rapid requests: %s)', async rapid => {
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

async function openBookmark(doc: Document, bookmark: ReaderBookmark) {
  button(doc, 'parsha-title').click()
  await vi.waitFor(() => expect(doc.querySelector('[role="combobox"]')).not.toBeNull())
  const search = doc.querySelector<HTMLInputElement>('[role="combobox"]')!
  search.value = bookmark.label
  search.dispatchEvent(new Event('input', { bubbles: true }))
  let result: HTMLButtonElement | null = null
  await vi.waitFor(() => {
    result = doc.querySelector<HTMLButtonElement>(`[data-action-id="checkpoint.${bookmark.id}"] button`)
    expect(result).not.toBeNull()
  })
  result!.click()
}

test('same-hash bookmarks restore a hidden exact token without rewriting stored records', async () => {
  const generator = new LeiningGenerator({ ashkenazi: true, israel: false, includeModernHolidays: false })
  const run = resolveParshaRun(generator, 'beshalach')!.run
  const fourth = run.aliyot.find(aliyah => aliyah.index === 4)!
  const passage = await loadPassageSelection([fourth])
  const tokenKey = [...passage.tokenKeys][1]
  const hash = '#/torah/parsha/beshalach/2-13-17/aliyah/1'
  const bookmark = createBookmark({ hash, tokenKey, label: 'Exact saved word', createdAt: 1 })
  const doc = await openReader(hash, 'one', 'reading', [bookmark])
  await expectAliyah(doc, 1)
  const stored = localStorage.getItem(BOOKMARKS_STORAGE_KEY)
  expect(doc.querySelector(`[data-token-key="${tokenKey}"]`)).toBeNull()
  await openBookmark(doc, bookmark)
  await expectAliyah(doc, 4)
  await vi.waitFor(() => expect(doc.querySelector(`.is-active-word[data-token-key="${tokenKey}"]`)).not.toBeNull())
  expect(localStorage.getItem(BOOKMARKS_STORAGE_KEY)).toBe(stored)
}, 30_000)

test('an overlapping bookmark keeps its explicitly encoded seventh aliyah', async () => {
  const generator = new LeiningGenerator({ ashkenazi: true, israel: false, includeModernHolidays: false })
  const run = resolveParshaRun(generator, 'beresheet')!.run
  const maftir = run.aliyot.find(aliyah => aliyah.index === 'Maftir')!
  const passage = await loadPassageSelection([maftir])
  const tokenKey = [...passage.tokenKeys][1]
  const ref = maftir.start
  const hash = `#/torah/parsha/beresheet/${ref.b}-${ref.c}-${ref.v}/aliyah/7`
  const bookmark = createBookmark({ hash, tokenKey, label: 'Seventh saved word', createdAt: 2 })
  const doc = await openReader('#/torah/parsha/beresheet', 'one', 'reading', [bookmark])
  await openBookmark(doc, bookmark)
  await expectAliyah(doc, 7)
  expect(doc.querySelector(`.is-active-word[data-token-key="${tokenKey}"]`)).not.toBeNull()
}, 30_000)

test.each([
  { hash: '#/torah/parsha/beresheet/1-1-1/aliyah/1', tokenKey: '1:1:0:8', label: 'ורוח', aliyah: 1, plainKey: '1:1:0:8', canonicalKey: '1:1:0:7' },
  { hash: '#/torah/parsha/beresheet/1-4-19/aliyah/5', tokenKey: '5:0:0:3', label: 'למך', aliyah: 4, plainKey: '5:0:0:3', canonicalKey: '5:0:0:2' },
  { hash: '#/torah/parsha/noach/1-6-9/aliyah/1', tokenKey: '8:36:0:4', label: 'הַיְצֵ֣א', aliyah: 4, plainKey: '8:36:0:6', canonicalKey: '8:36:0:4' },
])('legacy bookmark $tokenKey restores its actual word and division in unpointed Reading', async ({ hash, tokenKey, label, aliyah, plainKey, canonicalKey }) => {
  const bookmark = createBookmark({ hash, tokenKey, label, createdAt: 3 })
  const doc = await openReader(hash, 'two', 'reading', [bookmark])
  button(doc, 'toolbar-overflow-toggle').click()
  doc.querySelector<HTMLButtonElement>('[data-toolbar-overflow-action="annotations"]')!.click()
  expect(doc.querySelector('.tikkun-book')?.classList.contains('mod-annotations-on')).toBe(false)
  const stored = localStorage.getItem(BOOKMARKS_STORAGE_KEY)
  await openBookmark(doc, bookmark)
  await expectAliyah(doc, aliyah)
  await vi.waitFor(() => expect(doc.querySelector(`.is-active-word[data-token-key="${plainKey}"]:not([hidden])`)).not.toBeNull())
  expect(localStorage.getItem(BOOKMARKS_STORAGE_KEY)).toBe(stored)
  await page.viewport(844, 390)
  frame!.style.width = '844px'
  frame!.style.height = '390px'
  await vi.waitFor(() => {
    expect(doc.querySelector('.tikkun-book')?.getAttribute('data-reader-sides')).toBe('two')
    expect(doc.querySelector(`.is-active-word[data-token-key="${canonicalKey}"]:not([hidden])`)).not.toBeNull()
  })
  await page.viewport(390, 844)
  frame!.style.width = '390px'
  frame!.style.height = '844px'
  await vi.waitFor(() => {
    expect(doc.querySelector('.tikkun-book')?.getAttribute('data-reader-sides')).toBe('one')
    expect(doc.querySelectorAll('.is-active-word:not([hidden])')).toHaveLength(1)
    expect(doc.querySelector(`.is-active-word[data-token-key="${plainKey}"]:not([hidden])`)).not.toBeNull()
  })
  button(doc, 'toolbar-overflow-toggle').click()
  doc.querySelector<HTMLButtonElement>('[data-toolbar-overflow-action="annotations"]')!.click()
  expect(doc.querySelectorAll('.is-active-word:not([hidden])').length).toBeGreaterThan(0)
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
