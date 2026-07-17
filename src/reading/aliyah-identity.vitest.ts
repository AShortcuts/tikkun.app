import { expect, test } from 'vitest'
import type { LeiningRun } from '../calendar-model/model-types.ts'
import {
  aliyahMembershipsAtRef,
  parseAliyahIndex,
  resolveActiveAliyahIdentity,
  type AliyahIdentity,
} from './aliyah-identity.ts'

const first: AliyahIdentity = { runId: 'rosh-chodesh', index: 1 }
const second: AliyahIdentity = { runId: 'rosh-chodesh', index: 2 }

test('explicit intent selects one valid membership until the focal verse leaves it', () => {
  expect(resolveActiveAliyahIdentity({
    memberships: [first, second],
    explicit: first,
  })).toEqual(first)
  expect(resolveActiveAliyahIdentity({
    memberships: [second],
    explicit: first,
  })).toEqual(second)
})

test('playback and pending navigation take precedence over explicit selection', () => {
  expect(resolveActiveAliyahIdentity({
    memberships: [first, second],
    playback: second,
    pending: first,
    explicit: first,
  })).toEqual(second)
  expect(resolveActiveAliyahIdentity({
    memberships: [first, second],
    pending: second,
    explicit: first,
  })).toEqual(second)
})

test('the most recently started focal membership is the default', () => {
  expect(resolveActiveAliyahIdentity({ memberships: [first, second] })).toEqual(second)
})

test('focal scripture membership spans overlapping aliyot across separate runs', () => {
  const runs = [
    {
      id: 'main',
      aliyot: [{
        index: 7,
        start: { scroll: 'torah', b: 1, c: 10, v: 1 },
        end: { scroll: 'torah', b: 1, c: 10, v: 5 },
      }],
    },
    {
      id: 'maftir',
      aliyot: [{
        index: 'Maftir',
        start: { scroll: 'torah', b: 1, c: 10, v: 4 },
        end: { scroll: 'torah', b: 1, c: 10, v: 5 },
      }],
    },
  ] as LeiningRun[]

  expect(aliyahMembershipsAtRef(runs, { b: 1, c: 10, v: 3 })).toEqual([
    { runId: 'main', index: 7 },
  ])
  expect(aliyahMembershipsAtRef(runs, { b: 1, c: 10, v: 4 })).toEqual([
    { runId: 'main', index: 7 },
    { runId: 'maftir', index: 'Maftir' },
  ])
})

test('parses valid aliyah indices from DOM values', () => {
  expect(parseAliyahIndex('1')).toBe(1)
  expect(parseAliyahIndex('7')).toBe(7)
  expect(parseAliyahIndex('Maftir')).toBe('Maftir')
  expect(parseAliyahIndex(undefined)).toBeNull()
  expect(parseAliyahIndex('0')).toBeNull()
  expect(parseAliyahIndex('8')).toBeNull()
  expect(parseAliyahIndex('1.5')).toBeNull()
})
