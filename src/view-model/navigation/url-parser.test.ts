import test from 'ava'
import {
  generateAboutUrl,
  generateCueAnalyticsUrl,
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

test('non-URL input', async (t) => {
  t.falsy(parseUrl(generator, 'hello world'))
})

test('Empty URL', (t) => {
  t.falsy(parseUrl(generator, ''))
})

test('Ignores unrecognized URL types', (t) => {
  t.falsy(parseUrl(generator, '/kav/tzav'))
})

test('Invalid location reference: Not numbers', (t) => {
  t.falsy(parseUrl(generator, '/r/foo-bar-baz'))
})

test('Invalid location reference: incomplete', (t) => {
  t.falsy(parseUrl(generator, '/r/5-22'))
})

test('Next', (t) => {
  t.truthy(parseUrl(generator, '/next'))
})

test('About', (t) => {
  t.deepEqual(parseUrl(generator, '/about'), { view: 'about' })
  t.is(generateAboutUrl(), '#/about')
})

test('Playback analytics', (t) => {
  t.deepEqual(parseUrl(generator, '/about/playback-analytics'), {
    view: 'cue-analytics',
  })
  t.deepEqual(parseUrl(generator, '/about/word-analytics'), {
    view: 'cue-analytics',
  })
  t.deepEqual(parseUrl(generator, '/about/cue-analytics'), {
    view: 'cue-analytics',
  })
  t.is(generateCueAnalyticsUrl(), '#/about/playback-analytics')
})

test('Parsha slug resolves Bereshit', async (t) => {
  const route = toReaderRoute(
    parseUrl(generator, '/parsha/beresheet', { now: new Date('2024-10-01') })
  )

  t.truthy(route)
  t.is(route?.canonicalHash, '#/parsha/beresheet')
  t.is(
    await renderStartingLineForRoute(route),
    await renderStartingLineForRoute(
      toReaderRoute(parseUrl(generator, '/run/2024-10-26:shacharis,main'))
    )
  )
})

test('Parsha alias canonicalizes Bereshit', async (t) => {
  const route = toReaderRoute(
    parseUrl(generator, '/parsha/bereshit', { now: new Date('2024-10-01') })
  )

  t.truthy(route)
  t.is(route?.canonicalHash, '#/parsha/beresheet')
  t.is(
    await renderStartingLineForRoute(route),
    await renderStartingLineForRoute(
      toReaderRoute(parseUrl(generator, '/run/2024-10-26:shacharis,main'))
    )
  )
})

test('Parsha slug resolves exact solo Vayelech only', async (t) => {
  const route = toReaderRoute(
    parseUrl(generator, '/parsha/vayelech', { now: new Date('2026-01-01') })
  )

  t.truthy(route)
  t.is(route?.canonicalHash, '#/parsha/vayelech')
  t.is(
    await renderStartingLineForRoute(route),
    await renderStartingLineForRoute(
      toReaderRoute(parseUrl(generator, '/run/2029-09-15:shacharis,main'))
    )
  )
})

test('Parsha slug resolves exact solo Nitzavim only', async (t) => {
  const route = toReaderRoute(
    parseUrl(generator, '/parsha/nitzavim', { now: new Date('2026-01-01') })
  )

  t.truthy(route)
  t.is(route?.canonicalHash, '#/parsha/nitzavim')
  t.is(
    await renderStartingLineForRoute(route),
    await renderStartingLineForRoute(
      toReaderRoute(parseUrl(generator, '/run/2029-09-08:shacharis,main'))
    )
  )
})

test('Esther slug resolves to the megillah run', async (t) => {
  const route = toReaderRoute(
    parseUrl(generator, '/parsha/megillah-esther', { now: new Date('2025-01-01') })
  )

  t.truthy(route)
  t.is(route?.canonicalHash, '#/parsha/megillah-esther')
  t.is(
    await renderStartingLineForRoute(route),
    await renderStartingLineForRoute(
      toReaderRoute(parseUrl(generator, '/run/2025-03-14:megillah,megillah'))
    )
  )
})

test('Esther aliases canonicalize to megillah-esther', async (t) => {
  for (const slug of ['/parsha/esther', '/parsha/megillat-esther']) {
    const route = toReaderRoute(
      parseUrl(generator, slug, { now: new Date('2025-01-01') })
    )

    t.truthy(route)
    t.is(route?.canonicalHash, '#/parsha/megillah-esther')
    t.is(
      await renderStartingLineForRoute(route),
      await renderStartingLineForRoute(
        toReaderRoute(parseUrl(generator, '/run/2025-03-14:megillah,megillah'))
      )
    )
  }
})

test('Unknown parsha slug is ignored', (t) => {
  t.falsy(parseUrl(generator, '/parsha/not-a-real-parsha'))
})

test('Run ID for פרשת נצבים', async (t) => {
  t.snapshot(
    await renderStartingLine(
      toModel(parseUrl(generator, '/run/2025-09-20:shacharis,main'))
    )
  )
})
test('Run ID for אסתר', async (t) => {
  t.snapshot(
    await renderStartingLine(
      toModel(parseUrl(generator, '/run/2025-03-14:megillah,megillah'))
    )
  )
})

test('Valid location reference in במדבר', async (t) => {
  t.snapshot(
    await renderStartingLine(toModel(parseUrl(generator, '/r/4-13-1')))
  )
})

test('Trailing slash okay', async (t) => {
  t.is(
    await renderStartingLine(toModel(parseUrl(generator, '/r/4-13-1/'))),
    await renderStartingLine(toModel(parseUrl(generator, '/r/4-13-1')))
  )
})

test('Generated URLs round-trip', async (t) => {
  t.is(
    await renderStartingLine(
      toModel(
        parseUrl(
        generator,
        generateUrl(generator.parseId('2025-09-20:shacharis,main')!).replace(
          /^#/,
          ''
        )
      )
      )
    ),
    await renderStartingLine(
      toModel(parseUrl(generator, '/run/2025-09-20:shacharis,main'))
    )
  )
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
