import { expect, test } from 'vitest'
import {
  generateAboutUrl,
  generateCueAnalyticsUrl,
  generatePageUrl,
  generateUrl,
  parseUrl,
} from './url-parser.ts'
import type { AppRoute } from './url-parser.ts'
import { ScrollViewModel } from '../scroll-view-model.ts'
import { renderLine } from '../test-utils.ts'
import { LeiningGenerator } from '../../calendar-model/generator.ts'
import type { UserSettings } from '../../calendar-model/user-settings.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

test('non-URL input', async () => {
  expect(parseUrl(generator, 'hello world')).toBeFalsy()
})

test('Empty URL', () => {
  expect(parseUrl(generator, '')).toBeFalsy()
})

test('Ignores unrecognized URL types', () => {
  expect(parseUrl(generator, '/kav/tzav')).toBeFalsy()
})

test('Invalid location reference: Not numbers', () => {
  expect(parseUrl(generator, '/r/foo-bar-baz')).toBeFalsy()
})

test('Invalid location reference: incomplete', () => {
  expect(parseUrl(generator, '/r/5-22')).toBeFalsy()
})

test('Next', () => {
  expect(parseUrl(generator, '/next')).toBeTruthy()
})

test('About', () => {
  expect(parseUrl(generator, '/about')).toEqual({ view: 'about' })
  expect(generateAboutUrl()).toBe('#/about')
})

test('Playback analytics', () => {
  expect(parseUrl(generator, '/about/playback-analytics')).toEqual({
    view: 'cue-analytics',
  })
  expect(parseUrl(generator, '/about/word-analytics')).toEqual({
    view: 'cue-analytics',
  })
  expect(parseUrl(generator, '/about/cue-analytics')).toEqual({
    view: 'cue-analytics',
  })
  expect(generateCueAnalyticsUrl()).toBe('#/about/playback-analytics')
})

test('Parsha slug resolves Bereshit', async () => {
  const route = toReaderRoute(
    parseUrl(generator, '/torah/parsha/beresheet', { now: new Date('2024-10-01') })
  )

  expect(route).toBeTruthy()
  expect(route?.canonicalHash).toBe('#/torah/parsha/beresheet')
  expect(await renderStartingLineForRoute(route)).toBe(await renderStartingLineForRoute(
      toReaderRoute(parseUrl(generator, '/run/2024-10-26:shacharis,main'))
    ))
})

test('Parsha alias canonicalizes Bereshit', async () => {
  const route = toReaderRoute(
    parseUrl(generator, '/torah/parsha/bereshit', { now: new Date('2024-10-01') })
  )

  expect(route).toBeTruthy()
  expect(route?.canonicalHash).toBe('#/torah/parsha/beresheet')
  expect(await renderStartingLineForRoute(route)).toBe(await renderStartingLineForRoute(
      toReaderRoute(parseUrl(generator, '/run/2024-10-26:shacharis,main'))
    ))
})

test('Parsha alias canonicalizes Vayetze recording slug', async () => {
  const route = toReaderRoute(
    parseUrl(generator, '/torah/parsha/vayetze', { now: new Date('2026-01-01') })
  )

  expect(route).toBeTruthy()
  expect(route?.canonicalHash).toBe('#/torah/parsha/vayetzei')
  expect(await renderStartingLineForRoute(route)).toBe(await renderStartingLineForRoute(
      toReaderRoute(parseUrl(generator, '/run/2026-11-21:shacharis,main'))
    ))
})

test('Parsha slug resolves exact solo Vayelech only', async () => {
  const route = toReaderRoute(
    parseUrl(generator, '/torah/parsha/vayelech', { now: new Date('2026-01-01') })
  )

  expect(route).toBeTruthy()
  expect(route?.canonicalHash).toBe('#/torah/parsha/vayelech')
  expect(await renderStartingLineForRoute(route)).toBe(await renderStartingLineForRoute(
      toReaderRoute(parseUrl(generator, '/run/2029-09-15:shacharis,main'))
    ))
})

