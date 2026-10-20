import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { loadBookmarks } from './bookmarks.ts'
import { compareTokenPositions, parseTokenKey } from './token-position.ts'

let frame: HTMLIFrameElement | null = null
let savedStorage: Map<string, string> | null = null

afterEach(() => {
  frame?.remove()
  frame = null
  if (savedStorage) {
    localStorage.clear()
    for (const [key, value] of savedStorage) localStorage.setItem(key, value)
    savedStorage = null
  }
})

test.each([
  [389, 'match', 'one'],
  [389, 'reading', 'one'],
  [1280, 'match', 'one'],
  [1280, 'match', 'two'],
  [1280, 'reading', 'two'],
] as const)('resolves the initial Vayelech center without scrolling at %ipx in %s / %s', async (width, readerTextLayout, readerSideMode) => {
  await page.viewport(1440, 1000)
  savedStorage = new Map(Object.entries(localStorage))
  localStorage.clear()
  localStorage.setItem('tikkun.reader-preferences', JSON.stringify({
    readerTextLayout, readerSideMode,
  }))
  frame = document.createElement('iframe')
  frame.title = 'Initial reading position'
  frame.style.cssText = `display:block;width:${width}px;height:561px;border:0`
  frame.src = `/reader/?initial-position=${Date.now()}#/torah/parsha/vayelech/5-31-20`
  document.body.append(frame)

  await vi.waitFor(() => {
    const doc = frame?.contentDocument
    expect(doc?.querySelector('[data-target-id="app-root"]')?.getAttribute('data-reader-boot-state'))
      .toBe('ready')
    expect(doc?.querySelector('[data-target-id="tikkun-book"]')?.hasAttribute('aria-busy'))
      .toBe(false)
  }, { timeout: 15_000, interval: 50 })
  await new Promise<void>((resolve) => frame!.contentWindow!.requestAnimationFrame(() => {
    frame!.contentWindow!.requestAnimationFrame(() => resolve())
  }))

  const doc = frame.contentDocument!
  expect(doc.querySelector('[data-target-id="parsha-title"]')?.textContent?.trim()).toBe('וילך')
  expect(doc.querySelector<HTMLButtonElement>('[data-target-id="bookmark-current"]')?.disabled)
    .toBe(false)
}, 20_000)

test.each([
  ['one', 'reader'], ['two', 'reader'], ['one', 'browser'], ['two', 'browser'],
] as const)('aligns Reading links, rail navigation, and checkpoints to the exact pasuk in %s/%s', async (readerSideMode, focalPointMode) => {
  await page.viewport(1440, 1000)
  savedStorage = new Map(Object.entries(localStorage))
  localStorage.clear()
  localStorage.setItem('tikkun.reader-preferences', JSON.stringify({
    readerTextLayout: 'reading', readerSideMode, focalPointMode,
  }))
  frame = document.createElement('iframe')
  frame.title = 'Exact Reading verse position'
  frame.style.cssText = 'display:block;width:1280px;height:800px;border:0'
  frame.src = `/reader/?exact-verse=${Date.now()}#/run/2026-10-17:shacharis,main/1-7-17`
  document.body.append(frame)
  const target = frame
  const ready = async () => {
    await vi.waitFor(() => {
      const doc = target.contentDocument
      expect(doc?.querySelector('[data-reader-boot-state="ready"]')).not.toBeNull()
      expect(doc?.querySelector('.tikkun-book')?.hasAttribute('aria-busy')).toBe(false)
      expect(doc?.querySelector('.tikkun-book .word')).not.toBeNull()
    }, { timeout: 15_000 })
    await target.contentDocument!.fonts.ready
  }
  await ready()
  const doc = target.contentDocument!
  const view = target.contentWindow!
  const book = doc.querySelector<HTMLElement>('.tikkun-book')!
  const word = (key: string) => {
    const token = book.querySelector<HTMLElement>(`[data-reader-canonical="true"] .word[data-token-key="${key}"]:not([hidden])`)
    if (!token) throw new Error(`Missing test word ${key}`)
    return token
  }
  const focalY = () => focalPointMode === 'browser' ? doc.documentElement.clientHeight / 2
    : book.getBoundingClientRect().top + book.clientHeight / 2
  const offset = (token: HTMLElement) => {
    const rect = token.getBoundingClientRect()
    return rect.top + rect.height / 2 - focalY()
  }
  const atVerse17 = () => expect(Math.abs(offset(word('7:39:0:4')))).toBeLessThan(2)
  await vi.waitFor(atVerse17)
  const verse17 = word('7:39:0:4')
  expect(verse17.textContent!.normalize('NFD').replace(/\p{M}/gu, '').trim()).toBe('ויהי')
  const cue = book.querySelector<HTMLElement>('.reader-arrival-cue > span')!
  expect(Math.abs(cue.getBoundingClientRect().top - verse17.getBoundingClientRect().top)).toBeLessThan(4)

  // A physical source line contains verse 16's tail and verse 17's start.
  // Positioning the tail at focal must not select or save the next aliyah.
  view.location.hash = '#/run/2026-10-17:shacharis,main/1-7-11'
  await vi.waitFor(() => expect(verse17.isConnected).toBe(false))
  await ready()
  const active = () => doc.querySelector<HTMLElement>('.aliyah-rail-button.is-active')?.dataset.aliyahIndex
  // URL checkpoints follow user scrolling; a wheel event marks the scroll as the user's.
  book.dispatchEvent(new WheelEvent('wheel', { bubbles: true }))
  book.scrollTop += offset(word('7:39:0:0'))
  await vi.waitFor(() => expect(active()).toBe('2'))
  expect(view.location.hash).toBe('#/run/2026-10-17:shacharis,main/1-7-11')
  doc.querySelector<HTMLButtonElement>('[data-target-id="bookmark-current"]')!.click()
  await vi.waitFor(() => {
    // A bookmark saves the focal row's first word; in Reading that row belongs to pasuk 16.
    const [record] = loadBookmarks(localStorage)
    expect(record?.hash).toBe('#/run/2026-10-17:shacharis,main/1-7-16')
    const position = parseTokenKey(record!.tokenKey)!
    expect(compareTokenPositions(position, parseTokenKey('7:37:0:5')!)).toBeGreaterThanOrEqual(0)
    expect(compareTokenPositions(position, parseTokenKey('7:39:0:3')!)).toBeLessThanOrEqual(0)
  })
  book.scrollTop += offset(word('7:39:0:4'))
  await vi.waitFor(() => expect(active()).toBe('3'))
  await vi.waitFor(() => expect(view.location.hash).toBe('#/run/2026-10-17:shacharis,main/1-7-17'))
  book.scrollTop += offset(word('7:39:0:0'))
  await vi.waitFor(() => expect(active()).toBe('2'))

  doc.querySelector<HTMLButtonElement>('.aliyah-rail-button[data-aliyah-index="3"]')!.click()
  await vi.waitFor(atVerse17)
  expect(active()).toBe('3')
  doc.querySelector<HTMLButtonElement>('[data-target-id="bookmark-current"]')!.click()
  await vi.waitFor(() => {
    const records = loadBookmarks(localStorage)
    expect(records).toEqual(expect.arrayContaining([expect.objectContaining({ tokenKey: '7:39:0:4', hash: '#/run/2026-10-17:shacharis,main/1-7-17' })]))
  })
}, 25_000)
