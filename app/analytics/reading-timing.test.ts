import { expect, test } from 'vitest'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import { readingTiming } from './reading-timing.ts'

const diaspora = new LeiningGenerator({ israel: false } as ConstructorParameters<typeof LeiningGenerator>[0])
// Thursday, October 29, 2026: Lech Lecha was read Oct 24, Vayera is Oct 31, Chayei Sarah Nov 7, Toldot Nov 14.
const today = new Date(2026, 9, 29, 12)

test.each([['#/torah/parsha/vayera', 'this_week'], ['#/torah/parsha/chayei-sarah', 'next_week'], ['#/torah/parsha/noach', 'later'], ['#/torah/5-33-24', 'none']])('%s opened on Oct 29, 2026 is %s', (hash, expected) => {
  expect(readingTiming(hash, diaspora, today)).toBe(expected)
})
