import test from 'ava'
import {
  buildCueCaptureTimeline,
  createConcatEntries,
  renderConcatFile,
} from './cue-keyframes.ts'
import type { WordCue } from '../audio/types.ts'

const cue = (timeStart: number): WordCue => ({
  timeStart,
  pageNumber: 1,
  lineIndex: 0,
  fragmentIndex: 0,
  wordIndex: Math.round(timeStart * 1000),
})

test('cue capture timeline creates pre cue post samples and clamps to duration', (t) => {
  const timeline = buildCueCaptureTimeline({
    cues: [cue(0.05), cue(1), cue(1.95)],
    durationSeconds: 2,
    preCueMs: 80,
    postCueMs: 120,
    minGapMs: 30,
  })

  t.deepEqual(timeline.captureTimes, [0, 0.05, 0.17, 0.92, 1, 1.12, 1.87, 1.95, 2])
})

test('cue capture timeline deduplicates near-identical samples', (t) => {
  const timeline = buildCueCaptureTimeline({
    cues: [cue(1), cue(1.04)],
    durationSeconds: 2,
    preCueMs: 20,
    postCueMs: 20,
    minGapMs: 35,
  })

  t.deepEqual(timeline.captureTimes, [0, 0.98, 1.02, 1.06, 2])
})

test('concat entries hold each captured frame until the next capture time', (t) => {
  const entries = createConcatEntries({
    captureTimes: [0, 0.5, 1.25, 2],
    frameName: (index) => `frame-${index}.png`,
  })

  t.deepEqual(entries, [
    { file: 'frame-0.png', durationSeconds: 0.5 },
    { file: 'frame-1.png', durationSeconds: 0.75 },
    { file: 'frame-2.png', durationSeconds: 0.75 },
    { file: 'frame-3.png', durationSeconds: null },
  ])
})

test('concat file repeats final frame and escapes single quotes', (t) => {
  const source = renderConcatFile([
    { file: "frame-'0'.png", durationSeconds: 0.5 },
    { file: 'frame-1.png', durationSeconds: null },
  ])

  t.is(
    source,
    "file 'frame-'\\''0'\\''.png'\nduration 0.500000\nfile 'frame-1.png'\nfile 'frame-1.png'\n"
  )
})
