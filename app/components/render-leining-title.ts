import { Locale } from '@hebcal/hdate'
import {
  LeiningInstanceId,
} from '../calendar-model/model-types.ts'
import type { LeiningInstance } from '../calendar-model/model-types.ts'
import { toTitleCase } from '../calendar-model/hebcal-conversions.ts'

function stripHebrewDayPrefix(title: string) {
  return title.replace(/יום (?=[א-ת][׳״"])/g, '')
}

export default function renderLeiningTitle(
  obj: LeiningInstance,
  opts?: { forCalendar?: boolean }
) {
  if (obj.id === LeiningInstanceId.Megillah)
    return Locale.gettext(toTitleCase(obj.runs[0].scroll), 'he-x-nonikud')

  let title = stripHebrewDayPrefix(obj.date.title.he.replace('פרשת ', ''))
  if (obj.id !== LeiningInstanceId.Shacharis) title += `: ${obj.id}`

  if (!opts?.forCalendar && title.startsWith('ראש חודש')) return 'ראש חודש'

  return title
}
