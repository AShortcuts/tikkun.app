import { expect, test } from 'vitest'
import { readingHashFromNativeUrl } from '../../platform/native-reading-links.ts'
import {
  isReaderHash,
  isSemanticParshaHash,
  preserveSemanticParshaRoute,
} from './reader-hash.ts'

test.each([
  '#/run/2026-10-17:shacharis,main',
  '#/torah/parsha/noach',
  '#/esther/megillah-esther',
  '#/torah/5-33-24',
  '#/r/1-1-1',
  '#/torah/parsha/beresheet/1-2-4/aliyah/2',
  '#/torah/parsha/beresheet/1-6-5/aliyah/7',
  '#/torah/parsha/beresheet/1-6-5/aliyah/Maftir',
  '#/run/2026-10-04:shacharis,main/5-33-27/aliyah/6',
  '#/run/2026-10-03:shacharis,last-aliyah/1-1-1/aliyah/8',
  '#/run/2026-10-04:shacharis,maftir/4-29-35/aliyah/Maftir',
  '#/torah/page/1',
  '#/esther/page/1',
])('accepts reader hash %s', (hash) => {
  expect(isReaderHash(hash)).toBe(true)
})

test.each([
  '#/torah/not-a-route',
  '#/torah/parsha/',
  '#/torah/parsha/noach/not-a-ref',
  '#/torah/page/0',
  '#/torah/5-33',
  '#/torah/0-1-1',
  '#/torah/5-33-24/extra',
  '#/esther/page/-1',
  '#/run/id/1-2',
  '#/r/1-2-3/extra',
  '#/torah/parsha/beresheet/aliyah/1',
  '#/run/2026-10-04:shacharis,main/aliyah/1',
  '#/torah/parsha/beresheet/1-1-1/aliyah',
  '#/torah/parsha/beresheet/1-1-1/aliyah/0',
  '#/torah/parsha/beresheet/1-1-1/aliyah/9',
  '#/torah/parsha/beresheet/1-1-1/aliyah/01',
  '#/torah/parsha/beresheet/1-1-1/aliyah/1.0',
  '#/torah/parsha/beresheet/1-1-1/aliyah/maftir',
  '#/torah/parsha/beresheet/1-1-1/aliyah/M',
  '#/torah/parsha/beresheet/1-1-1/aliyah/1/extra',
  '#/torah/parsha/beresheet/1-1-1/aliyah//1',
  '#/torah/parsha/beresheet/1-1-1/aliyah/1/',
  '#/torah/parsha/beresheet/1-1-1/aliyah/1\n',
  '#/torah/parsha/beresheet/1-1-1/aliyah/1?x=1',
  '#/torah/parsha/beresheet/1-1-1/aliyah/1#extra',
  '#/torah/parsha/beresheet/1-1-1/extra',
  '#/torah/parsha/-beresheet/1-1-1',
  '#/torah/parsha/beresheet-/1-1-1',
  '#/torah/parsha/beresheet/1-1-1\n',
  '#/run/2026-10-04:shacharis,main/5-33-27/aliyah/6/extra',
  '#/torah/1-1-1/aliyah/1',
  '#/r/1-1-1/aliyah/1',
  '#/torah/page/1/aliyah/1',
  '#/esther/megillah-esther/1-1-1/aliyah/1',
  '#/esther/page/1/aliyah/1',
  '#/esther/parsha',
  '#/esther/parsha/1-1-1',
  '#/esther/page',
  '#/r/1-1-1\n',
])('rejects malformed reader hash %s', (hash) => {
  expect(isReaderHash(hash)).toBe(false)
})

test.each(['#/about', '#/next', '/reader/#/torah/page/1', '', null])(
  'rejects non-reader hash %s',
  (hash) => {
    expect(isReaderHash(hash)).toBe(false)
  }
)

test.each([
  '#/torah/parsha/haazinu/5-32-1',
  '#/torah/parsha/beresheet/1-6-5/aliyah/Maftir',
  '#/esther/megillah-esther/1-1-1',
])('recognizes semantic parsha hash %s', (hash) => {
  expect(isSemanticParshaHash(hash)).toBe(true)
})

