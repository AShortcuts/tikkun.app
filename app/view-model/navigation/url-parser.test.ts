import { expect, test } from 'vitest'
import { generateAboutUrl, generateAliyahUrl, generateUrl, parseUrl } from './url-parser.ts'
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

test('unsupported run URLs render not found instead of starting a broken reader', () => {
  expect(
    parseUrl(generator, '/run/2026-07-22:megillah,megillah')
  ).toEqual({ view: 'not-found' })
})

test('About', () => {
  expect(parseUrl(generator, '/about')).toEqual({ view: 'about' })
  expect(generateAboutUrl()).toBe('#/about')
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

test('Nonexistent Torah references render the not-found route', () => {
  expect(parseUrl(generator, '/r/4-46-9')).toEqual({ view: 'not-found' })
})

test.each([1])('canonical and legacy references locate the same verse in book %s', async (book) => {
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

test.each(['/torah/4-46-9'])(
  'rejects nonexistent Torah reference %s', (path) => {
    expect(parseUrl(generator, path)).toEqual({ view: 'not-found' })
  }
)

test('Run ID for פרשת נצבים', async () => {
  expect(await renderStartingLine(
      toModel(parseUrl(generator, '/run/2025-09-20:shacharis,main'))
    )).toMatchSnapshot()
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

test.each<PlaybackAliyahIndex>(['Maftir'])(
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

test.each([[false, '2026-10-04:shacharis,last-aliyah', 7]] as const)('special service targets round-trip in israel=%s: %s', (israel, runId, aliyahIndex) => {
  const regionalGenerator = new LeiningGenerator({ ...testSettings, israel })
  const run = regionalGenerator.parseId(runId)!
  const hash = generateAliyahUrl(run, aliyahIndex)
  expect(hash).toBe(`${generateUrl(run, run.aliyot[0].start)}/aliyah/${aliyahIndex}`)
  expect(toReaderRoute(parseUrl(regionalGenerator, hash.slice(1)))?.aliyahTarget)
    .toEqual({ runId, aliyahIndex })
  expect(isReaderHash(hash)).toBe(true)
  expect(isSemanticallyRoutableReaderHash(hash)).toBe(true)
})

test.each(['/torah/parsha/beresheet/1-2-4/aliyah/1', '/torah/parsha/beresheet/1-6-4/aliyah/Maftir'])('rejects a missing division or mismatched reference: %s', (path) => {
  expect(parseUrl(generator, path)).toEqual({ view: 'not-found' })
})

test.each(['/torah/parsha/beresheet/aliyah/1', '/torah/parsha/beresheet/1-1-1/aliyah/maftir'])('rejects unsupported or trailing route components: %s', (path) => {
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
