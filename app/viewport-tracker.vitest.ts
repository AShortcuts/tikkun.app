import '/css/master.css'

import { page } from 'vitest/browser'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { LeiningGenerator } from './calendar-model/generator'
import { UserSettings } from './calendar-model/user-settings'
import { ScrollViewModel, type RenderedLineInfo } from './view-model/scroll-view-model'
import { ScrollDisplay } from './components/ScrollDisplay'
import { ViewportTracker } from './viewport-tracker'
import { renderLine } from './view-model/test-utils'
import { getReaderFocalPointClientY } from './reader-scroll'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

let root: HTMLDivElement
let vm: ScrollViewModel | null
let tracker: ViewportTracker | null
let lastReportedRange: {
  first: string | null
  center: string | null
  last: string | null
}
let lineHeight: number

beforeAll(async () => {
  createRoot()
  await renderRun('2024-10-26:shacharis,main', { flushViewportUpdate: false })
  const line = root.querySelector('tr')!
  lineHeight =
    line.nextElementSibling!.getBoundingClientRect().y -
    line.getBoundingClientRect().y
  root.remove()
})

beforeEach(() => {
  createRoot()
  tracker = new ViewportTracker(root)
  tracker.on(
    'viewport-updated',
    vi.fn((r) => {
      lastReportedRange = {
        first: renderLine(r.first),
        center: renderLine(r.center),
        last: renderLine(r.last),
      }
    })
  )
})
afterEach(() => {
  tracker?.destroy()
  document.body.removeChild(root)
  vm = null
  tracker = null
})

test('reports the initial viewport', async () => {
  // Render 2 lines around the center.
  await resize(5)
  await renderRun('2025-03-01:shacharis,main')
  expect(lastReportedRange).toEqual({
    // The first row is measured below the book's top padding.
    first: 'תרומה: וַיְדַבֵּ֥ר יְהֹוָ֖ה אֶל־מֹשֶׁ֥ה לֵּאמֹֽר׃ דַּבֵּר֙ אֶל־בְּנֵ֣י יִשְׂרָאֵ֔ל',
    center:
      'תרומה: וַיְדַבֵּ֥ר יְהֹוָ֖ה אֶל־מֹשֶׁ֥ה לֵּאמֹֽר׃ דַּבֵּר֙ אֶל־בְּנֵ֣י יִשְׂרָאֵ֔ל',
    last:
      ': תִּקְח֖וּ אֶת־תְּרוּמָתִֽי׃ וְזֹאת֙ הַתְּרוּמָ֔ה אֲשֶׁ֥ר תִּקְח֖וּ מֵאִתָּ֑ם',
  })
})

test('updates when scrolling down', async () => {
  // Render 2 lines around the center.
  await resize(5)
  await renderRun('2025-03-01:shacharis,main')

  await scrollRootBy(lineHeight)

  expect(lastReportedRange).toEqual({
    // The first row is measured below the book's top padding.
    first: 'תרומה: וַיְדַבֵּ֥ר יְהֹוָ֖ה אֶל־מֹשֶׁ֥ה לֵּאמֹֽר׃ דַּבֵּר֙ אֶל־בְּנֵ֣י יִשְׂרָאֵ֔ל',
    center:
      ': וְיִקְחוּ־לִ֖י תְּרוּמָ֑ה מֵאֵ֤ת כׇּל־אִישׁ֙ אֲשֶׁ֣ר יִדְּבֶ֣נּוּ לִבּ֔וֹ',
    last:
      ': תִּקְח֖וּ אֶת־תְּרוּמָתִֽי׃ וְזֹאת֙ הַתְּרוּמָ֔ה אֲשֶׁ֥ר תִּקְח֖וּ מֵאִתָּ֑ם',
  })
})

test('crosses a page gap once in either direction with a consistent midpoint', async () => {
  const { before, after, gapStart, gapEnd, center } = await renderPageGap()
  const midpoint = (gapStart + gapEnd) / 2

  for (const direction of [1, -1]) {
    const start = direction === 1 ? gapStart - 20 : gapEnd + 20
    const end = direction === 1 ? gapEnd + 20 : gapStart - 20
    for (let position = start; direction * position <= direction * end; position += direction * 4) {
      root.scrollTop = position
      await scrollRootBy(0)
      expect(center()).toBe(position < midpoint ? before : after)
    }
    root.scrollTop = midpoint
    await scrollRootBy(0)
    expect(center()).toBe(after)
  }
})

async function renderPageGap(gap = 300) {
  await page.viewport(800, 600)
  root.style.cssText = 'position:fixed;inset:0;height:400px;padding:0;overflow:auto'
  const run = generator.parseId('2024-10-25:shacharis,main')
  if (!run) throw new Error('Simchat Torah run not found')
  const lines: RenderedLineInfo[] = [2, 3].map((index) => ({
    text: [[`row ${index + 1}`]],
    verses: [run.aliyot[index].start],
    focalRef: run.aliyot[index].start,
    isPetucha: false,
    labels: [],
    aliyahStarts: [],
    run,
    aliyot: [run.aliyot[index]],
  }))
  const spacer = document.createElement('div')
  spacer.style.height = '800px'
  root.append(spacer)
  const rows = lines.map((line, index) => {
    const pageNode = document.createElement('div')
    pageNode.className = 'tikkun-page'
    pageNode.style.cssText = `margin:${index ? gap : 0}px 0 0;padding:0;border:0;min-height:0`
    pageNode.tikkunPage = {
      type: 'page', contentIndex: index, pageNumber: 244 + index, lines: [line],
    }
    const row = document.createElement('div')
    row.dataset.class = 'line'
    row.dataset.lineIndex = '0'
    row.style.height = `${index ? 160 : 80}px`
    row.textContent = line.text[0][0]
    pageNode.append(row)
    root.append(pageNode)
    return row
  })
  root.append(spacer.cloneNode())
  let current: RenderedLineInfo | null = null
  tracker!.on('viewport-updated', (range) => { current = range.center })
  const focal = getReaderFocalPointClientY(root)
  return {
    before: lines[0],
    after: lines[1],
    gapStart: rows[0].getBoundingClientRect().bottom - focal,
    gapEnd: rows[1].getBoundingClientRect().top - focal,
    center: () => current,
  }
}

async function scrollRootBy(deltaY: number) {
  root.scrollBy(0, deltaY)
  root.dispatchEvent(new Event('scroll'))
  await nextFrame()
}

function createRoot() {
  root = document.createElement('div')
  root.className = 'tikkun-book mod-annotations-off'
  document.body.appendChild(root)
}

async function resize(lineCount: number) {
  await page.viewport(window.innerWidth, lineCount * lineHeight)
}

async function renderRun(
  runId: string,
  { flushViewportUpdate = true }: { flushViewportUpdate?: boolean } = {}
) {
  vm = ScrollViewModel.forId(generator, runId)
  if (!vm) throw new Error(`ID ${runId} not found`)
  const sd = new ScrollDisplay(vm, root)
  await sd.scrolled
  if (flushViewportUpdate) await nextFrame()
  return sd
}

function nextFrame() {
  return new Promise(requestAnimationFrame)
}
