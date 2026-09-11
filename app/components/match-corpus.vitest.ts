import { afterEach, expect, test } from 'vitest'
import { page } from 'vitest/browser'
import Page, { type LineType } from './Page.ts'
import { applyReaderPageLayout } from './reader-page-layout.ts'
import { applyAnnotationMode } from './annotation-rendering.ts'
import type { ReaderPagePresentation } from '../reader-presentation.ts'
import { matchShirahSamples } from './match-shirah-source.ts'
import type { RenderedPageInfo } from '../view-model/scroll-view-model.ts'
import '../../css/master.css'
import '../../css/page.css'
import '../../css/reader-enhancements.css'
import '../../css/mobile-reader.css'

const corpus = import.meta.glob<LineType[]>('../../text/pages/*/*.json', {
  eager: true,
  import: 'default',
})
let fixture: HTMLElement | undefined

afterEach(() => {
  fixture?.remove()
  delete document.documentElement.dataset.readerSideOrder
})

function renderedPage(pageNumber: number, lines: LineType[]): RenderedPageInfo {
  let focalRef: RenderedPageInfo['lines'][number]['focalRef']
  return {
    type: 'page', contentIndex: pageNumber - 1, pageNumber,
    lines: lines.map((line) => {
      const verses = line.verses.map(({ book: b, chapter: c, verse: v }) => ({ b, c, v }))
      const result = { ...line, verses, focalRef: focalRef ?? verses[0], labels: [], aliyahStarts: [], aliyot: [] }
      focalRef = verses.at(-1) ?? focalRef
      return result
    }),
  }
}

const widths = [551, 670, 671, 715, 716, 768, 870, 871, 920, 921, 1024, 1120, 1121, 1180, 1181, 1250, 1251, 1280, 1600, 1920]
const modes = ['one', 'two'] as const
const fullCorpusWidths = new Set([551, 871, 1280, 1920])
// Real failures and special layouts identified by the complete-corpus sweep.
const stressPages = new Set([1, 16, 32, 33, 36, 37, 39, 41, 78, 92, 99, 106, 183, 204, 209, 236, 242, 243, 245])

function install(sides: ReaderPagePresentation['sides']) {
  document.documentElement.dataset.readerSideOrder = 'tikkun-right'
  fixture = document.createElement('div')
  fixture.className = 'reader-shell'
  fixture.innerHTML = `<aside></aside><main class="reader-main" style="direction:rtl"><div class="tikkun-book" data-target-id="tikkun-book" data-reader-layout="match" data-reader-sides="${sides}"><section class="tikkun-page"></section></div></main><aside></aside>`
  document.body.append(fixture)
  return fixture.querySelector<HTMLElement>('.tikkun-page')!
}

function checkRows(element: HTMLElement, name: string) {
  const failures: string[] = []
  // WebKit maintains live ranges through every subsequent text mutation.
  const range = document.createRange()
  const book = element.closest<HTMLElement>('.tikkun-book')!
  const bookRect = book.getBoundingClientRect()
  if (book.scrollWidth > book.clientWidth + 1) failures.push(`${name} horizontal overflow`)
  for (const row of element.querySelectorAll<HTMLElement>('tr')) {
    const label = `${name}:${row.dataset.lineIndex}`
    const words = [...row.querySelectorAll<HTMLElement>('.word:not([hidden])')]
    const rects = words.map((word) => {
      range.selectNodeContents(word)
      return range.getBoundingClientRect()
    })
    const bottoms = rects.map((r) => r.bottom)
    const lineHeight = Number.parseFloat(getComputedStyle(row.querySelector('.line')!).lineHeight)
    if (bottoms.length && Math.max(...bottoms) - Math.min(...bottoms) > lineHeight / 2) failures.push(`${label} wrapped`)
    rects.forEach((r, i) => {
      const fragment = words[i].closest('.fragment')!.getBoundingClientRect()
      if (r.left < Math.max(bookRect.left, fragment.left) - 1 || r.right > Math.min(bookRect.right, fragment.right) + 1) failures.push(`${label} overflow`)
    })
    const flows = [...row.querySelectorAll<HTMLElement>('.reader-text-flow')]
    if (flows.length === 2) {
      const [a, b] = flows.map((flow) => flow.getBoundingClientRect())
      if (Math.abs(a.top - b.top) > 1 || Math.abs(a.width - b.width) > 1) failures.push(`${label} unpaired`)
    }
  }
  return failures
}

