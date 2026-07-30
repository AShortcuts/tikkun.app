import { afterEach, expect, test } from 'vitest'
import {
  type RenderedEntry,
  type RenderedLineInfo,
  ScrollViewModel,
} from '../scroll-view-model.ts'
import { LeiningGenerator } from '../../calendar-model/generator.ts'
import type { UserSettings } from '../../calendar-model/user-settings.ts'
import { fetchPages, renderLine } from '../test-utils.ts'
import { type Link, TopBarTracker } from './top-bar-model.ts'
import { hasScrollData } from '../../location.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

const cachedTracker = new TopBarTracker()

let viewModel: ScrollViewModel | null = null
let pages: RenderedEntry[] = []

async function createModel(
  id: string,
  fetch: Parameters<typeof fetchPages>[1]
) {
  viewModel = ScrollViewModel.forId(generator, id)
  pages = await fetchPages(viewModel, fetch)
}

afterEach(() => {
  viewModel = null
  pages = []
})

test('renders across runs for שמיני עצרת', async () => {
  await createModel('2024-10-24:shacharis,main', {
    count: 5,
    fetchPreviousPages: false,
  })

  // Scroll to the end of the main leining, which has a run
  const inMainLeining = cachedTracker.setLine(viewModel!, {
    first: getLine(
      'וּבְחַ֥ג הַשָּׁבֻע֖וֹת וּבְחַ֣ג הַסֻּכּ֑וֹת וְלֹ֧א יֵרָאֶ֛ה אֶת־פְּנֵ֥י'
    ),
    center: null,
    last: getLine(
      'נֹתֵ֣ן לָ֑ךְ אִ֣ישׁ אוֹ־אִשָּׁ֗ה אֲשֶׁ֨ר יַעֲשֶׂ֧ה אֶת־הָרַ֛ע בְּעֵינֵ֥י'
    ),
  })
  const linesBetweenRuns: Parameters<typeof renderResult>[0] = {
    first: getLine(
      'לִשְׁבָטֶ֑יךָ וְשָׁפְט֥וּ אֶת־הָעָ֖ם מִשְׁפַּט־צֶֽדֶק׃ לֹא־תַטֶּ֣ה'
    ),
    center: null,
    last: getLine(
      'הַשְּׁבִיעִ֛י פָּרִ֥ים שִׁבְעָ֖ה אֵילִ֣ם שְׁנָ֑יִם כְּבָשִׂ֧ים בְּנֵי־'
    ),
  }
  // Scroll to a screen entirely between runs, which should remember the last position
  let betweenRuns = cachedTracker.setLine(viewModel!, linesBetweenRuns)

  expect(betweenRuns).toEqual(inMainLeining)

  const inMaftir = cachedTracker.setLine(viewModel!, {
    first: getLine(
      'תִּהְיֶ֣ה לָכֶ֑ם כׇּל־מְלֶ֥אכֶת עֲבֹדָ֖ה לֹ֥א תַעֲשֽׂוּ׃ וְהִקְרַבְתֶּ֨ם'
    ),
    center: null,
    last: getLine(
      'נַפְשׁ֔וֹ לֹ֥א יַחֵ֖ל דְּבָר֑וֹ כְּכׇל־הַיֹּצֵ֥א מִפִּ֖יו יַעֲשֶֽׂה׃'
    ),
  })
  // When we scroll to the same lines again, use the last position.
  betweenRuns = cachedTracker.setLine(viewModel!, linesBetweenRuns)

  expect(betweenRuns).toEqual(inMaftir)

  expect(renderResult({
      first: getLine(
        'וּבְחַ֥ג הַשָּׁבֻע֖וֹת וּבְחַ֣ג הַסֻּכּ֑וֹת וְלֹ֧א יֵרָאֶ֛ה אֶת־פְּנֵ֥י'
      ),
      center: linesBetweenRuns.first,
      last: getLine(
        'תִּהְיֶ֣ה לָכֶ֑ם כׇּל־מְלֶ֥אכֶת עֲבֹדָ֖ה לֹ֥א תַעֲשֽׂוּ׃ וְהִקְרַבְתֶּ֨ם'
      ),
    }), 'spanning main leining and מפטיר').toMatchSnapshot()
})

function renderRoshCodesh() {
  return renderResult({
    first: getLine(
      'וְאָמַרְתָּ֖ אֲלֵהֶ֑ם אֶת־קׇרְבָּנִ֨י לַחְמִ֜י לְאִשַּׁ֗י רֵ֚יחַ נִֽיחֹחִ֔י'
    ),
    center: getLine(
      'הַשֵּׁנִ֔י תַּעֲשֶׂ֖ה בֵּ֣ין הָֽעַרְבָּ֑יִם כְּמִנְחַ֨ת הַבֹּ֤קֶר וּכְנִסְכּוֹ֙'
    ),
    last: getLine(
      'זֹ֣את עֹלַ֥ת חֹ֙דֶשׁ֙ בְּחׇדְשׁ֔וֹ לְחׇדְשֵׁ֖י הַשָּׁנָֽה׃ וּשְׂעִ֨יר'
    ),
  })
}

