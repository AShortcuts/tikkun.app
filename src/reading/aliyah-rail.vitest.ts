import { expect, test } from 'vitest'
import {
  LeiningInstanceId,
  LeiningRunType,
  type LeiningDate,
  type LeiningInstance,
  type LeiningRun,
} from '../calendar-model/model-types.ts'
import { aliyahRailItemsSignature, getAliyahRailItemsForRun } from './aliyah-rail.ts'

test('includes maftir as a distinct rail item when maftir is a separate run', () => {
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
    getAliyahRailItemsForRun(mainRun).map((item) => ({
      runId: item.run.id,
      aliyahIndex: item.aliyah.index,
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

test('creates a stable rail signature from run and aliyah identities', () => {
  const mainRun = createRunFixture({
    id: '2025-10-25:shacharis,main',
    type: LeiningRunType.Main,
    indexes: [1, 2],
  })
  const maftirRun = createRunFixture({
    id: '2025-10-25:shacharis,maftir',
    type: LeiningRunType.Maftir,
    indexes: ['Maftir'],
  })

  expect(
    aliyahRailItemsSignature([
      { run: mainRun, aliyah: mainRun.aliyot[0] },
      { run: mainRun, aliyah: mainRun.aliyot[1] },
      { run: maftirRun, aliyah: maftirRun.aliyot[0] },
    ])
  ).toBe(
    '2025-10-25:shacharis,main:1|2025-10-25:shacharis,main:2|2025-10-25:shacharis,maftir:Maftir'
  )
})

function createLeiningFixture(runs: LeiningRun[]): LeiningInstance {
  const date: LeiningDate = {
    date: new Date(2025, 9, 25),
    id: '2025-10-25',
    title: { en: 'Parshat Noach', he: 'פרשת נח' },
    leinings: [],
  }
  const leining: LeiningInstance = {
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
