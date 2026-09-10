import {
  isPublishableCueSequence,
  parseDraftWordCues,
} from '../audio/cue-validation.ts'
import type { WordCue } from '../audio/types.ts'
import { cloneCueReview } from '../audio/cue-review.ts'
import {
  formatTokenKey,
  isValidTokenKey,
  parseTokenKey,
} from '../reader/token-position.ts'
import { areCueDraftsEquivalent } from './draft-cue-comparison.ts'

export type CueDraftOrigin = 'none' | 'published' | 'local'

export type CueDraftSaveProblem =
  | 'conflict'
  | 'storage'
  | 'unknown'

export interface CueDraftEditorSnapshot {
  readonly revision: number
  readonly tokenKeys: readonly string[]
  readonly sourceCues: readonly Readonly<WordCue>[]
  readonly cues: readonly Readonly<WordCue>[]
  readonly tokenPointer: number
  readonly recording: boolean
  readonly origin: CueDraftOrigin
  readonly savedAt: number | null
  readonly saveProblem: CueDraftSaveProblem | null
  readonly dirty: boolean
  readonly complete: boolean
  readonly exportReady: boolean
}

export interface CueDraftEditorBinding {
  tokenKeys: readonly string[]
  sourceCues: readonly Readonly<WordCue>[]
  cues?: readonly Readonly<WordCue>[]
  tokenPointer?: number
  origin: CueDraftOrigin
  savedAt: number | null
}

export interface CueDraftRecordResult {
  readonly cue: Readonly<WordCue>
  readonly index: number
  readonly tokenKey: string
}

export interface CueDraftNudgeResult {
  readonly cue: Readonly<WordCue>
  readonly index: number
}

export interface CueDraftEditor {
  snapshot(): CueDraftEditorSnapshot
  bind(binding: CueDraftEditorBinding): void
  restore(checkpoint: CueDraftEditorSnapshot): void
  clear(): void
  select(index: number): number
  selectedTokenIndex(activeTokenIndex: number): number
  editableCueIndex(activeTokenIndex: number): number
  startRecording(options?: {
    tokenPointer?: number
    activeTokenIndex?: number
  }): void
  stopRecording(): boolean
  startFreshPass(): string | null
  record(options: {
    activeTokenIndex: number
    timeStart: number
  }): CueDraftRecordResult | null
  undo(): string | null
  trim(activeTokenIndex: number): number | null
  nudge(options: {
    activeTokenIndex: number
    deltaSeconds: number
    duration: number
  }): CueDraftNudgeResult | null
  replaceCues(cues: readonly Readonly<WordCue>[]): void
  applyPublishedSource(options: {
    cues: readonly Readonly<WordCue>[]
    savedAt: number | null
    preserveDraft: boolean
  }): void
  markSaved(savedAt: number): void
  markSaveProblem(problem: CueDraftSaveProblem): void
  clearSaveProblem(): void
}

type MutableState = {
  revision: number
  tokenKeys: string[]
  sourceCues: WordCue[]
  cues: WordCue[]
  tokenPointer: number
  recording: boolean
  origin: CueDraftOrigin
  savedAt: number | null
  saveProblem: CueDraftSaveProblem | null
}

const cloneCue = cloneCueReview
const cloneCues = (cues: readonly Readonly<WordCue>[]) => cues.map(cloneCue)
const roundCueTime = (value: number) => Number(value.toFixed(3))

function validateTokenKeys(tokenKeys: readonly string[]) {
  if (
    tokenKeys.some((key) => !isValidTokenKey(key)) ||
    new Set(tokenKeys).size !== tokenKeys.length
  ) {
    throw new TypeError('Cue Draft token keys must be valid and unique')
  }
  return [...tokenKeys]
}

function validateCuePrefix(
  cues: readonly Readonly<WordCue>[],
  tokenKeys: readonly string[]
) {
  const parsed = parseDraftWordCues(cues)
  if (
    !parsed ||
    parsed.length > tokenKeys.length ||
    parsed.some((cue, index) => formatTokenKey(cue) !== tokenKeys[index])
  ) {
    throw new TypeError('Cue Draft cues must match the canonical token prefix')
  }
  return parsed
}

