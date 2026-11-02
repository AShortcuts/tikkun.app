import { pendingCueFlags } from '../audio/cue-review.ts'
import { normalizeFirstCueStart } from '../audio/normalize-first-cue.ts'
import type { AudioRecording, CueExportPayload, WordCue } from '../audio/types.ts'
import { loadStoredCueBundle, readCueBundleFile, storeCueBundle, type StoredCueBundle } from './cue-bundle.ts'
import { checkCueImport } from './cue-import.ts'
import { areCueDraftsEquivalent } from './draft-cue-comparison.ts'

/** What the project already has for an aliyah, aligned to its words. */
export type PublishedCues =
  | { kind: 'none' | 'empty' | 'other-audio' | 'unreadable' }
  | { kind: 'cues'; cues: WordCue[] }

export type ProjectComparison =
  | { kind: 'none' | 'empty' | 'other-audio' | 'unreadable' | 'same' }
  | { kind: 'partial'; cueCount: number; tokenCount: number }
  | { kind: 'different'; changedWords: number; totalWords: number; largestShiftSeconds: number }

export type DraftComparison = 'none' | 'matches-project' | 'matches-import' | 'unexported'

export type ChecklistNoteTone = 'warning' | 'info' | 'problem'

export interface CueBundleChecklistRowView {
  audioId: string
  title: string
  checked: boolean
  disabled: boolean
  detail: string
  note: { text: string; tone: ChecklistNoteTone } | null
}

export type CueBundleProgressStatus = 'checking' | 'ready' | 'saved' | 'not-loaded'

export interface CueBundleProgressRowView {
  audioId: string
  title: string
  /** The Reader can open this aliyah and load its draft. */
  openable: boolean
  current: boolean
  status: CueBundleProgressStatus
  pendingFlags: number
}

export type CueBundleView =
  | { mode: 'choosing'; name: string; checking: boolean; loading: boolean; selectedCount: number; rows: CueBundleChecklistRowView[] }
  | { mode: 'progress'; name: string; savedCount: number; rows: CueBundleProgressRowView[] }

const asExported = (cues: readonly Readonly<WordCue>[]) => normalizeFirstCueStart(cues.map((cue) => ({ ...cue })))

/** Compares cues the way Export writes them: first word at 0, review notes ignored. */
export const sameExportedCues = (left: readonly Readonly<WordCue>[], right: readonly Readonly<WordCue>[]) =>
  areCueDraftsEquivalent(asExported(left), asExported(right))

const milliseconds = (seconds: number | undefined) => seconds === undefined ? undefined : Math.round(seconds * 1000)

export function compareWithProject(incoming: readonly WordCue[], published: PublishedCues, tokenCount: number): ProjectComparison {
  if (published.kind !== 'cues') return { kind: published.kind }
  if (published.cues.length < tokenCount) {
    return { kind: 'partial', cueCount: published.cues.length, tokenCount }
  }
  const next = asExported(incoming)
  const current = asExported(published.cues)
  let changedWords = 0
  let largestShiftSeconds = 0
  next.forEach((cue, index) => {
    const before = current[index]
    if (!before) return
    const startShift = Math.abs(milliseconds(cue.timeStart)! - milliseconds(before.timeStart)!)
    if (startShift || milliseconds(cue.timeEnd) !== milliseconds(before.timeEnd)) changedWords += 1
    largestShiftSeconds = Math.max(largestShiftSeconds, startShift / 1000)
  })
  return changedWords
    ? { kind: 'different', changedWords, totalWords: next.length, largestShiftSeconds }
    : { kind: 'same' }
}

export function compareDraft(draft: readonly WordCue[] | null, published: PublishedCues, incoming: readonly WordCue[]): DraftComparison {
  if (!draft?.length) return 'none'
  if (sameExportedCues(draft, incoming)) return 'matches-import'
  if (published.kind === 'cues' && sameExportedCues(draft, published.cues)) return 'matches-project'
  return 'unexported'
}

