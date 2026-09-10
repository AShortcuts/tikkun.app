import '/css/master.css'

import { page } from 'vitest/browser'
import {
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  Mock,
  test,
  vi,
} from 'vitest'
import { LeiningGenerator } from './calendar-model/generator'
import { UserSettings } from './calendar-model/user-settings'
import { ScrollViewModel } from './view-model/scroll-view-model'
import { ScrollDisplay } from './components/ScrollDisplay'
import { ViewportTracker } from './viewport-tracker'
import { renderLine } from './view-model/test-utils'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

let root: HTMLDivElement
let vm: ScrollViewModel | null
let tracker: ViewportTracker | null
let eventHandler: Mock
let lastReportedRange: {
  first: string | null
  center: string | null
  last: string | null
}
let lastReportedRunIds: {
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
    (eventHandler = vi.fn((r) => {
      lastReportedRange = {
        first: renderLine(r.first),
        center: renderLine(r.center),
        last: renderLine(r.last),
      }
      lastReportedRunIds = {
        first: r.first?.run?.id ?? null,
        center: r.center?.run?.id ?? null,
        last: r.last?.run?.id ?? null,
      }
    }))
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
    first: ': בָּהָ֔ר אַרְבָּעִ֣ים י֔וֹם וְאַרְבָּעִ֖ים לָֽיְלָה׃#(פ)',
    center:
      ': וְיִקְחוּ־לִ֖י תְּרוּמָ֑ה מֵאֵ֤ת כׇּל־אִישׁ֙ אֲשֶׁ֣ר יִדְּבֶ֣נּוּ לִבּ֔וֹ',
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
    first: ': בָּהָ֔ר אַרְבָּעִ֣ים י֔וֹם וְאַרְבָּעִ֖ים לָֽיְלָה׃#(פ)',
    center:
      ': וְיִקְחוּ־לִ֖י תְּרוּמָ֑ה מֵאֵ֤ת כׇּל־אִישׁ֙ אֲשֶׁ֣ר יִדְּבֶ֣נּוּ לִבּ֔וֹ',
    last:
      ': תִּקְח֖וּ אֶת־תְּרוּמָתִֽי׃ וְזֹאת֙ הַתְּרוּמָ֔ה אֲשֶׁ֥ר תִּקְח֖וּ מֵאִתָּ֑ם',
  })
})

test('uses the configured focal center when the book is offset from the viewport', async () => {
  await resize(7)
  root.style.marginTop = `${lineHeight * 2}px`
  await renderRun('2025-03-01:shacharis,main')

  expect(lastReportedRange.center).toBe(
    ': וְיִקְחוּ־לִ֖י תְּרוּמָ֑ה מֵאֵ֤ת כׇּל־אִישׁ֙ אֲשֶׁ֣ר יִדְּבֶ֣נּוּ לִבּ֔וֹ'
  )
})

test('refreshes immediately after a programmatic jump while scroll events are throttled', async () => {
  await resize(5)
  await renderRun('2024-10-26:shacharis,main')
  eventHandler.mockClear()

  await renderRun('2025-03-01:shacharis,main', { flushViewportUpdate: false })
  expect(eventHandler).not.toBeCalled()

  tracker!.refresh()

  expect(lastReportedRunIds.center).toBe('2025-03-01:shacharis,main')
})

test('refresh reports the current viewport even when the focal line is unchanged', async () => {
  await resize(5)
  await renderRun('2025-03-01:shacharis,main')
  eventHandler.mockClear()

  tracker!.refresh()

  expect(eventHandler).toHaveBeenCalledOnce()
  expect(lastReportedRunIds.center).toBe('2025-03-01:shacharis,main')
})

test('finds the focal line immediately when a hidden initial display is revealed', async () => {
  await resize(5)
  root.style.visibility = 'hidden'
  await renderRun('2025-03-01:shacharis,main')

  root.style.visibility = ''
  tracker!.refresh()

  expect(lastReportedRange.center).toBe(
    ': וְיִקְחוּ־לִ֖י תְּרוּמָ֑ה מֵאֵ֤ת כׇּל־אִישׁ֙ אֲשֶׁ֣ר יִדְּבֶ֣נּוּ לִבּ֔וֹ'
  )
})

test('destroy cancels pending updates and stops future tracking', async () => {
  await resize(5)
  await renderRun('2025-03-01:shacharis,main')
  eventHandler.mockClear()

  root.scrollBy(0, lineHeight * 2)
  root.dispatchEvent(new Event('scroll'))
  tracker!.destroy()
  tracker!.refresh()
  await nextFrame()

  expect(eventHandler).not.toBeCalled()
})

test('sends no event when scrolling by partial lines', async () => {
  // Render 1.5 lines around the center.
  await resize(4)
  await renderRun('2025-03-01:shacharis,main')
  eventHandler.mockClear()

  await scrollRootBy(lineHeight / 2)
  expect(eventHandler).not.toBeCalled()
  await scrollRootBy(lineHeight * 2)
  expect(eventHandler).toBeCalled()
})

test('only reports fully-visible lines', async () => {
  // Render 1.5 lines around the center.
  await resize(4)
  await renderRun('2025-03-01:shacharis,main')
  expect(lastReportedRange).toEqual({
    first: ': בָּהָ֔ר אַרְבָּעִ֣ים י֔וֹם וְאַרְבָּעִ֖ים לָֽיְלָה׃#(פ)',
    center:
      ': וְיִקְחוּ־לִ֖י תְּרוּמָ֑ה מֵאֵ֤ת כׇּל־אִישׁ֙ אֲשֶׁ֣ר יִדְּבֶ֣נּוּ לִבּ֔וֹ',
    last: ': וְיִקְחוּ־לִ֖י תְּרוּמָ֑ה מֵאֵ֤ת כׇּל־אִישׁ֙ אֲשֶׁ֣ר יִדְּבֶ֣נּוּ לִבּ֔וֹ',
  })
})

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
