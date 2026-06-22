import type { RecordingIssue } from '../audio/recording-issues.ts'

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
  const [pageNumber, lineIndex, fragmentIndex, wordIndex] = tokenKey
    .split(':')
    .map(Number)
  return {
    pageNumber,
    lineIndex,
    fragmentIndex,
    wordIndex,
  }
}

export function isValidTokenKey(tokenKey: string) {
  const parts = tokenKey.split(':')
  return parts.length === 4 && parts.every((part) => Number.isInteger(Number(part)))
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
  return (
    aParts.pageNumber - bParts.pageNumber ||
    aParts.lineIndex - bParts.lineIndex ||
    aParts.fragmentIndex - bParts.fragmentIndex ||
    aParts.wordIndex - bParts.wordIndex ||
    (a.timeStart ?? 0) - (b.timeStart ?? 0)
  )
}