function validateSavedAt(value: number | null) {
  if (
    value !== null &&
    (!Number.isSafeInteger(value) || value < 0)
  ) {
    throw new TypeError('Cue Draft saved time must be a nonnegative integer')
  }
  return value
}

function validateOrigin(value: CueDraftOrigin) {
  if (value !== 'none' && value !== 'published' && value !== 'local') {
    throw new TypeError('Cue Draft origin must be recognized')
  }
  return value
}

function validateSaveProblem(value: CueDraftSaveProblem | null) {
  if (
    value !== null &&
    value !== 'conflict' &&
    value !== 'storage' &&
    value !== 'unknown'
  ) {
    throw new TypeError('Cue Draft save problem must be recognized')
  }
  return value
}

function clampPointer(pointer: number, tokenCount: number) {
  if (!Number.isSafeInteger(pointer)) {
    throw new TypeError('Cue Draft token pointer must be an integer')
  }
  if (!tokenCount) return -1
  return Math.max(-1, Math.min(pointer, tokenCount - 1))
}

function resumePointer(cueCount: number, tokenCount: number) {
  if (!tokenCount) return -1
  return cueCount < tokenCount ? cueCount : tokenCount - 1
}

function freezeCues(cues: readonly Readonly<WordCue>[]) {
  return Object.freeze(cues.map((cue) => {
    const copy = cloneCue(cue)
    if (copy.review) {
      copy.review = Object.freeze({ ...copy.review,
        flags: Object.freeze(copy.review.flags.map(flag => Object.freeze(flag))) })
    }
    return Object.freeze(copy)
  }))
}

function isExportReady(cues: readonly Readonly<WordCue>[]) {
  if (!cues.length) return false
  const parsed = parseDraftWordCues(
    cues.map((cue, index) => ({
      ...cloneCue(cue),
      cueNumber: index + 1,
    }))
  )
  return Boolean(parsed && isPublishableCueSequence(parsed))
}

