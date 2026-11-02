import { expect, test } from 'vitest'
import { isReaderHash, preserveSemanticParshaRoute } from './reader-hash.ts'

test.each(['#/run/2026-10-17:shacharis,main', '#/torah/parsha/beresheet/1-6-5/aliyah/Maftir', '#/torah/page/1'])('accepts reader hash %s', (hash) => {
  expect(isReaderHash(hash)).toBe(true)
})

test.each(['#/torah/not-a-route', '#/torah/parsha/beresheet/1-1-1/aliyah/0'])('rejects malformed reader hash %s', (hash) => {
  expect(isReaderHash(hash)).toBe(false)
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

test.each(['/aliyah/7'])(
  'passive run references preserve an explicit canonical target with source suffix %s', (suffix) => {
    expect(preserveSemanticParshaRoute(
      '#/torah/parsha/beresheet/1-6-5/aliyah/Maftir',
      `#/run/2024-10-26:shacharis,main/1-6-6${suffix}`
    )).toBe('#/torah/parsha/beresheet/1-6-6/aliyah/Maftir')
  }
)

test('malformed passive suffixes cannot overwrite the active semantic hash', () => {
  const current = '#/torah/parsha/beresheet/1-6-5/aliyah/Maftir'
  expect(preserveSemanticParshaRoute(current, '#/run/id/1-6-6/aliyah/9')).toBe(current)
  expect(preserveSemanticParshaRoute(current, '#/run/id/1-6-6/extra')).toBe(current)
})
