import { expect, test } from 'vitest'
import type { ParshaAudioRecording, WordCue } from '../audio/types.ts'
import { createActiveAudioSession } from './audio-controller.ts'
import { buildPlaybackPlan, contiguousOpeningOverlap } from './playback-plan.ts'

const previousKeys = ['1:0:0:0', '1:0:0:1', '1:0:0:2']
const targetKeys = ['1:0:0:1', '1:0:0:2', '1:0:0:3', '1:0:0:4']

const recording = (id: string, aliyah: number): ParshaAudioRecording => ({
  id,
  narratorId: 'reader',
  reading: { kind: 'parsha', id: 'test', name: 'Test' },
  parshaSlug: 'test',
  parshaName: 'Test',
  aliyah,
  title: id,
  playSrc: `/${id}.mp3`,
  downloadSrc: `/${id}.mp3`,
  format: 'mp3',
  status: 'available',
})

const cue = (key: string, timeStart: number, timeEnd?: number): WordCue => {
  const [pageNumber, lineIndex, fragmentIndex, wordIndex] = key.split(':').map(Number)
  return {
    pageNumber,
    lineIndex,
    fragmentIndex,
    wordIndex,
    timeStart,
    ...(timeEnd === undefined ? {} : { timeEnd }),
  }
}

const previous = recording('previous', 1)
const current = recording('current', 2)
const target = { runId: 'run', index: 2 } as const

test('detects only a contiguous previous suffix and target prefix overlap', () => {
  expect(contiguousOpeningOverlap(previousKeys, targetKeys)).toEqual([
    '1:0:0:1', '1:0:0:2',
  ])
  expect(contiguousOpeningOverlap(
    ['1:0:0:1', '1:0:0:9'],
    targetKeys
  )).toEqual([])
})

test('uses current-only when every shared-opening token has a current cue', () => {
  const plan = buildPlaybackPlan({
    target,
    tokenKeys: targetKeys,
    current: {
      recording: current,
      cues: targetKeys.map((key, index) => cue(key, index)),
    },
    previous: {
      recording: previous,
      cues: previousKeys.map((key, index) => cue(key, index)),
    },
    previousTokenKeys: previousKeys,
  })

  expect(plan?.status).toBe('current-only')
  expect(plan?.segments.map((segment) => segment.recording.id)).toEqual(['current'])
})

test('uses the complete previous opening and then switches once to current audio', () => {
  const plan = buildPlaybackPlan({
    target,
    tokenKeys: targetKeys,
    current: {
      recording: current,
      cues: [cue(targetKeys[2]!, 10), cue(targetKeys[3]!, 11, 12)],
    },
    previous: {
      recording: previous,
      cues: [
        cue(previousKeys[0]!, 2),
        cue(previousKeys[1]!, 3),
        cue(previousKeys[2]!, 4, 5),
      ],
    },
    previousTokenKeys: previousKeys,
  })

  expect(plan?.status).toBe('previous-opening')
  expect(plan?.segments.map((segment) => segment.recording.id)).toEqual([
    'previous', 'current',
  ])
  expect(plan?.segments[0]?.endTime).toBe(5)
  expect(plan?.segments[1]?.endTime).toBeNull()

  const session = createActiveAudioSession(plan!)
  expect(session.cues.map((entry) => entry.timeStart)).toEqual([0, 1, 2, 3])
  expect(session.segments[1]?.logicalStart).toBe(2)
  expect(session.segments[1]?.logicalEnd).toBe(Number.POSITIVE_INFINITY)
})

test('starts at the first usable current cue when the previous opening is unusable', () => {
  const plan = buildPlaybackPlan({
    target,
    tokenKeys: targetKeys,
    current: {
      recording: current,
      cues: [cue(targetKeys[2]!, 10), cue(targetKeys[3]!, 11)],
    },
    previous: {
      recording: previous,
      cues: [cue(previousKeys[1]!, 3)],
    },
    previousTokenKeys: previousKeys,
  })

  expect(plan?.status).toBe('partial-start')
  expect(plan?.segments[0]?.tokenKeys).toEqual(targetKeys.slice(2))
})

test('plays only the shared previous opening when current audio is missing', () => {
  const plan = buildPlaybackPlan({
    target,
    tokenKeys: targetKeys,
    current: null,
    previous: {
      recording: previous,
      cues: [
        cue(previousKeys[0]!, 2),
        cue(previousKeys[1]!, 3),
        cue(previousKeys[2]!, 4, 5),
      ],
    },
    previousTokenKeys: previousKeys,
  })

  expect(plan?.status).toBe('overlap-only')
  expect(plan?.segments[0]?.tokenKeys).toEqual(targetKeys.slice(0, 2))
})
