import { expect, test } from 'vitest'
import type { WordCue } from '../audio/types.ts'
import { createCueDraftEditor } from './cue-draft-editor.ts'

const tokenKeys = ['1:0:0:0', '1:0:0:1', '1:0:0:2', '1:0:0:3']

function cue(index: number, timeStart = index, pageNumber = 1): WordCue {
  return {
    timeStart,
    pageNumber,
    lineIndex: 0,
    fragmentIndex: 0,
    wordIndex: index,
  }
}

function stateWithoutRevision(snapshot: ReturnType<ReturnType<typeof boundEditor>['snapshot']>) {
  const { revision, ...state } = snapshot
  void revision
  return state
}

function boundEditor({
  sourceCues = [cue(0, 0)],
  cues = sourceCues,
}: {
  sourceCues?: WordCue[]
  cues?: WordCue[]
} = {}) {
  const editor = createCueDraftEditor()
  editor.bind({
    tokenKeys,
    sourceCues,
    cues,
    origin: sourceCues.length ? 'published' : 'none',
    savedAt: 100,
  })
  return editor
}

test('rejects invalid token identities and cue gaps without mutating state', () => {
  const editor = boundEditor()
  const before = editor.snapshot()

  expect(() =>
    editor.bind({
      tokenKeys: ['bad-key'],
      sourceCues: [],
      origin: 'none',
      savedAt: null,
    })
  ).toThrow('valid and unique')
  expect(editor.snapshot()).toBe(before)

  expect(() => editor.replaceCues([cue(0), cue(2)])).toThrow(
    'canonical token prefix'
  )
  expect(editor.snapshot()).toBe(before)
})

test('starts a fresh canonical pass and records only a contiguous prefix', () => {
  const editor = boundEditor({ sourceCues: [], cues: [] })
  expect(editor.startFreshPass()).toBe(tokenKeys[0])
  expect(editor.snapshot()).toMatchObject({
    tokenPointer: 1,
    recording: true,
    cues: [cue(0, 0)],
  })

  const second = editor.record({ activeTokenIndex: 0, timeStart: 2.3456 })
  expect(second).toMatchObject({ index: 1, tokenKey: tokenKeys[1] })
  expect(editor.snapshot().cues[1]).toEqual(cue(1, 2.346))

  const third = editor.record({ activeTokenIndex: 3, timeStart: 4 })
  expect(third).toMatchObject({ index: 2, tokenKey: tokenKeys[2] })
  expect(editor.snapshot().cues.map((entry) => entry.wordIndex)).toEqual([
    0,
    1,
    2,
  ])
})

test('undo removes the latest cue and returns the next token to activate', () => {
  const editor = boundEditor({ cues: [cue(0), cue(1), cue(2)] })
  expect(editor.undo()).toBe(tokenKeys[2])
  expect(editor.snapshot()).toMatchObject({
    tokenPointer: 2,
    cues: [cue(0), cue(1)],
  })

  editor.undo()
  expect(editor.undo()).toBe(tokenKeys[0])
  expect(editor.snapshot()).toMatchObject({ tokenPointer: -1, cues: [] })
  expect(editor.undo()).toBeNull()
})

test('trim owns selection, stops timing, and keeps cues before the selection', () => {
  const editor = boundEditor({ cues: [cue(0), cue(1), cue(2)] })
  editor.startRecording({ tokenPointer: 2 })

  expect(editor.trim(0)).toBe(2)
  expect(editor.snapshot()).toMatchObject({
    tokenPointer: 2,
    recording: false,
    cues: [cue(0), cue(1)],
  })
})

test('nudge clamps between adjacent cues and finite media duration', () => {
  const editor = boundEditor({
    cues: [cue(0, 1), cue(1, 2), cue(2, 3)],
  })
  editor.select(1)
  expect(
    editor.nudge({ activeTokenIndex: -1, deltaSeconds: -5, duration: 10 })
  ).toMatchObject({ index: 1, cue: { timeStart: 1.01 } })
  editor.select(2)
  expect(
    editor.nudge({ activeTokenIndex: -1, deltaSeconds: 20, duration: 4 })
  ).toMatchObject({ index: 2, cue: { timeStart: 4 } })
})

test('derives export readiness from valid strictly increasing cue timing', () => {
  const editor = boundEditor({
    sourceCues: [],
    cues: [cue(0, 0), cue(1, 0)],
  })
  expect(editor.snapshot().exportReady).toBe(false)

  editor.replaceCues([
    { ...cue(0, 0), timeEnd: 2 },
    cue(1, 1),
  ])
  expect(editor.snapshot().exportReady).toBe(false)

  editor.replaceCues([cue(0, 0), cue(1, 1)])
  expect(editor.snapshot().exportReady).toBe(true)
})

test('restores a validated checkpoint after an adapter rejects a draft edit', () => {
  const editor = boundEditor({ cues: [cue(0), cue(1)] })
  const checkpoint = editor.snapshot()

  editor.startRecording({ tokenPointer: 2 })
  editor.record({ activeTokenIndex: 1, timeStart: 2 })
  editor.markSaveProblem('storage')
  editor.restore(checkpoint)

  expect(stateWithoutRevision(editor.snapshot())).toEqual(
    stateWithoutRevision(checkpoint)
  )
  expect(editor.snapshot().revision).toBeGreaterThan(checkpoint.revision)
})

test('published refresh can update the comparison source without discarding edits', () => {
  const editor = boundEditor({
    sourceCues: [cue(0, 0)],
    cues: [cue(0, 0.5)],
  })
  expect(editor.snapshot().dirty).toBe(true)

  editor.applyPublishedSource({
    cues: [cue(0, 0.25)],
    savedAt: 200,
    preserveDraft: true,
  })
  expect(editor.snapshot()).toMatchObject({
    cues: [cue(0, 0.5)],
    sourceCues: [cue(0, 0.25)],
    dirty: true,
    savedAt: 100,
  })

  editor.applyPublishedSource({
    cues: [cue(0, 0.25), cue(1, 2)],
    savedAt: 200,
    preserveDraft: false,
  })
  expect(editor.snapshot()).toMatchObject({
    cues: [cue(0, 0.25), cue(1, 2)],
    origin: 'published',
    savedAt: 200,
    dirty: false,
  })
})
