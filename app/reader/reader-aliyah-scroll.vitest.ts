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
  [390, 'match', 'one'],
  [390, 'match', 'two'],
  [390, 'reading', 'one'],
  [390, 'reading', 'two'],
  [1280, 'match', 'one'],
  [1280, 'match', 'two'],
  [1280, 'reading', 'one'],
  [1280, 'reading', 'two'],
] as const)('changes aliyah once across the Vezot Haberacha page boundary at %ipx in %s / %s', async (width, readerTextLayout, readerSideMode) => {
  await page.viewport(1440, 1000)
  savedStorage = new Map(Object.entries(localStorage))
  localStorage.clear()
  localStorage.setItem('tikkun.reader-preferences', JSON.stringify({
    readerTextLayout, readerSideMode,
  }))
  frame = document.createElement('iframe')
  frame.title = 'Aliyah scroll stability'
  frame.style.cssText = `display:block;width:${width}px;height:720px;border:0`
  frame.src = `/reader/?aliyah-scroll=${Date.now()}#/torah/parsha/vezot-haberacha/5-33-18`
  document.body.append(frame)
  const target = frame

  await vi.waitFor(() => {
    expect(target.contentDocument?.querySelector('[data-target-id="app-root"]')
      ?.getAttribute('data-reader-boot-state')).toBe('ready')
    expect(target.contentDocument?.querySelector('.aliyah-rail-button.is-active')
      ?.getAttribute('data-aliyah-index')).toBe('4')
  }, { timeout: 15_000, interval: 50 })

  const frameDocument = target.contentDocument!
  const view = target.contentWindow!
  const book = requiredElement(frameDocument, '.tikkun-book')
  const rail = requiredElement(frameDocument, '.aliyah-rail')
  const before = requiredElement(book, '[data-class="line"][data-page-number="244"][data-line-index="41"]')
  const after = requiredElement(book, '[data-class="line"][data-page-number="245"][data-line-index="0"]')
  const settle = async () => {
    for (let count = 0; count < 3; count += 1) {
      await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()))
    }
  }
  await settle()
  const focal = book.getBoundingClientRect().top + book.clientHeight / 2
  const beforeRect = before.getBoundingClientRect()
  const afterRect = after.getBoundingClientRect()
  const above = Math.round(book.scrollTop + beforeRect.top + beforeRect.height / 2 - focal)
  const below = Math.round(book.scrollTop + afterRect.top + afterRect.height / 2 - focal)
  expect(below).toBeGreaterThan(above)

  const active = () => rail.querySelector<HTMLElement>('.is-active')?.dataset.aliyahIndex
  const transitions: Array<string | undefined> = []
  const record = () => {
    if (transitions.at(-1) !== active()) transitions.push(active())
  }
  const observer = new MutationObserver(record)
  observer.observe(rail, { subtree: true, attributes: true, attributeFilter: ['class'] })
  try {
    for (const [start, end, expected] of [
      [below, above, ['4', '3']],
      [above, below, ['3', '4']],
    ] as const) {
      book.scrollTop = start
      await settle()
      transitions.length = 0
      record()
      const step = Math.sign(end - start) * 4
      for (let position = start; step * position < step * end; position += step) {
        book.scrollTop = position
        await settle()
      }
      book.scrollTop = end
      await settle()
      expect(transitions).toEqual(expected)
    }
  } finally {
    observer.disconnect()
  }
}, 30_000)

function requiredElement(root: ParentNode, selector: string) {
  const element = root.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`Aliyah scroll test requires ${selector}`)
  return element
}

test.each([[390, false], [1280, false], [390, true], [1280, true]] as const)('keeps parsha and service aliyot separate at %ipx (Israel: %s)', async (width, israel) => {
  await page.viewport(1440, 1000)
  savedStorage = new Map(Object.entries(localStorage))
  localStorage.clear()
  localStorage.setItem('tikkun.reader-preferences', JSON.stringify({ readerTextLayout: 'reading' }))
  localStorage.setItem('tikkun.calendar-settings', JSON.stringify({ israel }))
  frame = document.createElement('iframe')
  frame.title = 'Reading contexts'
  frame.style.cssText = `display:block;width:${width}px;height:720px;border:0`
  frame.src = `/reader/?reading-context=${Date.now()}#/torah/parsha/vezot-haberacha/5-33-27`
  document.body.append(frame)
  const target = frame
  const active = () => target.contentDocument?.querySelector<HTMLElement>('.aliyah-rail-button.is-active')
  const rail = () => Array.from(target.contentDocument?.querySelectorAll<HTMLElement>('.aliyah-rail-button') ?? [])
  await vi.waitFor(() => expect(active()?.dataset.aliyahIndex).toBe('6'), { timeout: 15_000 })
  expect(rail()).toHaveLength(7)
  rail().find(button => button.dataset.aliyahIndex === '7')!.click()
  await vi.waitFor(() => expect(active()?.dataset.aliyahIndex).toBe('7'))
  expect(active()?.title).toContain('שביעי')
  expect(active()?.dataset.runId).toBe('parsha:vezot-haberacha,main')

  const date = israel ? '2026-10-03' : '2026-10-04'
  target.contentWindow!.location.hash = `#/run/${date}:shacharis,main/5-33-27`
  await vi.waitFor(() => expect(active()?.dataset.runId).toBe(`${date}:shacharis,main`), { timeout: 15_000 })
  expect(rail()).toHaveLength(israel ? 9 : 8)
  expect(rail().find(button => button.dataset.aliyahIndex === (israel ? '7' : '6'))?.title).toContain('חתן תורה')
  const beresheet = rail().find(button => button.dataset.aliyahIndex === (israel ? '8' : '7'))!
  expect(beresheet.title).toContain('חתן בראשית')
  beresheet.click()
  await vi.waitFor(() => expect(active()?.dataset.runId).toBe(`${date}:shacharis,last-aliyah`), { timeout: 5_000 })
  expect(active()?.dataset.aliyahIndex).toBe(israel ? '8' : '7')
  expect(target.contentDocument?.querySelector('[data-target-id="parsha-title"]')?.textContent).toContain('שמחת תורה')
}, 30_000)