/** Pre-check aliyot without usable cues, unless that would replace unexported work. */
export function defaultChecked(project: ProjectComparison, draft: DraftComparison) {
  if (draft === 'unexported') return false
  if (draft === 'matches-import') return true
  return project.kind === 'none' || project.kind === 'empty' || project.kind === 'other-audio' || project.kind === 'unreadable'
}


export function describeProject(project: ProjectComparison) {
  switch (project.kind) {
    case 'none': return 'No cues yet'
    case 'empty': return 'Cue file is empty'
    case 'other-audio': return 'Has cues for different audio'
    case 'unreadable': return 'Current cue file can’t be read'
    case 'same': return 'Has cues · same timings'
    case 'partial': return `Has cues for ${project.cueCount} of ${project.tokenCount} words`
    case 'different':
      return `Has cues · ${project.changedWords} of ${project.totalWords} words differ, up to ${project.largestShiftSeconds.toFixed(2)} s`
  }
}

export function describeDraft(draft: DraftComparison): CueBundleChecklistRowView['note'] {
  if (draft === 'unexported') return { text: 'Unexported draft here will be replaced', tone: 'warning' }
  if (draft === 'matches-import') return { text: 'Already loaded as a draft', tone: 'info' }
  return null
}

type RowState = {
  audioId: string
  title: string
  payload: CueExportPayload
  checked: boolean
  checking: boolean
  problem: string | null
  detail: string
  note: CueBundleChecklistRowView['note']
  recording: AudioRecording | null
  tokenKeys: readonly string[] | null
  cues: WordCue[] | null
  publishedCues: WordCue[]
}

type ProgressRow = { audioId: string; status: CueBundleProgressStatus; pendingFlags: number }

export interface CueBundleReviewDeps {
  storage: Storage | null
  recordings(): readonly AudioRecording[]
  tokenKeys(recording: AudioRecording): Promise<readonly string[]>
  published(recording: AudioRecording, tokenKeys: readonly string[]): Promise<PublishedCues>
  /** Saved draft cues, null when there is none, or 'unavailable' when storage cannot be read. */
  readDraft(recording: AudioRecording, tokenKeys: readonly string[]): WordCue[] | null | 'unavailable'
  /** Loads into the open aliyah's editor; returns false when it is not the open aliyah. */
  loadIntoOpenAliyah(recording: AudioRecording, cues: WordCue[]): Promise<boolean>
  writeDraft(recording: AudioRecording, tokenKeys: readonly string[], cues: WordCue[], publishedCues: WordCue[]): Promise<void>
  draftsChanged(): void
  canOpen(recording: AudioRecording): boolean
  titleFor(payload: CueExportPayload): string
  notify(message: string): void
  changed(): void
}

