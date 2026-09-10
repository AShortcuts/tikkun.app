import type { PassageAudioState } from '../passage-audio.ts'
import {
  LeiningRunType,
  type LeiningAliyah,
  type LeiningRun,
} from '../../calendar-model/model-types.ts'
import {
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
  recordingKey: string | null
  audioState?: PassageAudioState
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

export function formatAliyahLabel(aliyahIndex: AliyahIndex) {
  if (aliyahIndex === 'Maftir') return 'מפטיר'
  return ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'ששי', 'שביעי'][
    aliyahIndex - 1
  ]
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

export function aliyahNavigationItemResourceKey(item: AliyahNavigationItem) {
  return `${item.key}:${item.audioKey ?? ''}:${item.recordingKey ?? ''}:${item.audioState ? 'passage' : 'recording'}:${item.audioState?.problem ?? ''}:${item.audioState?.issue ?? ''}:${item.audioState?.canPlay ?? ''}`
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
  getAudio,
}: {
  entries: readonly AliyahNavigationEntry[]
  active: AliyahNavigationTarget | null
  playback: AliyahNavigationPlayback
  signaturePrefix: string
  getAudio: (entry: AliyahNavigationEntry) => Readonly<{
    playbackKey: string | null
    recordingKey: string | null
  audioState?: PassageAudioState
  }>
}): AliyahNavigationSnapshot {
  const items = entries.map((entry): AliyahNavigationItem => {
    const { run, aliyah } = entry
    const target = { runId: run.id, aliyahIndex: aliyah.index }
    const audio = getAudio(entry)
    return {
      key: aliyahNavigationEntryKey(entry),
      target,
      label: formatAliyahLabel(aliyah.index),
      compactLabel: aliyah.index === 'Maftir' ? 'M' : `${aliyah.index}`,
      audioKey: audio.playbackKey,
      recordingKey: audio.recordingKey,
      audioState: audio.audioState,
    }
  })
  const itemSignature = items
    .map(aliyahNavigationItemResourceKey)
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
