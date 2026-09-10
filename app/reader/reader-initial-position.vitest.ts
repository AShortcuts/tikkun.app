import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'

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
