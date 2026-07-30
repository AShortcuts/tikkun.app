import { isValidTokenKey } from '../reader/token-position.ts'
import {
  quarantineStorageItem,
  readStorageItem,
  writeStorageItem,
} from '../persistence/persisted-state.ts'

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
  const issue = {
    ...input,
    id: `issue:${input.audioId}:${input.tokenKey}:${input.createdAt}`,
  }
  if (!parseRecordingIssue(issue, input.audioId, input.tokenizationVersion)) {
    throw new TypeError('Cannot create an invalid recording issue')
  }
  return issue
}

export function recordingIssueReaderLabel(issue: Pick<RecordingIssue, 'kind'>) {
  return issueLabels[issue.kind]
}

export function getReaderVisibleIssues(issues: RecordingIssue[]) {
  return issues.filter((issue) => issue.visibility === 'readerVisible')
}

export function parseRecordingIssue(
  value: unknown,
  audioId: string,
  tokenizationVersion: string
): RecordingIssue | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<RecordingIssue>
  const isValid = (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    candidate.audioId === audioId &&
    candidate.audioId.length > 0 &&
    typeof candidate.tokenKey === 'string' &&
    isValidTokenKey(candidate.tokenKey) &&
    recordingIssueKinds.includes(candidate.kind as RecordingIssueKind) &&
    ['authoringOnly', 'readerVisible', 'alignmentHint'].includes(candidate.visibility ?? '') &&
    ['low', 'medium', 'high'].includes(candidate.severity ?? '') &&
    typeof candidate.createdAt === 'number' &&
    Number.isSafeInteger(candidate.createdAt) &&
    candidate.createdAt >= 0 &&
    (candidate.note === undefined || typeof candidate.note === 'string') &&
    isOptionalNonNegativeTime(candidate.timeStart) &&
    isOptionalNonNegativeTime(candidate.timeEnd) &&
    (candidate.timeEnd === undefined || candidate.timeStart !== undefined) &&
    (candidate.timeStart === undefined ||
      candidate.timeEnd === undefined ||
      candidate.timeEnd >= candidate.timeStart) &&
    candidate.tokenizationVersion === tokenizationVersion &&
    candidate.tokenizationVersion.length > 0
  )
  return isValid ? (candidate as RecordingIssue) : null
}

function isOptionalNonNegativeTime(value: unknown) {
  return (
    value === undefined ||
    (typeof value === 'number' && Number.isFinite(value) && value >= 0)
  )
}

export function parseRecordingIssues(
  issues: unknown,
  audioId: string,
  tokenizationVersion: string
): RecordingIssue[] | null {
  if (!Array.isArray(issues)) return null
  const parsed: RecordingIssue[] = []
  const issueIds = new Set<string>()
  for (const value of issues) {
    const issue = parseRecordingIssue(value, audioId, tokenizationVersion)
    if (!issue || issueIds.has(issue.id)) return null
    issueIds.add(issue.id)
    parsed.push(issue)
  }
  return parsed.sort((a, b) => a.createdAt - b.createdAt)
}

export function filterRecordingIssues(
  issues: unknown,
  audioId: string,
  tokenizationVersion: string
) {
  if (!Array.isArray(issues)) return []
  return issues
    .map((issue) => parseRecordingIssue(issue, audioId, tokenizationVersion))
    .filter((issue): issue is RecordingIssue => issue !== null)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function loadRecordingIssues(
  storage: Storage | null,
  audioId: string,
  tokenizationVersion: string
) {
  if (!storage) return []
  const key = storageKey(audioId)
  let raw: string | null = null
  try {
    raw = readStorageItem(storage, key)
  } catch (error) {
    console.error(`Failed to read recording issues for ${audioId}`, error)
    return []
  }
  if (!raw) return []

  try {
    const storedIssues = JSON.parse(raw) as unknown
    const parsed = parseRecordingIssues(
      storedIssues,
      audioId,
      tokenizationVersion
    )
    if (parsed) return parsed

    const repairedIssues = filterRecordingIssues(
      storedIssues,
      audioId,
      tokenizationVersion
    )
    const uniqueIssues = [...new Map(
      repairedIssues.map((issue) => [issue.id, issue])
    ).values()]
    console.warn(`Repairing invalid recording issues for ${audioId}`)
    quarantineStorageItem({
      storage,
      key,
      rawValue: raw,
      reason: 'invalid recording issue schema',
      ...(uniqueIssues.length
        ? { replacementValue: JSON.stringify(uniqueIssues) }
        : {}),
    })
    return uniqueIssues
  } catch (error) {
    console.error(`Failed to parse recording issues for ${audioId}`, error)
    quarantineStorageItem({
      storage,
      key,
      rawValue: raw,
      reason: 'invalid JSON',
    })
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
  storage: Storage | null,
  audioId: string,
  issues: RecordingIssue[]
) {
  const issueIds = new Set<string>()
  const isValid = issues.every((issue) => {
    const parsed = parseRecordingIssue(
      issue,
      audioId,
      issue.tokenizationVersion
    )
    if (!parsed || issueIds.has(parsed.id)) return false
    issueIds.add(parsed.id)
    return true
  })
  if (!isValid) {
    throw new TypeError(`Cannot persist invalid recording issues for ${audioId}`)
  }

  if (!storage) throw new RecordingIssueStorageError(audioId)
  try {
    writeStorageItem(storage, storageKey(audioId), JSON.stringify(issues))
  } catch (error) {
    throw new RecordingIssueStorageError(audioId, error)
  }
}

export class RecordingIssueStorageError extends Error {
  readonly cause: unknown

  constructor(audioId: string, cause?: unknown) {
    super(`Failed to save recording issues for ${audioId}`)
    this.name = 'RecordingIssueStorageError'
    this.cause = cause
  }
}
