import { HDate } from '@hebcal/hdate'
import { LeiningGenerator } from '../../../../app/calendar-model/generator.ts'

export function sampleAliyot() {
  const generator = new LeiningGenerator({ israel: false, includeModernHolidays: false, ashkenazi: true })
  const run = generator.forEntireChumash(new HDate()).flatMap(date => date.leinings)
    .filter(leining => leining.isParsha).flatMap(leining => leining.runs)
    .find(run => run.scroll === 'torah' && run.aliyot[0]?.start.b === 1 && run.aliyot[0].start.c === 1 && run.aliyot[0].start.v === 1)
  if (!run) throw new Error('The sample Beresheet reading could not be loaded.')
  return run.aliyot.filter(aliyah => typeof aliyah.index === 'number')
}