test.each([
  '#/run/2026-09-05:shacharis,main/5-31-20',
  '#/run/2026-10-04:shacharis,main/5-33-27/aliyah/6',
  '#/torah/parsha/beresheet/aliyah/1',
  '#/torah/parsha/beresheet/1-1-1/aliyah/1/extra',
  '#/torah/parsha/beresheet/1-1-1/aliyah/1\n',
  '#/esther/megillah-esther/1-1-1/aliyah/1',
  '#/r/5-31-20',
  '#/torah/5-31-20',
  '#/torah/page/242',
  '#/esther/page/1',
])('does not treat non-parsha reader hash %s as semantic', (hash) => {
  expect(isSemanticParshaHash(hash)).toBe(false)
})

test('keeps the active parsha route while adopting a scrolled run reference', () => {
  expect(
    preserveSemanticParshaRoute(
      '#/torah/parsha/haazinu/5-32-1',
      '#/run/2026-09-05:shacharis,main/5-31-28'
    )
  ).toBe('#/torah/parsha/haazinu/5-31-28')
})

test('allows a semantic route to promote across a parsha boundary', () => {
  expect(
    preserveSemanticParshaRoute(
      '#/torah/parsha/beresheet/1-5-25',
      '#/torah/parsha/noach/1-6-9'
    )
  ).toBe('#/torah/parsha/noach/1-6-9')
})

test.each(['', '/aliyah/7'])(
  'passive run references preserve an explicit canonical target with source suffix %s', (suffix) => {
    expect(preserveSemanticParshaRoute(
      '#/torah/parsha/beresheet/1-6-5/aliyah/Maftir',
      `#/run/2024-10-26:shacharis,main/1-6-6${suffix}`
    )).toBe('#/torah/parsha/beresheet/1-6-6/aliyah/Maftir')
  }
)

test('passive service indices are not assigned to canonical parsha divisions', () => {
  expect(preserveSemanticParshaRoute(
    '#/torah/parsha/vezot-haberacha/5-33-27',
    '#/run/2026-10-04:shacharis,main/5-34-1/aliyah/6'
  )).toBe('#/torah/parsha/vezot-haberacha/5-34-1')
})

test('semantic destinations carry their own explicit selection', () => {
  expect(preserveSemanticParshaRoute(
    '#/torah/parsha/beresheet/1-6-5/aliyah/7',
    '#/torah/parsha/beresheet/1-6-5/aliyah/Maftir'
  )).toBe('#/torah/parsha/beresheet/1-6-5/aliyah/Maftir')
})

test('dated route synchronization retains its dated identity and explicit selection', () => {
  expect(preserveSemanticParshaRoute(
    '#/run/2026-10-04:shacharis,main/5-33-27/aliyah/6',
    '#/run/2026-10-04:shacharis,main/5-34-1/aliyah/6'
  )).toBe('#/run/2026-10-04:shacharis,main/5-34-1/aliyah/6')
})

test('malformed passive suffixes cannot overwrite the active semantic hash', () => {
  const current = '#/torah/parsha/beresheet/1-6-5/aliyah/Maftir'
  expect(preserveSemanticParshaRoute(current, '#/run/id/1-6-6/aliyah/9')).toBe(current)
  expect(preserveSemanticParshaRoute(current, '#/run/id/1-6-6/extra')).toBe(current)
})

test.each([
  '#/torah/parsha/beresheet/1-6-5/aliyah/Maftir',
  '#/run/2026-10-03:shacharis,last-aliyah/1-1-1/aliyah/8',
])('native and universal link extraction preserves %s', (hash) => {
  expect(readingHashFromNativeUrl(`tikkunreader://reader/${hash}`)).toBe(hash)
  expect(readingHashFromNativeUrl(`https://tikkunreader.com/reader/${hash}`)).toBe(hash)
})
