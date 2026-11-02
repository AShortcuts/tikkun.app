import { HDate } from '@hebcal/hdate'
import type { LeiningGenerator } from '../calendar-model/generator.ts'
import { semanticParshaUrlForLeining } from '../view-model/navigation/parsha-routes.ts'
import type { readingTimings } from './schema.ts'

export type ReadingTiming = typeof readingTimings[number]

const DAY = 86_400_000
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
const daysBetween = (from: Date, to: Date) => Math.round((startOfDay(to) - startOfDay(from)) / DAY)

/** Buckets how far ahead a reading is, so reports show preparation without naming the passage. */
export function timingBucket(daysUntilNext: number | null, daysSinceLast: number | null): ReadingTiming {
  if (daysUntilNext !== null && daysUntilNext <= 6) return 'this_week'
  if (daysSinceLast !== null && daysSinceLast <= 7) return 'last_week'
  if (daysUntilNext === null) return 'later'
  if (daysUntilNext <= 13) return 'next_week'
  if (daysUntilNext <= 34) return 'weeks_2_4'
  if (daysUntilNext <= 92) return 'months_1_3'
  return 'later'
}

const cache = new Map<string, ReadingTiming>()

/** Timing for the reader hash that was opened, using the user's Israel or diaspora calendar. */
export function readingTiming(hash: string, generator: LeiningGenerator, today = new Date()): ReadingTiming {
  const key = `${generator.settings.israel}|${new HDate(today).abs()}|${hash}`
  const cached = cache.get(key)
  if (cached) return cached
  let result: ReadingTiming
  try { result = computeTiming(hash, generator, today) } catch { result = 'none' }
  if (cache.size > 200) cache.clear()
  cache.set(key, result)
  return result
}

function computeTiming(hash: string, generator: LeiningGenerator, today: Date): ReadingTiming {
  const run = /^#\/run\/([^/]+)/.exec(hash)
  if (run) {
    const date = generator.parseId(decodeURIComponent(run[1]))?.leining.date.date
    if (!date) return 'none'
    const days = daysBetween(today, date)
    return days >= 0 ? timingBucket(days, null) : timingBucket(null, -days)
  }
  const parsha = /^#\/(?:torah|esther)\/parsha\/[a-z0-9-]+/.exec(hash)?.[0]
  const calendar = /^#\/(?:torah\/)?next(?:$|\/)/.test(hash)
  if (!parsha && !calendar) return 'none'
  let daysSinceLast: number | null = null
  const start = new HDate(today)
  for (let offset = -7; offset <= 400; offset++) {
    const leiningDate = generator.createLeiningDate(start.add(offset, 'day'))
    if (!leiningDate) continue
    const matches = calendar
      ? offset >= 0 && leiningDate.leinings.some(leining => leining.runs.some(r => r.scroll === 'torah'))
      : leiningDate.leinings.some(leining => semanticParshaUrlForLeining(leining) === parsha)
    if (!matches) continue
    const days = daysBetween(today, leiningDate.date)
    if (days < 0) { daysSinceLast = -days; continue }
    return timingBucket(days, daysSinceLast)
  }
  return timingBucket(null, daysSinceLast)
}
