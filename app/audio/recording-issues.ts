import { isValidTokenKey } from '../reader/token-position.ts'
import {
  createPersistedJsonStore,
  PersistedStateConflictError,
  type PersistedJsonRevision,
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
  return `tikkun.recording-issues:${audioId}`
}

function createRecordingIssuesStore(
  storage: Storage | null,
  audioId: string
) {
  return createPersistedJsonStore({
    storage,
    key: storageKey(audioId),
    validate: (value): value is unknown[] => Array.isArray(value),
  })
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

export interface LocalRecordingIssuesSnapshot {
  issues: RecordingIssue[]
  revision: PersistedJsonRevision | null
}

export function loadLocalRecordingIssues(
  storage: Storage | null,
  audioId: string,
  tokenizationVersion: string
): LocalRecordingIssuesSnapshot {
  if (!storage) return { issues: [], revision: null }
  const store = createRecordingIssuesStore(storage, audioId)
  const result = store.read()
  if (result.status === 'unavailable') {
    console.error(`Failed to read recording issues for ${audioId}`, result.error)
    return { issues: [], revision: null }
  }
  if (result.status === 'invalid') {
    if (result.reason === 'invalid-json') {
      console.error(`Failed to parse recording issues for ${audioId}`, result.error)
    } else {
      console.error(`Invalid recording issues for ${audioId}`)
    }
    return { issues: [], revision: result.revision }
  }
  if (result.status === 'missing') {
    return { issues: [], revision: result.revision }
  }
  const parsed = parseRecordingIssues(
    result.value,
    audioId,
    tokenizationVersion
  )
  if (parsed) return { issues: parsed, revision: result.revision }

  const validIssues = filterRecordingIssues(
    result.value,
    audioId,
    tokenizationVersion
  )
  const uniqueIssues = [...new Map(
    validIssues.map((issue) => [issue.id, issue])
  ).values()]
  console.warn(`Ignoring invalid recording issues for ${audioId}`)
  return { issues: uniqueIssues, revision: result.revision }
}

function recordingIssueOverlayKey(issue: RecordingIssue) {
  return `${issue.audioId}\u0000${issue.tokenKey}\u0000${issue.kind}`
}

export function mergePublishedAndLocalRecordingIssues(
  publishedIssues: readonly RecordingIssue[],
  localIssues: readonly RecordingIssue[]
) {
  const issuesByOverlayKey = new Map<string, RecordingIssue>()
  for (const issue of publishedIssues) {
    issuesByOverlayKey.set(recordingIssueOverlayKey(issue), issue)
  }
  for (const issue of localIssues) {
    issuesByOverlayKey.set(recordingIssueOverlayKey(issue), issue)
  }

  return [...issuesByOverlayKey.values()].sort(
    (a, b) => a.createdAt - b.createdAt
  )
}

export function saveLocalRecordingIssues(
  storage: Storage | null,
  audioId: string,
  tokenizationVersion: string,
  issues: RecordingIssue[],
  expectedRevision: PersistedJsonRevision | null
) {
  const issueIds = new Set<string>()
  const isValid = issues.every((issue) => {
    const parsed = parseRecordingIssue(
      issue,
      audioId,
      tokenizationVersion
    )
    if (!parsed || issueIds.has(parsed.id)) return false
    issueIds.add(parsed.id)
    return true
  })
  if (!isValid) {
    throw new TypeError(`Cannot persist invalid recording issues for ${audioId}`)
  }

  if (!storage || !expectedRevision) {
    throw new RecordingIssueStorageError(audioId)
  }
  const mutation = createRecordingIssuesStore(storage, audioId).write(
    issues,
    expectedRevision
  )
  if (mutation.status === 'written') return mutation.revision
  if (mutation.status === 'conflict') {
    throw new RecordingIssueConflictError(
      audioId,
      loadLocalRecordingIssues(storage, audioId, tokenizationVersion)
    )
  }
  throw new RecordingIssueStorageError(audioId, mutation.error)
}

export class RecordingIssueStorageError extends Error {
  readonly cause: unknown

  constructor(audioId: string, cause?: unknown) {
    super(`Failed to save recording issues for ${audioId}`)
    this.name = 'RecordingIssueStorageError'
    this.cause = cause
  }
}

export class RecordingIssueConflictError extends RecordingIssueStorageError {
  constructor(
    audioId: string,
    readonly latest: LocalRecordingIssuesSnapshot
  ) {
    super(audioId, new PersistedStateConflictError())
    this.name = 'RecordingIssueConflictError'
  }
}
