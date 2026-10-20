import { expect, test } from 'vitest'
import {
  generateAboutUrl,
  generateAliyahUrl,
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
import type { PlaybackAliyahIndex } from '../../reading/aliyah-dom-target.ts'
import { resolveParshaRun } from './parsha-routes.ts'
import { isReaderHash } from './reader-hash.ts'
import { isSemanticallyRoutableReaderHash } from './routable-reader-hash.ts'

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

test('/next skips unsupported readings', async () => {
  const route = toReaderRoute(
    parseUrl(generator, '/next', { now: new Date('2026-07-21T12:00:00') })
  )
  const directRoute = toReaderRoute(
    parseUrl(generator, '/run/2026-07-23:shacharis,main')
  )

  expect(route?.model.relevantRuns[0]?.id).toBe(
    '2026-07-23:shacharis,main'
  )
  expect(await renderStartingLineForRoute(route)).toBe(
    await renderStartingLineForRoute(directRoute)
  )
})

test('unsupported run URLs render not found instead of starting a broken reader', () => {
  expect(
    parseUrl(generator, '/run/2026-07-22:megillah,megillah')
  ).toEqual({ view: 'not-found' })
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

test('Parsha slug resolves Beresheet', async () => {
  const route = toReaderRoute(
    parseUrl(generator, '/torah/parsha/beresheet', { now: new Date('2024-10-01') })
  )

  expect(route).toBeTruthy()
  expect(route?.canonicalHash).toBe('#/torah/parsha/beresheet')
  expect(await renderStartingLineForRoute(route)).toBe(await renderStartingLineForRoute(
      toReaderRoute(parseUrl(generator, '/run/2024-10-26:shacharis,main'))
    ))
})

test('hash-route search parameters do not change route parsing', async () => {
  const route = toReaderRoute(
    parseUrl(generator, '/torah/parsha/lech-lecha/1-13-5?aliyah=3', {
      now: new Date('2024-10-01'),
    })
  )

  expect(route?.canonicalHash).toBe('#/torah/parsha/lech-lecha/1-13-5')
  expect(await renderStartingLineForRoute(route)).toBe(
    await renderStartingLineForRoute(
      toReaderRoute(
        parseUrl(generator, '/torah/parsha/lech-lecha/1-13-5', {
          now: new Date('2024-10-01'),
        })
      )
    )
  )
})

test('alternate Bereshit spelling canonicalizes to Beresheet', async () => {
  const route = toReaderRoute(
    parseUrl(generator, '/torah/parsha/bereshit', { now: new Date('2024-10-01') })
  )

  expect(route).toBeTruthy()
  expect(route?.canonicalHash).toBe('#/torah/parsha/beresheet')
  expect(await renderStartingLineForRoute(route)).toBe(await renderStartingLineForRoute(
      toReaderRoute(parseUrl(generator, '/run/2024-10-26:shacharis,main'))
    ))
})

test('alternate Vayetze spelling canonicalizes to Vayetzei', async () => {
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

test('a reference outside the named parsha opens the containing Torah reading', async () => {
  const route = toReaderRoute(
    parseUrl(generator, '/torah/parsha/haazinu/5-31-28', {
      now: new Date('2026-01-01'),
    })
  )

  expect(route?.canonicalHash).toBe('#/torah/5-31-28')
  expect(await renderStartingLineForRoute(route)).toBe(
    await renderStartingLineForRoute(
      toReaderRoute(
        parseUrl(generator, '/run/2026-09-05:shacharis,main/5-31-28')
      )
    )
  )
})

test('combined Parsha slug resolves its reading and reference', async () => {
  const route = toReaderRoute(
    parseUrl(generator, '/torah/parsha/nitzavim-vayelech/5-31-28', {
      now: new Date('2026-01-01'),
    })
  )

  expect(route?.canonicalHash).toBe(
    '#/torah/parsha/nitzavim-vayelech/5-31-28'
  )
  expect(await renderStartingLineForRoute(route)).toBe(
    await renderStartingLineForRoute(
      toReaderRoute(
        parseUrl(generator, '/run/2026-09-05:shacharis,main/5-31-28')
      )
    )
  )
})

test('dated run routes reject references outside their reading', () => {
  expect(
    parseUrl(generator, '/run/2024-10-26:shacharis,main/1-13-1')
  ).toEqual({ view: 'not-found' })
})

test('legacy Vezos Haberacha links resolve to canonical Vezot Haberacha', async () => {
  const route = toReaderRoute(
    parseUrl(generator, '/torah/parsha/vezos-haberacha/5-33-1', {
      now: new Date('2026-01-01'),
    })
  )

  expect(route).toBeTruthy()
  expect(route?.canonicalHash).toBe('#/torah/parsha/vezot-haberacha/5-33-1')
  const run = route!.model.relevantRuns.find(run => run.id === 'parsha:vezot-haberacha,main')!
  expect(route?.model.displayTitleForRun(run)).toBe('וזאת הברכה')
  expect(run.aliyot).toHaveLength(7)
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
  expect(parseUrl(generator, '/torah/page/0')?.view).toBe('not-found')
  expect(parseUrl(generator, '/torah/page/246')?.view).toBe('not-found')
  expect(parseUrl(generator, '/esther/page/18')?.view).toBe('not-found')
  expect(parseUrl(generator, '/page/not-a-scroll/12')).toBeFalsy()
})

test('Nonexistent Torah references render the not-found route', () => {
  expect(parseUrl(generator, '/r/4-46-9')).toEqual({ view: 'not-found' })
})

test.each([1, 2, 3, 4, 5])('canonical and legacy references locate the same verse in book %s', async (book) => {
  const path = `/torah/${book}-1-1`
  const canonical = toReaderRoute(parseUrl(generator, path))
  const legacy = toReaderRoute(parseUrl(generator, `/r/${book}-1-1`))

  expect(canonical?.canonicalHash).toBe(`#${path}`)
  expect(legacy?.canonicalHash).toBe(`#${path}`)
  expect(await renderStartingLineForRoute(canonical)).toBe(
    await renderStartingLineForRoute(legacy)
  )
  expect(canonical?.model.relevantRuns.map((run) => run.id)).toEqual(
    legacy?.model.relevantRuns.map((run) => run.id)
  )
})

test.each(['/torah/5-33-24', '/r/5-33-24'])('locates Devarim 33:24 from %s', async (path) => {
  const route = toReaderRoute(parseUrl(generator, path))
  expect(route?.canonicalHash).toBe('#/torah/5-33-24')
  expect(await route?.model.startingLocation).toMatchObject({
    page: { type: 'page', pageNumber: 245 },
    lineNumber: 11,
  })
})

test.each(['/torah/4-46-9', '/torah/6-1-1', '/torah/0-1-1'])(
  'rejects nonexistent Torah reference %s', (path) => {
    expect(parseUrl(generator, path)).toEqual({ view: 'not-found' })
  }
)

test.each(['/torah/5-33', '/torah/foo-bar-baz', '/torah/5-33-24/extra'])(
  'rejects malformed Torah reference route %s', (path) => {
    expect(parseUrl(generator, path)).toBeNull()
  }
)

test('canonical Torah references accept a trailing slash and ignore hash query parameters', () => {
  expect(toReaderRoute(parseUrl(generator, '/torah/5-33-24/?aliyah=5'))?.canonicalHash)
    .toBe('#/torah/5-33-24')
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

test('explicit aliyah links preserve canonical aliases and the continuous model', async () => {
  const route = toReaderRoute(parseUrl(generator, '/torah/parsha/bereshit/1-2-4/aliyah/2'))
  const continuous = toReaderRoute(parseUrl(generator, '/torah/parsha/beresheet/1-2-4'))
  expect(route?.canonicalHash).toBe('#/torah/parsha/beresheet/1-2-4/aliyah/2')
  expect(route?.aliyahTarget).toEqual({ runId: 'parsha:beresheet,main', aliyahIndex: 2 })
  expect(continuous?.aliyahTarget).toBeUndefined()
  expect(route?.model.constructor).toBe(continuous?.model.constructor)
  expect(route?.model.relevantRuns.map(run => run.id))
    .toEqual(continuous?.model.relevantRuns.map(run => run.id))
  expect(await renderStartingLineForRoute(route)).toBe(await renderStartingLineForRoute(continuous))
})

test.each<PlaybackAliyahIndex>([7, 'Maftir'])(
  'explicit overlapping target %s survives parsing and generation', (aliyahIndex) => {
    const run = resolveParshaRun(generator, 'beresheet')!.run
    const reference = { scroll: 'torah', b: 1, c: 6, v: 5 } as const
    const hash = generateAliyahUrl(run, aliyahIndex, reference)
    expect(hash).toBe(`#/torah/parsha/beresheet/1-6-5/aliyah/${aliyahIndex}`)
    const route = toReaderRoute(parseUrl(generator, hash.slice(1)))
    expect(route?.canonicalHash).toBe(hash)
    expect(route?.aliyahTarget).toEqual({ runId: run.id, aliyahIndex })
    expect(isReaderHash(hash)).toBe(true)
    expect(isSemanticallyRoutableReaderHash(hash)).toBe(true)
  }
)

test('generated aliyah links default to the selected start and accept its inclusive end', () => {
  const run = resolveParshaRun(generator, 'beresheet')!.run
  expect(generateAliyahUrl(run, 2)).toBe('#/torah/parsha/beresheet/1-2-4/aliyah/2')
  expect(generateAliyahUrl(run, 'Maftir')).toBe('#/torah/parsha/beresheet/1-6-5/aliyah/Maftir')
  const hash = generateAliyahUrl(run, 2, { scroll: 'torah', b: 1, c: 2, v: 19 })
  expect(hash).toBe('#/torah/parsha/beresheet/1-2-19/aliyah/2')
  expect(toReaderRoute(parseUrl(generator, hash.slice(1)))?.aliyahTarget?.aliyahIndex).toBe(2)
})

test('dated service targets keep their original run and divisions', async () => {
  const run = generator.parseId('2026-10-04:shacharis,main')!
  const ref = { scroll: 'torah', b: 5, c: 34, v: 1 } as const
  const hash = generateAliyahUrl(run, 6, ref)
  expect(hash).toBe('#/run/2026-10-04:shacharis,main/5-34-1/aliyah/6')
  const route = toReaderRoute(parseUrl(generator, hash.slice(1)))
  const continuous = toReaderRoute(parseUrl(generator, generateUrl(run, ref).slice(1)))
  expect(route?.canonicalHash).toBeUndefined()
  expect(route?.aliyahTarget).toEqual({ runId: run.id, aliyahIndex: 6 })
  expect(route?.model.constructor).toBe(continuous?.model.constructor)
  expect(route?.model.relevantRuns.map(run => run.id))
    .toEqual(continuous?.model.relevantRuns.map(run => run.id))
  expect(await renderStartingLineForRoute(route)).toBe(await renderStartingLineForRoute(continuous))

  const canonical = toReaderRoute(parseUrl(generator, '/torah/parsha/vezos-haberacha/5-34-1/aliyah/7'))
  expect(canonical?.canonicalHash).toBe('#/torah/parsha/vezot-haberacha/5-34-1/aliyah/7')
  expect(canonical?.aliyahTarget).toEqual({ runId: 'parsha:vezot-haberacha,main', aliyahIndex: 7 })
  expect(parseUrl(generator, '/torah/parsha/vezot-haberacha/5-34-1/aliyah/6'))
    .toEqual({ view: 'not-found' })
})

test.each([
  [false, '2026-10-04:shacharis,last-aliyah', 7],
  [true, '2026-10-03:shacharis,last-aliyah', 8],
  [false, '2026-10-04:shacharis,maftir', 'Maftir'],
] as const)('special service targets round-trip in israel=%s: %s', (israel, runId, aliyahIndex) => {
  const regionalGenerator = new LeiningGenerator({ ...testSettings, israel })
  const run = regionalGenerator.parseId(runId)!
  const hash = generateAliyahUrl(run, aliyahIndex)
  expect(hash).toBe(`${generateUrl(run, run.aliyot[0].start)}/aliyah/${aliyahIndex}`)
  expect(toReaderRoute(parseUrl(regionalGenerator, hash.slice(1)))?.aliyahTarget)
    .toEqual({ runId, aliyahIndex })
  expect(isReaderHash(hash)).toBe(true)
  expect(isSemanticallyRoutableReaderHash(hash)).toBe(true)
})

test.each([
  '/torah/parsha/beresheet/1-2-4/aliyah/1',
  '/torah/parsha/beresheet/1-2-19/aliyah/3',
  '/torah/parsha/beresheet/1-1-1/aliyah/8',
  '/torah/parsha/beresheet/1-6-4/aliyah/Maftir',
  '/torah/parsha/vezot-haberacha/5-34-1/aliyah/Maftir',
  '/torah/parsha/haazinu/5-31-28/aliyah/1',
  '/run/2026-10-04:shacharis,main/5-34-1/aliyah/7',
  '/run/2026-10-04:shacharis,last-aliyah/1-1-1/aliyah/8',
  '/run/2026-10-04:shacharis,main/1-1-1/aliyah/1',
  '/run/2025-03-14:megillah,megillah/1-1-1/aliyah/1',
])('rejects a missing division or mismatched reference: %s', (path) => {
  expect(parseUrl(generator, path)).toEqual({ view: 'not-found' })
})

test('persisted route validation rejects semantically invalid explicit selections', () => {
  for (const hash of [
    '#/torah/parsha/beresheet/1-2-4/aliyah/1',
    '#/torah/parsha/beresheet/1-1-1/aliyah/8',
    '#/torah/parsha/haazinu/5-31-28/aliyah/1',
    '#/run/2025-03-14:megillah,megillah/1-1-1/aliyah/1',
  ]) expect(isSemanticallyRoutableReaderHash(hash), hash).toBe(false)
})

test.each([
  '/torah/parsha/beresheet/aliyah/1',
  '/run/2024-10-26:shacharis,main/aliyah/1',
  '/torah/parsha/beresheet/1-1-1/aliyah',
  '/torah/parsha/beresheet/1-1-1/aliyah/0',
  '/torah/parsha/beresheet/1-1-1/aliyah/9',
  '/torah/parsha/beresheet/1-1-1/aliyah/01',
  '/torah/parsha/beresheet/1-1-1/aliyah/1.0',
  '/torah/parsha/beresheet/1-1-1/aliyah/maftir',
  '/torah/parsha/beresheet/1-1-1/aliyah/1/extra',
  '/torah/parsha/beresheet/1-1-1/aliyah//1',
  '/torah/parsha/beresheet/1-1-1/aliyah/1\n',
  '/run/2024-10-26:shacharis,main/1-1-1/aliyah/1/extra',
  '/torah/1-1-1/aliyah/1',
  '/r/1-1-1/aliyah/1',
  '/torah/page/1/aliyah/1',
  '/esther/megillah-esther/1-1-1/aliyah/1',
  '/esther/page/1/aliyah/1',
  '/next/aliyah/1',
  '/about/aliyah/1',
  '/r/1-1-1/extra',
  '/torah/parsha/beresheet/1-1-1/extra',
  '/run/2024-10-26:shacharis,main/1-1-1/extra',
  '/esther/megillah-esther/1-1-1/extra',
  '/torah/page/1/extra',
  '/esther/page/1/extra',
])('rejects unsupported or trailing route components: %s', (path) => {
  expect(parseUrl(generator, path)).toBeNull()
  expect(isReaderHash(`#${path}`)).toBe(false)
})

test('aliyah generation rejects unavailable targets and refs instead of dropping their selection', () => {
  const run = resolveParshaRun(generator, 'beresheet')!.run
  for (const index of [0, 8, 9, 1.5, NaN, Infinity]) {
    expect(() => generateAliyahUrl(run, index)).toThrow(/does not exist/)
  }
  expect(() => generateAliyahUrl(run, 1, { scroll: 'torah', b: 1, c: 2, v: 4 }))
    .toThrow(/Reference does not belong/)
  expect(() => generateAliyahUrl(run, 1, { scroll: 'esther', b: 1, c: 1, v: 1 }))
    .toThrow(/Reference does not belong/)
  expect(() => generateAliyahUrl(run, 1, { scroll: 'torah', b: 1, c: 1, v: 999 }))
    .toThrow(/Reference does not belong/)
  expect(() => generateAliyahUrl(generator.parseId('2025-03-14:megillah,megillah')!, 1))
    .toThrow(/does not exist/)
})

test('reparsing history entries does not retain a previous explicit target', () => {
  const paths = [
    '/torah/parsha/beresheet/1-6-5/aliyah/7',
    '/torah/parsha/beresheet/1-6-5/aliyah/Maftir',
  ]
  for (const [pathIndex, expectedIndex] of [[0, 7], [1, 'Maftir'], [0, 7], [1, 'Maftir']] as const) {
    const route = toReaderRoute(parseUrl(generator, paths[pathIndex]))
    expect(route?.canonicalHash).toBe(`#${paths[pathIndex]}`)
    expect(route?.aliyahTarget).toEqual({ runId: 'parsha:beresheet,main', aliyahIndex: expectedIndex })
  }
  expect(toReaderRoute(parseUrl(generator, '/torah/parsha/beresheet/1-6-5'))?.aliyahTarget)
    .toBeUndefined()
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
