import type { RecordingIssue } from '../audio/recording-issues.ts'
import {
  compareTokenPositions,
  isValidTokenKey,
  parseTokenKey,
} from './token-position.ts'

export {
  formatTokenKey,
  isValidTokenKey,
  parseTokenKey,
} from './token-position.ts'

export type CheckpointKind =
  | 'bookmark'
  | 'cue'
  | 'current-word'
  | 'page-start'
  | 'aliyah-start'
  | 'recording-issue'

export type CheckpointSource =
  | 'bookmark'
  | 'playback'
  | 'reader'
  | 'recording-issue'

export interface Checkpoint {
  id: string
  kind: CheckpointKind
  source: CheckpointSource
  label: string
  hash?: string
  audioId?: string
  tokenKey: string
  timeStart?: number
  createdAt?: number
}

export function tokenKeyParts(tokenKey: string) {
  return parseTokenKey(tokenKey)
}

export function checkpointFromCue({
  audioId,
  label,
  tokenKey,
  timeStart,
}: {
  audioId: string
  label: string
  tokenKey: string
  timeStart: number
}): Checkpoint {
  if (!isValidTokenKey(tokenKey)) {
    throw new TypeError(`Invalid checkpoint token key: ${tokenKey}`)
  }
  return {
    id: `cue:${audioId}:${tokenKey}`,
    kind: 'cue',
    source: 'playback',
    label,
    audioId,
    tokenKey,
    timeStart,
  }
}

export function checkpointFromIssue(issue: RecordingIssue): Checkpoint {
  if (!isValidTokenKey(issue.tokenKey)) {
    throw new TypeError(`Invalid recording-issue token key: ${issue.tokenKey}`)
  }
  return {
    id: `issue:${issue.id}`,
    kind: 'recording-issue',
    source: 'recording-issue',
    label: issue.note?.trim() || issue.kind,
    audioId: issue.audioId,
    tokenKey: issue.tokenKey,
    timeStart: issue.timeStart,
    createdAt: issue.createdAt,
  }
}

export function compareCheckpoints(a: Checkpoint, b: Checkpoint) {
  const aParts = tokenKeyParts(a.tokenKey)
  const bParts = tokenKeyParts(b.tokenKey)
  const positionComparison =
    aParts && bParts
      ? compareTokenPositions(aParts, bParts)
      : aParts
        ? -1
        : bParts
          ? 1
          : a.tokenKey.localeCompare(b.tokenKey)
  return positionComparison || (a.timeStart ?? 0) - (b.timeStart ?? 0)
}
