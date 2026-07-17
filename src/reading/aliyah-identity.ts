import type { LeiningAliyah, LeiningRun } from '../calendar-model/model-types.ts'
import { containsRef } from '../calendar-model/ref-utils.ts'
import type { Ref } from '../ref.ts'

export type AliyahIndex = Exclude<LeiningAliyah['index'], undefined>

export type AliyahIdentity = {
  runId: string
  index: AliyahIndex
}

export function aliyahIdentity(run: LeiningRun, index: AliyahIndex): AliyahIdentity {
  return { runId: run.id, index }
}

export function isSameAliyahIdentity(
  left: AliyahIdentity | null | undefined,
  right: AliyahIdentity | null | undefined
) {
  return Boolean(
    left && right && left.runId === right.runId && left.index === right.index
  )
}

export function parseAliyahIndex(value: string | null | undefined): AliyahIndex | null {
  if (value === 'Maftir') return 'Maftir'
  const index = Number(value)
  return Number.isInteger(index) && index >= 1 && index <= 7 ? index : null
}

export function aliyahMembershipsAtRef(runs: LeiningRun[], ref: Ref) {
  return runs.flatMap((run) =>
    run.aliyot.flatMap((aliyah) =>
      aliyah.index && containsRef(aliyah, ref)
        ? [aliyahIdentity(run, aliyah.index)]
        : []
    )
  )
}

export function resolveActiveAliyahIdentity({
  memberships,
  playback,
  pending,
  explicit,
}: {
  memberships: AliyahIdentity[]
  playback?: AliyahIdentity | null
  pending?: AliyahIdentity | null
  explicit?: AliyahIdentity | null
}) {
  if (playback) return playback
  if (pending) return pending
  if (!memberships.length) return null

  const explicitMatch = memberships.find((membership) =>
    isSameAliyahIdentity(membership, explicit)
  )
  if (explicitMatch) return explicitMatch

  return memberships[memberships.length - 1]
}
