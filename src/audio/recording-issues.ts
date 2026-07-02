import { isValidTokenKey } from '../reader/checkpoints.ts'

export type RecordingIssueKind =
  | 'repeated-word'
  | 'mistaken-pronunciation'
  | 'hesitation'
  | 'skipped-word'
  | 'long-breath'
  | 'unclear-audio'
  | 'correction-restart'
  | 'other'

export type RecordingIssueVisibility =
  | 'authoringOnly'
  | 'readerVisible'
  | 'alignmentHint'

export type RecordingIssueSeverity = 'low' | 'medium' | 'high'

export interface RecordingIssue {
  id: string
  audioId: string
  tokenKey: string
  timeStart?: number
  timeEnd?: number
  kind: RecordingIssueKind
  visibility: RecordingIssueVisibility
  severity: RecordingIssueSeverity
  note?: string
  createdAt: number
  tokenizationVersion: string
}

export const recordingIssueKinds: RecordingIssueKind[] = [
  'repeated-word',
  'mistaken-pronunciation',
  'hesitation',
  'skipped-word',
  'long-breath',
  'unclear-audio',
  'correction-restart',
  'other',
]

const issueLabels: Record<RecordingIssueKind, string> = {
  'repeated-word': 'Recording repeats here',
  'mistaken-pronunciation': 'Pronunciation differs here',
  hesitation: 'Recording hesitates here',
  'skipped-word': 'Recording skips here',
  'long-breath': 'Long breath here',
  'unclear-audio': 'Audio is unclear here',
  'correction-restart': 'Recording restarts here',
  other: 'Recording note here',
}

function storageKey(audioId: string) {
  return `tikkun.recording-issues.v1:${audioId}`
}

export function createRecordingIssue(
  input: Omit<RecordingIssue, 'id'>
): RecordingIssue {
  return {
    ...input,
    id: `issue:${input.audioId}:${input.tokenKey}:${input.createdAt}`,
  }
}

export function recordingIssueReaderLabel(issue: Pick<RecordingIssue, 'kind'>) {
  return issueLabels[issue.kind]
}

export function getReaderVisibleIssues(issues: RecordingIssue[]) {
  return issues.filter((issue) => issue.visibility === 'readerVisible')
}

function isRecordingIssue(value: unknown, audioId: string, tokenizationVersion: string): value is RecordingIssue {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RecordingIssue>
  return (
    typeof candidate.id === 'string' &&
    candidate.audioId === audioId &&
    typeof candidate.tokenKey === 'string' &&
    isValidTokenKey(candidate.tokenKey) &&
    recordingIssueKinds.includes(candidate.kind as RecordingIssueKind) &&
    ['authoringOnly', 'readerVisible', 'alignmentHint'].includes(candidate.visibility ?? '') &&
    ['low', 'medium', 'high'].includes(candidate.severity ?? '') &&
    typeof candidate.createdAt === 'number' &&
    Number.isFinite(candidate.createdAt) &&
    candidate.tokenizationVersion === tokenizationVersion
  )
}

export function filterRecordingIssues(
  issues: unknown,
  audioId: string,
  tokenizationVersion: string
) {
  if (!Array.isArray(issues)) return []
  return issues
    .filter((issue) => isRecordingIssue(issue, audioId, tokenizationVersion))
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function loadRecordingIssues(
  storage: Storage,
  audioId: string,
  tokenizationVersion: string
) {
  const raw = storage.getItem(storageKey(audioId))
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    return filterRecordingIssues(parsed, audioId, tokenizationVersion)
  } catch {
    storage.removeItem(storageKey(audioId))
    return []
  }
}

export function mergeRecordingIssues(...issueGroups: RecordingIssue[][]) {
  const issuesById = new Map<string, RecordingIssue>()
  for (const issue of issueGroups.flat()) {
    issuesById.set(issue.id, issue)
  }

  return [...issuesById.values()].sort((a, b) => a.createdAt - b.createdAt)
}

export function saveRecordingIssues(
  storage: Storage,
  audioId: string,
  issues: RecordingIssue[]
) {
  storage.setItem(storageKey(audioId), JSON.stringify(issues))
}
