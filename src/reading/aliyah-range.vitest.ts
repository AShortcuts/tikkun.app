import { expect, test } from 'vitest'
import {
  LeiningInstanceId,
  LeiningRunType,
  type LeiningDate,
  type LeiningInstance,
  type LeiningRun,
} from '../calendar-model/model-types.ts'
import { isLastIndexedAliyahInRun } from './aliyah-range.ts'

test('recognizes the final aliyah in a three-aliyah holiday run', () => {
  const run = createRunFixture([1, 2, 3])

  expect(isLastIndexedAliyahInRun(run, 1)).toBe(false)
  expect(isLastIndexedAliyahInRun(run, 2)).toBe(false)
  expect(isLastIndexedAliyahInRun(run, 3)).toBe(true)
})

test('does not treat seventh aliyah as final when Maftir follows it', () => {
  const run = createRunFixture([7, 'Maftir'])

  expect(isLastIndexedAliyahInRun(run, 7)).toBe(false)
  expect(isLastIndexedAliyahInRun(run, 'Maftir')).toBe(true)
})

function createRunFixture(indexes: Array<1 | 2 | 3 | 7 | 'Maftir'>): LeiningRun {
  const date: LeiningDate = {
    date: new Date(2026, 6, 23),
    id: '2026-07-23',
    title: { en: "Tish'a B'Av", he: 'תשעה באב' },
    leinings: [],
  }
  const leining: LeiningInstance = {
    date,
    id: LeiningInstanceId.Shacharis,
    isParsha: false,
    runs: [],
  }
  const run: LeiningRun = {
    leining,
    type: LeiningRunType.Main,
    id: '2026-07-23:shacharis,main',
    scroll: 'torah',
    aliyot: indexes.map((index, position) => ({
      index,
      start: ref(position + 1),
      end: ref(position + 2),
    })),
  }
  date.leinings = [leining]
  leining.runs = [run]
  return run
}

function ref(chapter: number) {
  return { scroll: 'torah' as const, b: 5, c: chapter, v: 1 }
}
