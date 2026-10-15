import type { LeiningRun } from '../calendar-model/model-types.ts'
import { aliyahLabel } from '../calendar-model/aliyah-label.ts'
import { getAliyahNavigationEntriesForRun } from '../reading/aliyah-navigation/model.ts'
import type { PassageRange } from './print-model.ts'

export type PrintContext = {
  title: string
  isParsha: boolean
  currentKey: string
  aliyot: (PassageRange & { key: string; label: string; hebrewLabel: string })[]
}

export function createPrintContext(run: LeiningRun, index: number | 'Maftir' | undefined, title: string): PrintContext {
  if (run.scroll === 'esther') {
    const first = run.aliyot[0]
    const last = run.aliyot.at(-1)
    if (!first || !last || first.start.scroll !== 'esther' || last.end.scroll !== 'esther') throw new Error('The Esther passage is still loading. Try Print again in a moment.')
    const currentKey = `${run.id}:whole`
    return { title, isParsha: false, currentKey, aliyot: [{ key: currentKey, label: 'Whole Megillah', hebrewLabel: '', start: { ...first.start }, end: { ...last.end } }] }
  }
  const aliyot = getAliyahNavigationEntriesForRun(run).map(({ run, aliyah }) => ({
    key: `${run.id}:${aliyah.index}`,
    label: aliyahLabel(aliyah.index, run, 'en'),
    hebrewLabel: aliyahLabel(aliyah.index, run, 'he'),
    start: { ...aliyah.start },
    end: { ...aliyah.end },
  }))
  const currentKey = `${run.id}:${index}`
  if (!aliyot.some(aliyah => aliyah.key === currentKey)) throw new Error('The current aliyah is still loading. Try Print again in a moment.')
  return { title, isParsha: run.leining.kind === 'parsha', currentKey, aliyot }
}
