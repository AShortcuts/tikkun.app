import {
  LeiningRunType,
  type LeiningAliyah,
  type LeiningRun,
} from '../calendar-model/model-types.ts'

const railRunTypes = new Set<LeiningRunType>([
  LeiningRunType.Main,
  LeiningRunType.LastAliyah,
  LeiningRunType.Maftir,
])

export type AliyahRailItem = {
  run: LeiningRun
  aliyah: LeiningAliyah
}

export function aliyahRailItemKey({ run, aliyah }: AliyahRailItem) {
  return `${run.id}:${aliyah.index ?? ''}`
}

export function aliyahRailItemsSignature(items: AliyahRailItem[]) {
  return items.map(aliyahRailItemKey).join('|')
}

export function getAliyahRailItemsForRun(currentRun: LeiningRun): AliyahRailItem[] {
  return currentRun.leining.runs
    .filter(
      (run) =>
        run.scroll === currentRun.scroll &&
        railRunTypes.has(run.type)
    )
    .flatMap((run) =>
      run.aliyot
        .filter((aliyah) => Boolean(aliyah.index))
        .map((aliyah) => ({ run, aliyah }))
    )
}
