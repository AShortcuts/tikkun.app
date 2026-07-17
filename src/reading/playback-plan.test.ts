import { expect, test } from 'vitest'
import type { ParshaAudioRecording, WordCue } from '../audio/types.ts'
import { createActiveAudioSession } from './audio-controller.ts'
import { buildPlaybackPlan } from './playback-plan.ts'

const recording: ParshaAudioRecording = {
  id: 'lech-lecha-3',
  narratorId: 'yoni-davidov',
  reading: { kind: 'parsha', id: 'lech-lecha', name: 'Lech Lecha' },
  parshaSlug: 'lech-lecha',
  parshaName: 'Lech Lecha',
  aliyah: 3,
  title: 'Lech Lecha Aliyah 3',
  playSrc: '/audio/lech-lecha-3.m4a',
  downloadSrc: '/audio/lech-lecha-3.m4a',
  format: 'm4a',
  status: 'available',
}

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

test('keeps an available recording playable when it has no timing cues', () => {
  const tokenKeys = ['13:0:0:0', '13:0:0:1']
  const plan = buildPlaybackPlan({
    target: { runId: 'lech-lecha', index: 3 },
    tokenKeys,
    current: { recording, cues: [] },
  })

  expect(plan).toMatchObject({
    status: 'current-only',
    segments: [{ recording, tokenKeys, cues: [], startTime: 0, endTime: null }],
  })

  const session = createActiveAudioSession(plan!)
  expect(session.recording).toBe(recording)
  expect(session.segments[0]?.logicalEnd).toBe(Number.POSITIVE_INFINITY)
})

test('keeps incomplete current timing open through media EOF', () => {
  const tokenKeys = ['13:0:0:0', '13:0:0:1', '13:0:0:2']
  const publishedCues = [cue(tokenKeys[0]!, 0), cue(tokenKeys[1]!, 4)]
  const plan = buildPlaybackPlan({
    target: { runId: 'lech-lecha', index: 3 },
    tokenKeys,
    current: { recording, cues: publishedCues },
  })

  expect(plan?.segments[0]?.endTime).toBeNull()
  expect(createActiveAudioSession(plan!).segments[0]?.logicalEnd).toBe(
    Number.POSITIVE_INFINITY
  )
})

test('keeps complete current timing open through media EOF', () => {
  const tokenKeys = ['13:0:0:0', '13:0:0:1']
  const plan = buildPlaybackPlan({
    target: { runId: 'lech-lecha', index: 3 },
    tokenKeys,
    current: {
      recording,
      cues: [cue(tokenKeys[0]!, 0), cue(tokenKeys[1]!, 4, 5)],
    },
  })

  expect(plan?.segments[0]?.endTime).toBeNull()
  expect(createActiveAudioSession(plan!).segments[0]?.logicalEnd).toBe(
    Number.POSITIVE_INFINITY
  )
})

test('bounds previous overlap while leaving the current remainder open', () => {
  const previousKeys = ['13:0:0:0', '13:0:0:1']
  const tokenKeys = ['13:0:0:1', '13:0:0:2']
  const previousRecording = { ...recording, id: 'lech-lecha-2', aliyah: 2 }
  const plan = buildPlaybackPlan({
    target: { runId: 'lech-lecha', index: 3 },
    tokenKeys,
    current: { recording, cues: [cue(tokenKeys[1]!, 8)] },
    previous: {
      recording: previousRecording,
      cues: [cue(previousKeys[0]!, 2), cue(previousKeys[1]!, 4)],
    },
    previousTokenKeys: previousKeys,
  })

  expect(plan?.status).toBe('previous-opening')
  expect(plan?.segments.map((segment) => segment.endTime)).toEqual([4.75, null])
  const session = createActiveAudioSession(plan!)
  expect(session.segments[0]?.logicalEnd).toBe(0.75)
  expect(session.segments[1]?.logicalStart).toBe(0.75)
  expect(session.segments[1]?.logicalEnd).toBe(Number.POSITIVE_INFINITY)
})

test('keeps overlap-only playback cue-bounded', () => {
  const previousKeys = ['13:0:0:0', '13:0:0:1']
  const tokenKeys = ['13:0:0:1', '13:0:0:2']
  const plan = buildPlaybackPlan({
    target: { runId: 'lech-lecha', index: 3 },
    tokenKeys,
    current: null,
    previous: {
      recording: { ...recording, id: 'lech-lecha-2', aliyah: 2 },
      cues: [cue(previousKeys[0]!, 2), cue(previousKeys[1]!, 4)],
    },
    previousTokenKeys: previousKeys,
  })

  expect(plan?.status).toBe('overlap-only')
  expect(plan?.segments[0]?.endTime).toBe(4.75)
  expect(createActiveAudioSession(plan!).segments[0]?.logicalEnd).toBe(0.75)
})
