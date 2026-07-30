import {
  LeiningRunType,
  type LeiningAliyah,
  type LeiningRun,
} from '../../calendar-model/model-types.ts'
import {
  parseAliyahIndex,
  type AliyahIndex,
} from '../aliyah-identity.ts'

const navigationRunTypes = new Set<LeiningRunType>([
  LeiningRunType.Main,
  LeiningRunType.LastAliyah,
  LeiningRunType.Maftir,
])

export type AliyahNavigationTarget = Readonly<{
  runId: string
  aliyahIndex: AliyahIndex
}>

export type AliyahNavigationEntry = Readonly<{
  run: LeiningRun
  aliyah: LeiningAliyah & { index: AliyahIndex }
}>

export type AliyahNavigationItem = Readonly<{
  key: string
  target: AliyahNavigationTarget
  label: string
  compactLabel: string
  audioKey: string | null
}>

export type AliyahNavigationPlayback = Readonly<{
  target: AliyahNavigationTarget | null
  playing: boolean
  progressLabel: string
}>

export type AliyahNavigationSnapshot = Readonly<{
  signature: string
  items: readonly AliyahNavigationItem[]
  active: AliyahNavigationTarget | null
  playback: AliyahNavigationPlayback
}>

export interface AliyahNavigationAdapter {
  render(snapshot: AliyahNavigationSnapshot): void
  clear(): void
  invalidate(): void
  setActive(target: AliyahNavigationTarget | null): void
}

export function formatAliyahLabel(aliyahIndex: AliyahIndex) {
  if (aliyahIndex === 'Maftir') return 'מפטיר'
  return ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'ששי', 'שביעי'][
    aliyahIndex - 1
  ]
}

export function parseAliyahNavigationTarget(
  runId: string | null | undefined,
  aliyahIndex: string | null | undefined
): AliyahNavigationTarget | null {
  const parsedIndex = parseAliyahIndex(aliyahIndex)
  return runId && parsedIndex
    ? { runId, aliyahIndex: parsedIndex }
    : null
}

export function isSameAliyahNavigationTarget(
  left: AliyahNavigationTarget | null | undefined,
  right: AliyahNavigationTarget | null | undefined
) {
  return Boolean(
    left &&
      right &&
      left.runId === right.runId &&
      left.aliyahIndex === right.aliyahIndex
  )
}

export function aliyahNavigationEntryKey({
  run,
  aliyah,
}: AliyahNavigationEntry) {
  return `${run.id}:${aliyah.index}`
}

export function getAliyahNavigationEntriesForRun(
  currentRun: LeiningRun
): AliyahNavigationEntry[] {
  return currentRun.leining.runs
    .filter(
      (run) =>
        run.scroll === currentRun.scroll &&
        navigationRunTypes.has(run.type)
    )
    .flatMap((run) =>
      run.aliyot.flatMap((aliyah) =>
        aliyah.index ? [{ run, aliyah: { ...aliyah, index: aliyah.index } }] : []
      )
    )
}

export function createAliyahNavigationSnapshot({
  entries,
  active,
  playback,
  signaturePrefix,
  getAudioKey,
}: {
  entries: readonly AliyahNavigationEntry[]
  active: AliyahNavigationTarget | null
  playback: AliyahNavigationPlayback
  signaturePrefix: string
  getAudioKey: (entry: AliyahNavigationEntry) => string | null
}): AliyahNavigationSnapshot {
  const items = entries.map((entry): AliyahNavigationItem => {
    const { run, aliyah } = entry
    const target = { runId: run.id, aliyahIndex: aliyah.index }
    return {
      key: aliyahNavigationEntryKey(entry),
      target,
      label: formatAliyahLabel(aliyah.index),
      compactLabel: aliyah.index === 'Maftir' ? 'M' : `${aliyah.index}`,
      audioKey: getAudioKey(entry),
    }
  })
  const itemSignature = items
    .map((item) => `${item.key}:${item.audioKey ?? ''}`)
    .join('|')

  return {
    signature: `${signaturePrefix}:${itemSignature}`,
    items,
    active,
    playback,
  }
}

export function resolveActiveTargetForRun({
  runId,
  current,
  playback,
  first,
}: {
  runId: string
  current: AliyahNavigationTarget | null
  playback: AliyahNavigationPlayback
  first: AliyahNavigationTarget | null
}) {
  if (playback.playing && playback.target?.runId === runId) {
    return playback.target
  }
  if (current?.runId === runId) return current
  return first
}
