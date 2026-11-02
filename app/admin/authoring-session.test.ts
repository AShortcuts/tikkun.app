import { expect, test } from 'vitest'
import type { ParshaAudioRecording, WordCue } from '../audio/types.ts'
import { createActiveAudioSession } from '../reading/audio-controller.ts'
import { buildPlaybackPlan } from '../reading/playback-plan.ts'
import { AuthoringSessionTransition, isAuthoringSession, replaceAuthoringSessionCues } from './authoring-session.ts'

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

const cue = (key: string, timeStart: number): WordCue => {
  const [pageNumber, lineIndex, fragmentIndex, wordIndex] = key.split(':').map(Number)
  return { pageNumber, lineIndex, fragmentIndex, wordIndex, timeStart }
}

test('replaces partial published cues with a longer local draft without bounding media', () => {
  const tokenKeys = ['1:0:0:0', '1:0:0:1', '1:0:0:2']
  const plan = buildPlaybackPlan({
    target: { runId: 'run', index: 2 },
    tokenKeys,
    current: {
      recording: recording('current', 2),
      cues: [cue(tokenKeys[0]!, 0), cue(tokenKeys[1]!, 4)],
    },
  })
  const session = createActiveAudioSession(plan!)
  const localCues = [...session.cues, cue(tokenKeys[2]!, 12)]

  expect(isAuthoringSession(session)).toBe(true)
  expect(replaceAuthoringSessionCues(session, localCues)).toBe(true)
  expect(session.cues).toBe(localCues)
  expect(session.segments[0]?.cues).toBe(localCues)
  expect(session.segments[0]?.logicalEnd).toBe(Number.POSITIVE_INFINITY)
})

test('restores the first reader checkpoint once and invalidates stale preparation', () => {
  const first = createActiveAudioSession(buildPlaybackPlan({
    target: { runId: 'first', index: 2 },
    tokenKeys: ['1:0:0:0'],
    current: { recording: recording('first', 2), cues: [] },
  })!)
  const second = createActiveAudioSession(buildPlaybackPlan({
    target: { runId: 'second', index: 3 },
    tokenKeys: ['1:0:0:1'],
    current: { recording: recording('second', 3), cues: [] },
  })!)
  const transition = new AuthoringSessionTransition()

  const firstGeneration = transition.begin(first, 12)
  const secondGeneration = transition.begin(second, 20)

  expect(transition.isCurrent(firstGeneration)).toBe(false)
  expect(transition.isCurrent(secondGeneration)).toBe(true)
  expect(transition.leave()).toEqual({ session: first, currentTime: 12 })
  expect(transition.isCurrent(secondGeneration)).toBe(false)
  expect(transition.leave()).toBeNull()
})