export function createCueBundleReview(deps: CueBundleReviewDeps) {
  let progress: StoredCueBundle | null = null
  let progressRows = new Map<string, ProgressRow>()
  let choosing: { name: string; rows: RowState[]; loading: boolean } | null = null
  let refreshGeneration = 0
  const confirmedSaves = new Map<string, WordCue[]>()
  const tokenKeysByAudioId = new Map<string, Promise<readonly string[]>>()

  const recordingsById = () => new Map(deps.recordings().map((recording) => [recording.id, recording]))
  const tokenKeysFor = (recording: AudioRecording) => {
    let keys = tokenKeysByAudioId.get(recording.id)
    if (!keys) {
      keys = deps.tokenKeys(recording)
      tokenKeysByAudioId.set(recording.id, keys)
      keys.catch(() => tokenKeysByAudioId.delete(recording.id))
    }
    return keys
  }

  const saveProgress = (next: StoredCueBundle | null) => {
    progress = next
    if (!deps.storage) return
    try {
      storeCueBundle(deps.storage, next)
    } catch (error) {
      console.error('Failed to keep the list of ZIP aliyot', error)
      deps.notify('The list of ZIP aliyot could not be kept in this browser. It stays until the page reloads.')
    }
  }

  if (deps.storage) {
    try {
      progress = loadStoredCueBundle(deps.storage)
    } catch (error) {
      console.error('Failed to restore the list of ZIP aliyot', error)
      storeCueBundle(deps.storage, null)
      deps.notify(error instanceof Error ? error.message : 'The list of ZIP aliyot could not be restored.')
    }
  }

  async function checkRow(row: RowState, recording: AudioRecording | undefined) {
    try {
      if (!recording) {
        row.problem = 'This recording isn’t in the project yet'
        return
      }
      row.recording = recording
      const tokenKeys = await tokenKeysFor(recording)
      const check = checkCueImport(row.payload, recording, tokenKeys)
      if (check.status !== 'ok') {
        row.problem = check.status === 'other-audio'
          ? 'Made for different audio than this recording'
          : check.status === 'other-text' ? 'Words don’t match this aliyah’s text' : 'Not a valid cue file'
        return
      }
      if (check.audioIdentityMissing) {
        row.problem = 'No audio fingerprint. Import this file on its aliyah.'
        return
      }
      const published = await deps.published(recording, tokenKeys)
      const draftCues = deps.readDraft(recording, tokenKeys)
      if (draftCues === 'unavailable') {
        row.problem = 'Browser storage is unavailable'
        return
      }
      const project = compareWithProject(check.cues, published, tokenKeys.length)
      const draft = compareDraft(draftCues, published, check.cues)
      Object.assign(row, {
        tokenKeys,
        cues: check.cues,
        publishedCues: published.kind === 'cues' ? published.cues : [],
        detail: describeProject(project),
        note: describeDraft(draft),
        checked: defaultChecked(project, draft),
      })
    } catch (error) {
      console.error(`Could not check ${row.audioId} from the cue ZIP`, error)
      row.problem = 'Couldn’t check this aliyah'
    } finally {
      row.checking = false
    }
  }

  async function open(file: File) {
    const bundle = await readCueBundleFile(file)
    const recordings = recordingsById()
    const rows: RowState[] = bundle.entries.map(({ payload }) => ({
      audioId: payload.audioId,
      title: deps.titleFor(payload),
      payload,
      checked: false,
      checking: true,
      problem: null,
      detail: 'Checking…',
      note: null,
      recording: null,
      tokenKeys: null,
      cues: null,
      publishedCues: [],
    }))
    const current = { name: bundle.name, rows, loading: false }
    choosing = current
    deps.changed()
    await Promise.all(rows.map((row) => checkRow(row, recordings.get(row.audioId))))
    if (choosing === current) deps.changed()
  }

  function toggle(audioId: string, checked: boolean) {
    const row = choosing?.rows.find((candidate) => candidate.audioId === audioId)
    if (!row || row.checking || row.problem || choosing?.loading) return
    row.checked = checked
    deps.changed()
  }

  function cancel() {
    if (!choosing || choosing.loading) return
    choosing = null
    deps.changed()
  }

  async function load() {
    const current = choosing
    if (!current || current.loading || current.rows.some((row) => row.checking)) return
    const selected = current.rows.filter((row) => row.checked && !row.problem && row.recording && row.tokenKeys && row.cues)
    if (!selected.length) return
    current.loading = true
    deps.changed()
    let loaded = 0
    let failure: string | null = null
    try {
      for (const row of selected) {
        const recording = row.recording!
        try {
          if (!await deps.loadIntoOpenAliyah(recording, row.cues!)) {
            await deps.writeDraft(recording, row.tokenKeys!, row.cues!, row.publishedCues)
          }
          loaded += 1
        } catch (error) {
          console.error(`Failed to load ${row.audioId} from the cue ZIP as a draft`, error)
          failure = `${row.title} could not be saved as a draft${isQuotaError(error) ? ' because browser storage is full' : ''}.`
          break
        }
      }
    } finally {
      if (loaded) deps.draftsChanged()
      choosing = null
      saveProgress({ version: 2, name: current.name, audioIds: selected.map((row) => row.audioId) })
      progressRows = new Map()
      deps.notify(failure
        ? `Loaded ${loaded} of ${selected.length} aliyot as drafts. ${failure} The rest weren’t loaded.`
        : `Loaded ${selected.length === 1 ? '1 aliyah' : `${selected.length} aliyot`} as drafts to review.`)
      deps.changed()
    }
    await refresh()
  }

  function close() {
    saveProgress(null)
    progressRows = new Map()
    deps.changed()
  }

  /** Recomputes each aliyah's state from its draft and the project's cue file. */
  async function refresh() {
    const bundle = progress
    if (!bundle) return
    const generation = ++refreshGeneration
    const recordings = recordingsById()
    const rows = await Promise.all(bundle.audioIds.map(async (audioId): Promise<ProgressRow> => {
      const recording = recordings.get(audioId)
      if (!recording) return { audioId, status: 'not-loaded', pendingFlags: 0 }
      try {
        const tokenKeys = await tokenKeysFor(recording)
        const draft = deps.readDraft(recording, tokenKeys)
        if (draft === 'unavailable' || !draft?.length) return { audioId, status: 'not-loaded', pendingFlags: 0 }
        const published = await deps.published(recording, tokenKeys)
        const confirmed = confirmedSaves.get(audioId)
        const saved = (published.kind === 'cues' && sameExportedCues(draft, published.cues)) ||
          Boolean(confirmed && sameExportedCues(draft, confirmed))
        const pendingFlags = draft.reduce((sum, cue) => sum + pendingCueFlags(cue).length, 0)
        return { audioId, status: saved ? 'saved' : 'ready', pendingFlags: saved ? 0 : pendingFlags }
      } catch (error) {
        console.error(`Could not check the progress of ${audioId}`, error)
        return { audioId, status: 'not-loaded', pendingFlags: 0 }
      }
    }))
    if (generation !== refreshGeneration || progress !== bundle) return
    progressRows = new Map(rows.map((row) => [row.audioId, row]))
    deps.changed()
  }

  /** Export saved these cues to the project; the page may reload before the file is re-read. */
  function recordSave(audioId: string, cues: readonly WordCue[]) {
    if (!progress?.audioIds.includes(audioId)) return
    confirmedSaves.set(audioId, cues.map((cue) => ({ ...cue })))
    void refresh()
  }

  function view(currentAudioId: string | undefined): CueBundleView | null {
    if (choosing) {
      const rows = choosing.rows.map((row): CueBundleChecklistRowView => ({
        audioId: row.audioId,
        title: row.title,
        checked: row.checked && !row.problem,
        disabled: row.checking || Boolean(row.problem) || choosing!.loading,
        detail: row.checking ? 'Checking…' : row.problem ? 'Can’t load' : row.detail,
        note: row.problem ? { text: row.problem, tone: 'problem' } : row.note,
      }))
      return {
        mode: 'choosing',
        name: choosing.name,
        checking: choosing.rows.some((row) => row.checking),
        loading: choosing.loading,
        selectedCount: rows.filter((row) => row.checked).length,
        rows,
      }
    }
    if (!progress) return null
    const recordings = recordingsById()
    const rows = progress.audioIds.map((audioId): CueBundleProgressRowView => {
      const recording = recordings.get(audioId)
      const state = progressRows.get(audioId)
      return {
        audioId,
        title: recording?.title ?? audioId,
        openable: Boolean(recording && deps.canOpen(recording)),
        current: audioId === currentAudioId,
        status: state?.status ?? 'checking',
        pendingFlags: state?.pendingFlags ?? 0,
      }
    })
    return { mode: 'progress', name: progress.name, savedCount: rows.filter((row) => row.status === 'saved').length, rows }
  }

  return {
    open, toggle, cancel, load, close, refresh, recordSave, view,
    hasProgress: () => Boolean(progress),
    isChoosing: () => Boolean(choosing),
  }
}

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  if ('name' in error && error.name === 'QuotaExceededError') return true
  return 'cause' in error && isQuotaError(error.cause)
}

export type CueBundleReview = ReturnType<typeof createCueBundleReview>
