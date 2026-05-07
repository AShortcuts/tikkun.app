import test from 'ava'
import {
  buildCueFramePlan,
  createCueConcatEntries,
  renderCueConcatFile,
} from './cue-frame-plan.ts'
import type { WordCue } from '../audio/types.ts'

const cue = (timeStart: number, timeEnd?: number): WordCue => ({
  timeStart,
  timeEnd,
  pageNumber: 1,
  lineIndex: 0,
  fragmentIndex: 0,
  wordIndex: Math.round(timeStart * 1000),
})

test('cue frame plan captures one cue frame and a burst before cue end', (t) => {
  const plan = buildCueFramePlan({
    cues: [cue(0.5, 1.2), cue(1.7, 1.9)],
    durationSeconds: 2,
    fps: 10,
    burstPreEndMs: 200,
    burstMaxMs: 300,
  })

  t.is(plan.frameCount, 20)
  t.deepEqual(
    plan.entries.map((entry) => entry.frameIndex),
    [0, 5, 6, 10, 11, 12, 13, 17, 18, 19]
  )
  t.deepEqual(
    plan.entries.map((entry) => entry.seconds),
    [0.5, 0.5, 0.5, 1, 1.1, 1.2, 1.3, 1.7, 1.7, 1.9]
  )
  t.deepEqual(
    plan.entries.map((entry) => entry.settleMs ?? 0),
    [100, 0, 100, 0, 0, 0, 0, 0, 100, 0]
  )
  t.deepEqual(
    plan.entries.map((entry) => entry.highlightAnimationMs ?? null),
    [null, 100, null, null, null, null, null, 100, null, null]
  )
})

test('cue start held frames settle before capture without moving the output frame', (t) => {
  const plan = buildCueFramePlan({
    cues: [cue(0.5, 0.8)],
    durationSeconds: 1,
    fps: 30,
    burstPreEndMs: 100,
    burstMaxMs: 100,
  })

  const cueStart = plan.entries.find((entry) => entry.frameIndex === 18)
  t.deepEqual(cueStart, { frameIndex: 18, seconds: 0.5, settleMs: 100 })
})

test('cue start frames capture the highlight animation before the held frame', (t) => {
  const plan = buildCueFramePlan({
    cues: [cue(0.5, 0.8)],
    durationSeconds: 1,
    fps: 30,
    burstPreEndMs: 100,
    burstMaxMs: 100,
  })

  const animationFrames = plan.entries.filter(
    (entry) => entry.highlightAnimationMs !== undefined
  )
  t.deepEqual(
    animationFrames.map((entry) => ({
      frameIndex: entry.frameIndex,
      seconds: entry.seconds,
      highlightAnimationMs: entry.highlightAnimationMs,
      settleBeforeAnimation: entry.settleBeforeAnimation ?? false,
    })),
    [
      {
        frameIndex: 15,
        seconds: 0.5,
        highlightAnimationMs: 33.333,
        settleBeforeAnimation: true,
      },
      {
        frameIndex: 16,
        seconds: 0.5,
        highlightAnimationMs: 66.667,
        settleBeforeAnimation: false,
      },
      {
        frameIndex: 17,
        seconds: 0.5,
        highlightAnimationMs: 100,
        settleBeforeAnimation: false,
      },
    ]
  )
})

