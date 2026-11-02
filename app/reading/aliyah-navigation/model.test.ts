import { expect, test } from 'vitest'
import { LeiningGenerator } from '../../calendar-model/generator.ts'
import { resolveParshaRun } from '../../view-model/navigation/parsha-routes.ts'
import {
  LeiningInstanceId,
  LeiningRunType,
  type LeiningDate,
  type LeiningInstance,
  type LeiningRun,
} from '../../calendar-model/model-types.ts'
import { getAliyahNavigationEntriesForRun, resolveActiveTargetForRun, type AliyahNavigationPlayback, type AliyahNavigationTarget } from './model.ts'

test('builds one shared navigation sequence across main and maftir runs', () => {
  const mainRun = createRunFixture({
    id: '2025-10-25:shacharis,main',
    type: LeiningRunType.Main,
    indexes: [1, 2, 3, 4, 5, 6, 7],
  })
  const maftirRun = createRunFixture({
    id: '2025-10-25:shacharis,maftir',
    type: LeiningRunType.Maftir,
    indexes: ['Maftir'],
  })
  const leining = createLeiningFixture([mainRun, maftirRun])
  mainRun.leining = leining
  maftirRun.leining = leining

  expect(
    getAliyahNavigationEntriesForRun(mainRun).map(({ run, aliyah }) => ({
      runId: run.id,
      aliyahIndex: aliyah.index,
    }))
  ).toEqual([
    { runId: mainRun.id, aliyahIndex: 1 },
    { runId: mainRun.id, aliyahIndex: 2 },
    { runId: mainRun.id, aliyahIndex: 3 },
    { runId: mainRun.id, aliyahIndex: 4 },
    { runId: mainRun.id, aliyahIndex: 5 },
    { runId: mainRun.id, aliyahIndex: 6 },
    { runId: mainRun.id, aliyahIndex: 7 },
    { runId: maftirRun.id, aliyahIndex: 'Maftir' },
  ])
})

test('Vezot parsha navigation uses the displayed seven divisions and leaves the dated holiday intact', () => {
  const generator = new LeiningGenerator({ ashkenazi: true, israel: false, includeModernHolidays: false })
  const resolved = resolveParshaRun(generator, 'vezot-haberacha', new Date('2026-01-01'))
  if (!resolved) throw new Error('Missing Vezot Haberacha fixture')
  const { run } = resolved
  const entries = getAliyahNavigationEntriesForRun(run)
  expect(entries.map(entry => entry.aliyah.index)).toEqual([1, 2, 3, 4, 5, 6, 7])
  expect(entries.every(entry => entry.run === run)).toBe(true)
  expect(entries[6].aliyah.start).toMatchObject({ b: 5, c: 34, v: 1 })
  const dated = generator.parseId('2026-10-04:shacharis,main')
  if (!dated) throw new Error('Missing dated Simchat Torah fixture')
  expect(dated.aliyot).toHaveLength(6)
  expect(getAliyahNavigationEntriesForRun(dated).at(-1)?.aliyah.index).toBe('Maftir')
})

test('prefers active playback for the selected run, then viewport, then first item', () => {
  const runId = '2025-10-25:shacharis,main'
  const first: AliyahNavigationTarget = { runId, aliyahIndex: 1 }
  const current: AliyahNavigationTarget = { runId, aliyahIndex: 3 }
  const playback: AliyahNavigationPlayback = {
    target: { runId, aliyahIndex: 5 },
    playing: true,
    progressLabel: '0:10/3:20',
  }

  expect(resolveActiveTargetForRun({ runId, current, playback, first })).toEqual(
    playback.target
  )
  expect(
    resolveActiveTargetForRun({
      runId,
      current,
      playback: { ...playback, playing: false },
      first,
    })
  ).toEqual(current)
  expect(
    resolveActiveTargetForRun({
      runId,
      current: { runId: 'another-run', aliyahIndex: 2 },
      playback: idlePlayback,
      first,
    })
  ).toEqual(first)
})

const idlePlayback: AliyahNavigationPlayback = {
  target: null,
  playing: false,
  progressLabel: '',
}

function createLeiningFixture(runs: LeiningRun[]): LeiningInstance {
  const date: LeiningDate = {
    date: new Date(2025, 9, 25),
    id: '2025-10-25',
    title: { en: 'Parshat Noach', he: 'פרשת נח' },
    leinings: [],
  }
  const leining: LeiningInstance = {
    kind: 'service',
    date,
    id: LeiningInstanceId.Shacharis,
    isParsha: true,
    runs,
  }
  date.leinings = [leining]
  return leining
}

function createRunFixture({
  id,
  type,
  indexes,
}: {
  id: string
  type: LeiningRunType
  indexes: Array<1 | 2 | 3 | 4 | 5 | 6 | 7 | 'Maftir'>
}): LeiningRun {
  return {
    id,
    type,
    leining: null as unknown as LeiningInstance,
    scroll: 'torah',
    aliyot: indexes.map((index, position) => ({
      index,
      start: { scroll: 'torah', b: 1, c: position + 1, v: 1 },
      end: { scroll: 'torah', b: 1, c: position + 1, v: 5 },
    })),
  }
}
