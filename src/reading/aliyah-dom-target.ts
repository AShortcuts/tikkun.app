import type {
  LeiningAliyah,
  LeiningRun,
} from '../calendar-model/model-types.ts'
import type { RefWithScroll } from '../ref.ts'

export type PlaybackAliyahIndex = Exclude<LeiningAliyah['index'], undefined>

export interface AliyahPhysicalLocation {
  pageNumber: number
  lineNumber: number
}

export interface AliyahLocationResolver {
  physicalLocationFromRef(ref: RefWithScroll): AliyahPhysicalLocation
}

export interface AliyahLocationViewModel {
  resolver: Promise<AliyahLocationResolver>
}

export function findAliyahInRun(
  run: LeiningRun | null | undefined,
  aliyahIndex: PlaybackAliyahIndex
) {
  return run?.aliyot.find((aliyah) => aliyah.index === aliyahIndex) ?? null
}

export function getAliyahStartLocation(
  run: LeiningRun | null | undefined,
  aliyahIndex: PlaybackAliyahIndex,
  resolveLocation: (ref: RefWithScroll) => AliyahPhysicalLocation
) {
  const aliyah = findAliyahInRun(run, aliyahIndex)
  return aliyah ? resolveLocation(aliyah.start) : null
}

export async function getAliyahStartLocationFromViewModel(
  viewModel: AliyahLocationViewModel,
  run: LeiningRun | null | undefined,
  aliyahIndex: PlaybackAliyahIndex
) {
  const resolver = await viewModel.resolver
  return getAliyahStartLocation(run, aliyahIndex, (ref) =>
    resolver.physicalLocationFromRef(ref)
  )
}

export class AliyahTargetLocationCache {
  private readonly locations = new Map<string, AliyahPhysicalLocation | null>()

  clear() {
    this.locations.clear()
  }

  async get(
    viewModel: AliyahLocationViewModel,
    run: LeiningRun | null | undefined,
    aliyahIndex: PlaybackAliyahIndex
  ) {
    const key = run ? `${run.id}:${aliyahIndex}` : `missing:${aliyahIndex}`
    if (this.locations.has(key)) return this.locations.get(key) ?? null

    const location = await getAliyahStartLocationFromViewModel(
      viewModel,
      run,
      aliyahIndex
    )
    this.locations.set(key, location)
    return location
  }
}

export function lineIndexFromLocation(location: Pick<AliyahPhysicalLocation, 'lineNumber'>) {
  return Math.max(0, location.lineNumber - 1)
}