test.each(widths.flatMap((width) => modes.map((sides) => ({ width, sides, coverage: fullCorpusWidths.has(width) ? 'complete corpus' : 'breakpoint stress pages' }))))('keeps Match physical lines: $coverage, $sides side(s), $width px', async ({ width, sides }) => {
  await page.viewport(width, 900)
  const element = install(sides)
  await document.fonts.load('28.8px ShlomosemiStam')
  await document.fonts.ready
  const failures: string[] = []
  for (const [path, lines] of Object.entries(corpus)) {
    const pageNumber = Number(path.split('/').at(-1)!.replace('.json', ''))
    if (!fullCorpusWidths.has(width) && !path.includes('/esther/') && !stressPages.has(pageNumber)) continue
    const presentation = { layout: 'match', sides } as const
    element.innerHTML = Page(renderedPage(pageNumber, lines), { presentation })
    applyReaderPageLayout(element, presentation)
    failures.push(...checkRows(element, path))
    if (sides === 'one') {
      applyAnnotationMode(element, false)
      failures.push(...checkRows(element, `${path}:Torah`))
    }
    // Let the browser release retired DOM and service the test timeout.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  expect(failures.length, `${failures.length} layout errors; first 12: ${failures.slice(0, 12).join(', ')}`).toBe(0)
}, 60_000)

test('includes all 70 Haazinu rows and 30 Az Yashir rows in initial song measurements', () => {
  const haazinu = matchShirahSamples('haazinu')
  expect(haazinu).toHaveLength(70)
  expect(haazinu.filter((sample) => sample.pageNumber === 242)).toHaveLength(35)
  expect(haazinu.filter((sample) => sample.pageNumber === 243)).toHaveLength(35)
  expect(matchShirahSamples('sea')).toHaveLength(30)
})

test.each(modes)('keeps complete Haazinu geometry stable through mount order, resize and highlighting: %s', async (sides) => {
  await page.viewport(1280, 900)
  const element = install(sides)
  const book = element.closest<HTMLElement>('.tikkun-book')!
  const presentation = { layout: 'match', sides } as const
  const markup = (pageNumber: number) => Page(renderedPage(pageNumber, corpus[`../../text/pages/torah/${pageNumber}.json`]), { presentation })
  element.innerHTML = markup(242)
  await document.fonts.load('28.8px ShlomosemiStam', 'אשר')
  await document.fonts.ready
  const geometry = () => [...element.querySelectorAll<HTMLElement>('[data-shirah-kind] .reader-text-flow')].map((flow) => ({
    width: flow.getBoundingClientRect().width,
    font: getComputedStyle(flow).fontSize,
    gap: getComputedStyle(flow).columnGap,
    height: flow.getBoundingClientRect().height,
  }))
  applyReaderPageLayout(element, presentation)
  const initial = geometry()
  const neighbor = document.createElement('section')
  neighbor.className = 'tikkun-page'
  neighbor.innerHTML = markup(243)
  book.append(neighbor)
  applyReaderPageLayout(neighbor, presentation)
  expect(geometry()).toEqual(initial)
  for (const width of [768, 1600, 871, 1280]) {
    await page.viewport(width, 900)
    applyReaderPageLayout(element, presentation)
    applyReaderPageLayout(neighbor, presentation)
    expect(checkRows(element, `242:${width}`)).toEqual([])
    expect(checkRows(neighbor, `243:${width}`)).toEqual([])
  }
  expect(geometry()).toEqual(initial)
  element.querySelector('.word')?.classList.add('is-active-word')
  applyAnnotationMode(element, false)
  applyReaderPageLayout(element, presentation)
  expect(geometry()).toEqual(initial)
  neighbor.remove()
  applyReaderPageLayout(element, presentation)
  expect(geometry()).toEqual(initial)
})