test('Parsha slug can start at a specific ref', async () => {
  const route = toReaderRoute(
    parseUrl(generator, '/torah/parsha/behar/3-25-1', { now: new Date('2026-01-01') })
  )

  expect(route).toBeTruthy()
  expect(route?.canonicalHash).toBe('#/torah/parsha/behar/3-25-1')
  expect(await renderStartingLineForRoute(route)).toBe(await renderStartingLineForRoute(
      toReaderRoute(parseUrl(generator, '/run/2027-05-22:shacharis,main/3-25-1'))
    ))
})

test('Vezos Haberacha has its own parsha route and display title', async () => {
  const route = toReaderRoute(
    parseUrl(generator, '/torah/parsha/vezos-haberacha/5-33-1', {
      now: new Date('2026-01-01'),
    })
  )

  expect(route).toBeTruthy()
  expect(route?.canonicalHash).toBe('#/torah/parsha/vezos-haberacha/5-33-1')
  expect(route?.model.displayTitleForRun(route.model.relevantRuns[0])).toBe('וזאת הברכה')
  expect(await renderStartingLineForRoute(route)).toMatch(/^וזאת הברכה:/)
})

test('Parsha slug resolves exact solo Nitzavim only', async () => {
  const route = toReaderRoute(
    parseUrl(generator, '/torah/parsha/nitzavim', { now: new Date('2026-01-01') })
  )

  expect(route).toBeTruthy()
  expect(route?.canonicalHash).toBe('#/torah/parsha/nitzavim')
  expect(await renderStartingLineForRoute(route)).toBe(await renderStartingLineForRoute(
      toReaderRoute(parseUrl(generator, '/run/2029-09-08:shacharis,main'))
    ))
})

test('Esther slug resolves to the megillah run', async () => {
  const route = toReaderRoute(
    parseUrl(generator, '/esther/megillah-esther', { now: new Date('2025-01-01') })
  )

  expect(route).toBeTruthy()
  expect(route?.canonicalHash).toBe('#/esther/megillah-esther')
  expect(route?.model.displayTitleForRun(route.model.relevantRuns[0])).toBe('מגילת אסתר')
  expect(await renderStartingLineForRoute(route)).toBe(await renderStartingLineForRoute(
      toReaderRoute(parseUrl(generator, '/run/2025-03-14:megillah,megillah'))
    ))
})

test('Bare Esther route redirects to the megillah route', async () => {
  const route = toReaderRoute(
    parseUrl(generator, '/esther', { now: new Date('2025-01-01') })
  )

  expect(route).toBeTruthy()
  expect(route?.canonicalHash).toBe('#/esther/megillah-esther')
  expect(route?.model.displayTitleForRun(route.model.relevantRuns[0])).toBe('מגילת אסתר')
})

test('Esther aliases canonicalize to megillah-esther', async () => {
  for (const slug of ['/esther/esther', '/esther/megillat-esther']) {
    const route = toReaderRoute(
      parseUrl(generator, slug, { now: new Date('2025-01-01') })
    )

    expect(route).toBeTruthy()
    expect(route?.canonicalHash).toBe('#/esther/megillah-esther')
    expect(await renderStartingLineForRoute(route)).toBe(await renderStartingLineForRoute(
        toReaderRoute(parseUrl(generator, '/run/2025-03-14:megillah,megillah'))
      ))
  }
})

test('Torah page URL starts directly at the requested page', async () => {
  const route = toReaderRoute(
    parseUrl(generator, '/torah/page/12', { now: new Date('2024-10-01') })
  )

  expect(route).toBeTruthy()
  expect(route?.canonicalHash).toBe('#/torah/page/12')
  const { page, lineNumber } = await route!.model.startingLocation
  expect(page.type).toBe('page')
  if (page.type !== 'page') throw new Error('Expected page route to start at a page')
  expect(page.pageNumber).toBe(12)
  expect(lineNumber).toBe(1)
  expect(generatePageUrl('torah', 12)).toBe('#/torah/page/12')
})

