import type { LeiningAliyah, LeiningRun } from '../calendar-model/model-types.ts'

export type IndexedAliyah = Exclude<LeiningAliyah['index'], undefined>

export function isLastIndexedAliyahInRun(
  run: LeiningRun | undefined,
  aliyahIndex: IndexedAliyah
) {
  const indexedAliyot = run?.aliyot.filter((aliyah) => aliyah.index) ?? []
  return indexedAliyot[indexedAliyot.length - 1]?.index === aliyahIndex
}