test('collapses adjacent days of ראש חודש', async () => {
  await createModel('2024-09-03:shacharis,main', {
    count: 2,
    fetchPreviousPages: false,
  })
  const firstDay = renderRoshCodesh()

  await createModel('2024-09-04:shacharis,main', {
    count: 2,
    fetchPreviousPages: false,
  })
  const secondDay = renderRoshCodesh()

  expect(firstDay.previousLink).toEqual(secondDay.previousLink)
  expect(firstDay.nextLink).toEqual(secondDay.nextLink)
})

test('preserves unequal days of ראש חודש', async () => {
  await createModel('2024-11-01:shacharis,main', {
    count: 2,
    fetchPreviousPages: false,
  })
  const firstDay = renderRoshCodesh()

  await createModel('2024-11-02:shacharis,maftir', {
    count: 5,
    fetchPreviousPages: false,
  })
  const secondDay = renderRoshCodesh()

  expect(firstDay.previousLink).not.toEqual(secondDay.previousLink)
  expect(firstDay.currentRun?.id).toEqual(secondDay.previousLink?.targetRun)
  expect(firstDay.nextLink?.targetRun).toEqual(secondDay.relatedRuns[0]?.targetRun)
})

test('renders from only one line', async () => {
  await createModel('2024-09-28:shacharis,main', {
    count: 5,
    fetchPreviousPages: false,
  })

  const line = getLine(
    'בַּחַיִּ֔ים לְמַ֥עַן תִּֽחְיֶ֖ה אַתָּ֥ה וְזַרְעֶֽךָ׃ לְאַֽהֲבָה֙ אֶת־'
  )

  const results = {
    fromFirst: renderResult({
      first: line,
      center: null,
      last: null,
    }),
    fromCenter: renderResult({
      first: null,
      center: line,
      last: null,
    }),
    fromLast: renderResult({
      first: null,
      center: null,
      last: line,
    }),
  }

  expect(results.fromFirst.currentRun?.title).toBe('פרשת נצבים־וילך שחרית Main')

  expect(results.fromFirst).toEqual(results.fromCenter)
  expect(results.fromCenter).toEqual(results.fromLast)
})

test('picks primary run', async () => {
  await createModel('2025-03-01:shacharis,main', {
    count: 5,
    fetchPreviousPages: false,
  })

  const centerInTerumah = renderResult({
    first: getLine(
      'הַזְּקֵנִ֤ים אָמַר֙ שְׁבוּ־לָ֣נוּ בָזֶ֔ה עַ֥ד אֲשֶׁר־נָשׁ֖וּב אֲלֵיכֶ֑ם'
    ),
    center: getLine(
      'וַיְדַבֵּ֥ר יְהֹוָ֖ה אֶל־מֹשֶׁ֥ה לֵּאמֹֽר׃ דַּבֵּר֙ אֶל־בְּנֵ֣י יִשְׂרָאֵ֔ל'
    ),
    last: getLine(
      'אֲנִי֙ מַרְאֶ֣ה אוֹתְךָ֔ אֵ֚ת תַּבְנִ֣ית הַמִּשְׁכָּ֔ן וְאֵ֖ת תַּבְנִ֣ית כׇּל־'
    ),
  })
  expect(centerInTerumah.currentRun?.title).toBe('פרשת תרומה שחרית Main')
  expect(centerInTerumah.aliyahRange).toEqual(['פרשת משפטים שביעי', 'ראשון'])

  const centerInMishpatim = renderResult({
    first: getLine(
      'הַזְּקֵנִ֤ים אָמַר֙ שְׁבוּ־לָ֣נוּ בָזֶ֔ה עַ֥ד אֲשֶׁר־נָשׁ֖וּב אֲלֵיכֶ֑ם'
    ),
    center: getLine(
      'וַיָּבֹ֥א מֹשֶׁ֛ה בְּת֥וֹךְ הֶעָנָ֖ן וַיַּ֣עַל אֶל־הָהָ֑ר וַיְהִ֤י מֹשֶׁה֙'
    ),
    last: getLine(
      'אֲנִי֙ מַרְאֶ֣ה אוֹתְךָ֔ אֵ֚ת תַּבְנִ֣ית הַמִּשְׁכָּ֔ן וְאֵ֖ת תַּבְנִ֣ית כׇּל־'
    ),
  })
  expect(centerInMishpatim.currentRun?.title).toBe('פרשת משפטים שחרית Main')
  expect(centerInMishpatim.aliyahRange).toEqual(['שביעי', 'פרשת תרומה ראשון'])
})