test('Esther page URL starts directly at the requested page', async () => {
  const route = toReaderRoute(
    parseUrl(generator, '/esther/page/3', { now: new Date('2025-01-01') })
  )

  expect(route).toBeTruthy()
  expect(route?.canonicalHash).toBe('#/esther/page/3')
  expect(route?.model.displayTitleForRun(route.model.relevantRuns[0])).toBe('מגילת אסתר')
  const { page, lineNumber } = await route!.model.startingLocation
  expect(page.type).toBe('page')
  if (page.type !== 'page') throw new Error('Expected page route to start at a page')
  expect(page.pageNumber).toBe(3)
  expect(lineNumber).toBe(1)
  expect(generatePageUrl('esther', 3)).toBe('#/esther/page/3')
})

test('Page URLs reject unknown scrolls and out of range pages', () => {
  expect(parseUrl(generator, '/torah/page/0')).toBeFalsy()
  expect(parseUrl(generator, '/torah/page/246')).toBeFalsy()
  expect(parseUrl(generator, '/esther/page/18')).toBeFalsy()
  expect(parseUrl(generator, '/page/not-a-scroll/12')).toBeFalsy()
})

test('Old parsha and page URL families are not parsed', () => {
  expect(parseUrl(generator, '/parsha/noach')).toBeFalsy()
  expect(parseUrl(generator, '/page/torah/12')).toBeFalsy()
  expect(parseUrl(generator, '/page/esther/3')).toBeFalsy()
  expect(parseUrl(generator, '/torah/parsha/megillah-esther')).toBeFalsy()
  expect(parseUrl(generator, '/esther/parsha/noach')).toBeFalsy()
  expect(parseUrl(generator, '/esther/parsha/megillah-esther')).toBeFalsy()
})

test('Unknown parsha slug is ignored', () => {
  expect(parseUrl(generator, '/torah/parsha/not-a-real-parsha')).toBeFalsy()
})

test('Run ID for פרשת נצבים', async () => {
  expect(await renderStartingLine(
      toModel(parseUrl(generator, '/run/2025-09-20:shacharis,main'))
    )).toMatchSnapshot()
})
test('Run ID for אסתר', async () => {
  expect(await renderStartingLine(
      toModel(parseUrl(generator, '/run/2025-03-14:megillah,megillah'))
    )).toMatchSnapshot()
})

test('Valid location reference in במדבר', async () => {
  expect(await renderStartingLine(toModel(parseUrl(generator, '/r/4-13-1')))).toMatchSnapshot()
})

test('Trailing slash okay', async () => {
  expect(await renderStartingLine(toModel(parseUrl(generator, '/r/4-13-1/')))).toBe(await renderStartingLine(toModel(parseUrl(generator, '/r/4-13-1'))))
})

test('Generated URLs round-trip', async () => {
  expect(await renderStartingLine(
      toModel(
        parseUrl(
        generator,
        generateUrl(generator.parseId('2025-09-20:shacharis,main')!).replace(
          /^#/,
          ''
        )
      )
      )
    )).toBe(await renderStartingLine(
      toModel(parseUrl(generator, '/run/2025-09-20:shacharis,main'))
    ))
})

test('Generated run URL can start at a specific ref', async () => {
  expect(await renderStartingLine(
      toModel(
        parseUrl(
          generator,
          generateUrl(generator.parseId('2025-05-03:shacharis,main')!, {
            scroll: 'torah',
            b: 3,
            c: 14,
            v: 1,
          }).replace(/^#/, '')
        )
      )
    )).toBe(await renderStartingLine(toModel(parseUrl(generator, '/run/2025-05-03:shacharis,main/3-14-1'))))
})

async function renderStartingLine(model: ScrollViewModel | null) {
  if (!model) throw new Error(`URL did not parse.`)

  const { page, lineNumber } = await model.startingLocation
  if (page.type !== 'page') throw new Error('First page should be a page')
  return renderLine(page.lines[lineNumber - 1])
}

function toModel(route: AppRoute | null) {
  if (!route || route.view !== 'reader') return null
  return route.model
}

function toReaderRoute(route: AppRoute | null) {
  if (!route || route.view !== 'reader') return null
  return route
}

async function renderStartingLineForRoute(route: AppRoute | null) {
  if (!route || route.view !== 'reader') throw new Error('URL did not parse.')
  const { page, lineNumber } = await route.model.startingLocation
  if (page.type !== 'page') throw new Error('First page should be a page')
  return renderLine(page.lines[lineNumber - 1])
}
