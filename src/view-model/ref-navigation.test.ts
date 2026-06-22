import { expect, test } from 'vitest'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import { parseUrl } from './navigation/url-parser.ts'
import { renderLine } from './test-utils.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

test('legacy ref URLs start at the requested verse, not the start of the run', async () => {
  const route = parseUrl(generator, '/r/1-1-10')
  if (!route || route.view !== 'reader') throw new Error('URL did not parse.')

  const { page, lineNumber } = await route.model.startingLocation
  if (page.type !== 'page') throw new Error('First page should be a page')

  expect(renderLine(page.lines[lineNumber - 1])).toBe(': מָק֣וֹם אֶחָ֔ד וְתֵרָאֶ֖ה הַיַּבָּשָׁ֑ה וַֽיְהִי־כֵֽן׃ וַיִּקְרָ֨א אֱלֹהִ֤ים ׀')
})