test('renders for the beginning of בראשית', async () => {
  await createModel('2024-10-26:shacharis,main', {
    count: 5,
    fetchPreviousPages: false,
  })

  expect(renderResult({
      first: firstLine(pages[0]),
      center: null,
      last: firstLine(pages[1]),
    })).toMatchSnapshot()
})

test('renders for שמחת תורה', async () => {
  await createModel('2024-10-25:shacharis,main', {
    count: 5,
    fetchPreviousPages: false,
  })

  expect(renderResult({
      first: firstLine(pages[0]),
      center: null,
      last: firstLine(pages[1]),
    })).toMatchSnapshot()
})

test('שקלים / ראש חודש', async () => {
  await createModel('2025-03-01:shacharis,main', {
    count: 5,
    fetchPreviousPages: false,
  })

  expect(renderResult({
      first: getLine(
        'וַיְדַבֵּ֥ר יְהֹוָ֖ה אֶל־מֹשֶׁ֥ה לֵּאמֹֽר׃ דַּבֵּר֙ אֶל־בְּנֵ֣י יִשְׂרָאֵ֔ל'
      ),
      center: null,
      last: getLine(
        'זָהָ֣ב טָה֑וֹר אַמָּתַ֤יִם וָחֵ֙צִי֙ אׇרְכָּ֔הּ וְאַמָּ֥ה וָחֵ֖צִי רׇחְבָּֽהּ׃'
      ),
    })).toMatchSnapshot()
})

test('renders for חול המועד סוכות', async () => {
  await createModel('2024-10-22:shacharis,main', {
    count: 5,
    fetchPreviousPages: false,
  })

  expect(renderResult({
      first: getLine(
        'הַחֲמִישִׁ֛י פָּרִ֥ים תִּשְׁעָ֖ה אֵילִ֣ם שְׁנָ֑יִם כְּבָשִׂ֧ים בְּנֵֽי'
      ),
      center: getLine(
        'שְׁמֹנָ֖ה אֵילִ֣ם שְׁנָ֑יִם כְּבָשִׂ֧ים בְּנֵי־שָׁנָ֛ה אַרְבָּעָ֥ה עָשָׂ֖ר'
      ),
      last: getLine(
        'וּשְׂעִ֥יר חַטָּ֖את אֶחָ֑ד מִלְּבַד֙ עֹלַ֣ת הַתָּמִ֔יד מִנְחָתָ֖הּ'
      ),
    })).toMatchSnapshot()
})

test('calendar navigation skips unsupported scrolls', async () => {
  await createModel('2026-07-18:shacharis,main', {
    count: 1,
    fetchPreviousPages: false,
  })

  const targetLine = pages
    .flatMap((page) => (page.type === 'page' ? page.lines : []))
    .find((line) => line.run?.id === '2026-07-18:shacharis,main')
  if (!targetLine) throw new Error('Missing Devarim line in the rendered page')

  const info = new TopBarTracker().setLine(viewModel!, {
    first: targetLine,
    center: targetLine,
    last: null,
  })

  expect(info.nextLink?.targetRun.id).toBe('2026-07-23:shacharis,main')
  expect(info.relatedRuns.every((link) => hasScrollData(link.targetRun.scroll))).toBe(
    true
  )
})

function renderResult(lines: Parameters<TopBarTracker['setLine']>[1]) {
  if (!viewModel) throw new Error('Must create viewModel first')
  const cachedResult = cachedTracker.setLine(viewModel, lines)
  const freshResult = new TopBarTracker().setLine(viewModel, lines)
  expect(cachedResult).toEqual(freshResult)
  return {
    aliyahRange: cachedResult.aliyahRange,
    currentRun: cachedResult.currentRun && {
      id: cachedResult.currentRun?.id,
      title: [
        cachedResult.currentRun.leining.date.title.he,
        cachedResult.currentRun.leining.id,
        cachedResult.currentRun.type,
      ].join(' '),
    },
    previousLink: renderLink(cachedResult.previousLink),
    nextLink: renderLink(cachedResult.nextLink),
    relatedRuns: cachedResult.relatedRuns.map(renderLink),
  }
}

function renderLink(link: Link | null) {
  if (!link) return link
  return {
    targetRun: link.targetRun.id,
    label: link.label,
  }
}

function firstLine(page: RenderedEntry) {
  if (page.type !== 'page') throw new Error('Must be a page')
  return page.lines[0]
}

/** Finds the single line containing the specified text. */
function getLine(text: string): RenderedLineInfo {
  if (!viewModel) throw new Error('Must create viewModel first')
  const results = pages.flatMap((p) =>
    p.type === 'message'
      ? []
      : p.lines.filter((line) => (renderLine(line) ?? '').includes(text))
  )

  if (results.length !== 1)
    throw new Error(
      `Found ${results.length} lines:
    
${results.map(renderLine).join('\n')}`.trim()
    )
  return results[0]
}