test('line changes capture a scroll transition before the held frame', (t) => {
  const plan = buildCueFramePlan({
    cues: [
      { ...cue(0.5, 0.8), lineIndex: 0 },
      { ...cue(0.9, 1.2), lineIndex: 1 },
    ],
    durationSeconds: 1.5,
    fps: 30,
    burstPreEndMs: 100,
    burstMaxMs: 100,
  })

  const transition = plan.entries.filter((entry) => entry.seconds === 0.9)
  t.deepEqual(
    transition.map((entry) => ({
      frameIndex: entry.frameIndex,
      scrollTransition: entry.scrollTransition ?? false,
      settleBeforeAnimation: entry.settleBeforeAnimation ?? false,
      transitionWaitMs: entry.transitionWaitMs,
      settleMs: entry.settleMs ?? 0,
    })),
    [
      {
        frameIndex: 27,
        scrollTransition: true,
        settleBeforeAnimation: false,
        transitionWaitMs: 33.333,
        settleMs: 0,
      },
      {
        frameIndex: 28,
        scrollTransition: false,
        settleBeforeAnimation: false,
        transitionWaitMs: 33.333,
        settleMs: 0,
      },
      {
        frameIndex: 29,
        scrollTransition: false,
        settleBeforeAnimation: false,
        transitionWaitMs: 33.333,
        settleMs: 0,
      },
      {
        frameIndex: 30,
        scrollTransition: false,
        settleBeforeAnimation: false,
        transitionWaitMs: 33.333,
        settleMs: 0,
      },
      {
        frameIndex: 31,
        scrollTransition: false,
        settleBeforeAnimation: false,
        transitionWaitMs: 33.333,
        settleMs: 0,
      },
      {
        frameIndex: 32,
        scrollTransition: false,
        settleBeforeAnimation: false,
        transitionWaitMs: 33.333,
        settleMs: 0,
      },
      {
        frameIndex: 33,
        scrollTransition: false,
        settleBeforeAnimation: false,
        transitionWaitMs: undefined,
        settleMs: 100,
      },
    ]
  )
})

test('cue starts never collapse onto the same output frame', (t) => {
  const plan = buildCueFramePlan({
    cues: [cue(0.5, 0.54), cue(0.516, 0.58), cue(0.548, 0.62)],
    durationSeconds: 1,
    fps: 30,
    burstPreEndMs: 100,
    burstMaxMs: 100,
  })

  t.deepEqual(
    [0.5, 0.516, 0.548].map((seconds) => {
      const entry = plan.entries.find(
        (candidate) => candidate.seconds === seconds && candidate.frameIndex > 0
      )
      return [entry?.frameIndex, seconds]
    }),
    [
      [15, 0.5],
      [16, 0.516],
      [17, 0.548],
    ]
  )
})

test('cue frame plan clamps windows to the output duration', (t) => {
  const plan = buildCueFramePlan({
    cues: [cue(0.01, 0.1), cue(1.99, 2.2)],
    durationSeconds: 2,
    fps: 10,
    burstPreEndMs: 300,
    burstMaxMs: 500,
  })

  t.deepEqual(
    plan.entries.map((entry) => entry.frameIndex),
    [0, 1, 2, 3, 4, 5, 19]
  )
})

test('concat entries hold each captured frame until the next planned output frame', (t) => {
  const plan = buildCueFramePlan({
    cues: [cue(0.5, 0.8)],
    durationSeconds: 1,
    fps: 10,
    burstPreEndMs: 100,
    burstMaxMs: 200,
  })
  const entries = createCueConcatEntries({
    plan,
    fps: 10,
    frameName: (index) => `frame-${index}.png`,
  })

  t.deepEqual(entries, [
    { file: 'frame-0.png', durationSeconds: 0.5 },
    { file: 'frame-1.png', durationSeconds: 0.1 },
    { file: 'frame-2.png', durationSeconds: 0.1 },
    { file: 'frame-3.png', durationSeconds: 0.1 },
    { file: 'frame-4.png', durationSeconds: 0.1 },
    { file: 'frame-5.png', durationSeconds: 0.1 },
  ])
  t.true(
    Math.abs(entries.reduce((total, entry) => total + entry.durationSeconds, 0) - 1) <
      Number.EPSILON
  )
})

test('cue frame plan caps bursts before the next cue begins', (t) => {
  const plan = buildCueFramePlan({
    cues: [cue(1, 1.9), cue(2, 2.3)],
    durationSeconds: 3,
    fps: 30,
    burstPreEndMs: 200,
    burstMaxMs: 500,
  })

  t.deepEqual(
    plan.entries.map((entry) => entry.frameIndex),
    [
      0, 30, 31, 32, 33, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62,
      63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 89,
    ]
  )
})

test('concat file repeats final frame and escapes single quotes', (t) => {
  const source = renderCueConcatFile([
    { file: "frame-'0'.png", durationSeconds: 0.5 },
    { file: 'frame-1.png', durationSeconds: 0.1 },
  ])

  t.is(
    source,
    "file 'frame-'\\''0'\\''.png'\nduration 0.500000\nfile 'frame-1.png'\nduration 0.100000\nfile 'frame-1.png'\n"
  )
})
