import { Locale } from '@hebcal/hdate'
import {
  LeiningInstanceId,
  readingTitle,
} from '../calendar-model/model-types.ts'
import type { ReadingInstance } from '../calendar-model/model-types.ts'
import { toTitleCase } from '../calendar-model/hebcal-conversions.ts'

function stripHebrewDayPrefix(title: string) {
  return title.replace(/יום (?=[א-ת][׳״"])/g, '')
}

export default function renderLeiningTitle(
  obj: ReadingInstance,
  opts?: { forCalendar?: boolean }
) {
  if (obj.id === LeiningInstanceId.Megillah)
    return Locale.gettext(toTitleCase(obj.runs[0].scroll), 'he-x-nonikud')

  let title = stripHebrewDayPrefix(readingTitle(obj).he.replace('פרשת ', ''))
  if (obj.id !== LeiningInstanceId.Shacharis) title += `: ${obj.id}`

  if (!opts?.forCalendar && title.startsWith('ראש חודש')) return 'ראש חודש'

  return title
}