export function createCueDraftEditor(): CueDraftEditor {
  const state: MutableState = {
    revision: 0,
    tokenKeys: [],
    sourceCues: [],
    cues: [],
    tokenPointer: -1,
    recording: false,
    origin: 'none',
    savedAt: null,
    saveProblem: null,
  }
  let cachedSnapshot: CueDraftEditorSnapshot | null = null

  const changed = () => {
    state.revision += 1
    cachedSnapshot = null
  }

  const snapshot = (): CueDraftEditorSnapshot => {
    if (cachedSnapshot) return cachedSnapshot
    const tokenKeys = Object.freeze([...state.tokenKeys])
    const sourceCues = freezeCues(state.sourceCues)
    const cues = freezeCues(state.cues)
    cachedSnapshot = Object.freeze({
      revision: state.revision,
      tokenKeys,
      sourceCues,
      cues,
      tokenPointer: state.tokenPointer,
      recording: state.recording,
      origin: state.origin,
      savedAt: state.savedAt,
      saveProblem: state.saveProblem,
      dirty:
        cues.length > 0 &&
        !areCueDraftsEquivalent(cues, sourceCues),
      complete: tokenKeys.length > 0 && cues.length === tokenKeys.length,
      exportReady: isExportReady(cues),
    })
    return cachedSnapshot
  }

  const selectedTokenIndex = (activeTokenIndex: number) => {
    if (!state.tokenKeys.length) return -1
    if (state.tokenPointer >= 0) {
      return Math.min(state.tokenPointer, state.tokenKeys.length - 1)
    }
    if (!Number.isSafeInteger(activeTokenIndex) || activeTokenIndex < 0) return -1
    return Math.min(activeTokenIndex, state.tokenKeys.length - 1)
  }

  const editableCueIndex = (activeTokenIndex: number) => {
    if (!state.cues.length) return -1
    const selectedIndex = selectedTokenIndex(activeTokenIndex)
    return selectedIndex >= 0 && selectedIndex < state.cues.length
      ? selectedIndex
      : state.cues.length - 1
  }

  const replaceCues = (cues: readonly Readonly<WordCue>[]) => {
    const nextCues = validateCuePrefix(cues, state.tokenKeys)
    const nextTokenPointer = clampPointer(
      state.tokenPointer,
      state.tokenKeys.length
    )
    state.cues = nextCues
    state.tokenPointer = nextTokenPointer
    changed()
  }

  return {
    snapshot,

    bind({
      tokenKeys,
      sourceCues,
      cues = sourceCues,
      tokenPointer,
      origin,
      savedAt,
    }) {
      const nextTokenKeys = validateTokenKeys(tokenKeys)
      const nextSourceCues = validateCuePrefix(sourceCues, nextTokenKeys)
      const nextCues = validateCuePrefix(cues, nextTokenKeys)
      const nextTokenPointer = clampPointer(
        tokenPointer ?? resumePointer(nextCues.length, nextTokenKeys.length),
        nextTokenKeys.length
      )
      const nextOrigin = validateOrigin(origin)
      const nextSavedAt = validateSavedAt(savedAt)
      state.tokenKeys = nextTokenKeys
      state.sourceCues = nextSourceCues
      state.cues = nextCues
      state.tokenPointer = nextTokenPointer
      state.recording = false
      state.origin = nextOrigin
      state.savedAt = nextSavedAt
      state.saveProblem = null
      changed()
    },

    restore(checkpoint) {
      const nextTokenKeys = validateTokenKeys(checkpoint.tokenKeys)
      const nextSourceCues = validateCuePrefix(
        checkpoint.sourceCues,
        nextTokenKeys
      )
      const nextCues = validateCuePrefix(checkpoint.cues, nextTokenKeys)
      const nextTokenPointer = clampPointer(
        checkpoint.tokenPointer,
        nextTokenKeys.length
      )
      if (typeof checkpoint.recording !== 'boolean') {
        throw new TypeError('Cue Draft recording state must be boolean')
      }
      const nextOrigin = validateOrigin(checkpoint.origin)
      const nextSavedAt = validateSavedAt(checkpoint.savedAt)
      const nextSaveProblem = validateSaveProblem(checkpoint.saveProblem)
      state.tokenKeys = nextTokenKeys
      state.sourceCues = nextSourceCues
      state.cues = nextCues
      state.tokenPointer = nextTokenPointer
      state.recording = checkpoint.recording
      state.origin = nextOrigin
      state.savedAt = nextSavedAt
      state.saveProblem = nextSaveProblem
      changed()
    },

    clear() {
      state.tokenKeys = []
      state.sourceCues = []
      state.cues = []
      state.tokenPointer = -1
      state.recording = false
      state.origin = 'none'
      state.savedAt = null
      state.saveProblem = null
      changed()
    },

    select(index) {
      state.tokenPointer = clampPointer(index, state.tokenKeys.length)
      changed()
      return state.tokenPointer
    },

    selectedTokenIndex,
    editableCueIndex,

    startRecording({ tokenPointer, activeTokenIndex = -1 } = {}) {
      if (!state.tokenKeys.length) return
      let nextTokenPointer = state.tokenPointer
      if (tokenPointer !== undefined) {
        nextTokenPointer = clampPointer(tokenPointer, state.tokenKeys.length)
      } else if (state.tokenPointer < 0) {
        const activeIndex = Math.max(
          Number.isSafeInteger(activeTokenIndex) ? activeTokenIndex : -1,
          0
        )
        nextTokenPointer = Math.min(activeIndex, state.cues.length)
      }
      state.recording = true
      state.tokenPointer = nextTokenPointer
      changed()
    },

    stopRecording() {
      if (!state.recording) return false
      state.recording = false
      changed()
      return true
    },

    startFreshPass() {
      const firstTokenKey = state.tokenKeys[0] ?? null
      state.cues = firstTokenKey
        ? [{ timeStart: 0, ...parseTokenKey(firstTokenKey)! }]
        : []
      state.tokenPointer = state.tokenKeys.length > 1
        ? 1
        : state.tokenKeys.length
          ? 0
          : -1
      state.recording = state.tokenKeys.length > 1
      state.saveProblem = null
      changed()
      return firstTokenKey
    },

    record({ activeTokenIndex, timeStart }) {
      if (
        !state.recording ||
        !Number.isFinite(timeStart) ||
        timeStart < 0 ||
        !state.tokenKeys.length
      ) {
        return null
      }
      const seededFirstCuePreview =
        activeTokenIndex === 0 &&
        state.tokenPointer === 1 &&
        state.cues.length === 1 &&
        state.cues[0]?.timeStart === 0 &&
        formatTokenKey(state.cues[0]) === state.tokenKeys[0]
      const requestedIndex = seededFirstCuePreview
        ? state.tokenPointer
        : Number.isSafeInteger(activeTokenIndex) && activeTokenIndex >= 0
          ? Math.min(activeTokenIndex + 1, state.tokenKeys.length - 1)
          : state.tokenPointer >= 0
            ? state.tokenPointer
            : 0
      // Authoring drafts are canonical token prefixes. Never create sparse
      // arrays if highlight state jumps ahead while timing.
      const index = Math.min(requestedIndex, state.cues.length)
      const tokenKey = state.tokenKeys[index]
      const position = tokenKey ? parseTokenKey(tokenKey) : null
      if (!tokenKey || !position) return null
      const cue = {
        ...(state.cues[index]?.review ? { review: cloneCue(state.cues[index]).review } : {}),
        timeStart: roundCueTime(timeStart),
        ...position,
      }
      state.cues[index] = cue
      state.tokenPointer = Math.min(index + 1, state.tokenKeys.length - 1)
      changed()
      return Object.freeze({ cue: Object.freeze(cloneCue(cue)), index, tokenKey })
    },

    undo() {
      if (!state.cues.length) return null
      state.cues.pop()
      state.tokenPointer = state.cues.length
        ? Math.min(state.cues.length, state.tokenKeys.length - 1)
        : -1
      changed()
      return state.tokenKeys[state.tokenPointer] ?? state.tokenKeys[0] ?? null
    },

    trim(activeTokenIndex) {
      const selectedIndex = editableCueIndex(activeTokenIndex)
      if (selectedIndex < 0) return null
      state.cues = state.cues.slice(0, selectedIndex)
      state.tokenPointer = clampPointer(selectedIndex, state.tokenKeys.length)
      state.recording = false
      changed()
      return state.tokenPointer
    },

    nudge({ activeTokenIndex, deltaSeconds, duration }) {
      if (!Number.isFinite(deltaSeconds)) return null
      const index = editableCueIndex(activeTokenIndex)
      const cue = index >= 0 ? state.cues[index] : null
      if (!cue) return null
      const previousTime = index > 0
        ? state.cues[index - 1].timeStart + 0.01
        : 0
      const nextTime = index < state.cues.length - 1
        ? state.cues[index + 1].timeStart - 0.01
        : Number.isFinite(duration) && duration > 0
          ? duration
          : Number.POSITIVE_INFINITY
      const latestTime = Math.min(
        nextTime,
        cue.timeEnd ?? Number.POSITIVE_INFINITY
      )
      const proposedTime = cue.timeStart + deltaSeconds
      const boundedTime = latestTime >= previousTime
        ? Math.max(previousTime, Math.min(latestTime, proposedTime))
        : proposedTime
      const nextCue = { ...cue, timeStart: roundCueTime(boundedTime) }
      const nextCues = validateCuePrefix(
        state.cues.map((candidate, candidateIndex) =>
          candidateIndex === index ? nextCue : candidate
        ),
        state.tokenKeys
      )
      state.cues = nextCues
      changed()
      return Object.freeze({ cue: Object.freeze(cloneCue(nextCue)), index })
    },

    replaceCues,

    applyPublishedSource({ cues, savedAt, preserveDraft }) {
      const nextSourceCues = validateCuePrefix(cues, state.tokenKeys)
      const nextSavedAt = validateSavedAt(savedAt)
      state.sourceCues = nextSourceCues
      if (!preserveDraft) {
        state.cues = cloneCues(nextSourceCues)
        state.tokenPointer = resumePointer(
          state.cues.length,
          state.tokenKeys.length
        )
        state.recording = false
        state.origin = nextSourceCues.length ? 'published' : 'none'
        state.savedAt = nextSavedAt
        state.saveProblem = null
      }
      changed()
    },

    markSaved(savedAt) {
      const nextSavedAt = validateSavedAt(savedAt)
      state.origin = 'local'
      state.savedAt = nextSavedAt
      state.saveProblem = null
      changed()
    },

    markSaveProblem(problem) {
      state.saveProblem = validateSaveProblem(problem)
      changed()
    },

    clearSaveProblem() {
      if (state.saveProblem === null) return
      state.saveProblem = null
      changed()
    },
  }
}
