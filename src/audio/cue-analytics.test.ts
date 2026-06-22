import { expect, test } from 'vitest'
import { createCueAnalyticsRecord } from './cue-analytics-core.ts'
import type { AudioRecording, WordCue } from './types.ts'

const recording: AudioRecording = {
  id: 'bereshit-1-test',
  narratorId: 'yd',
  parshaSlug: 'bereshit',
  parshaName: 'Bereshit',
  parshaNumber: 1,
  aliyah: 1,
  title: 'Bereshit 1',
  playSrc: '/audio/test.mp3',
  downloadSrc: '/audio/test.mp3',
  format: 'mp3',
  status: 'available',
}

const createCue = (
  timeStart: number,
  index: number,
  overrides: Partial<WordCue> = {}
): WordCue => ({
  cueNumber: index + 1,
  timeStart,
  pageNumber: 1,
  lineIndex: 0,
  fragmentIndex: 0,
  wordIndex: index,
  ...overrides,
})

test('retains invalid ordering transitions as review samples instead of dropping them', () => {
  const cues = [createCue(0, 0), createCue(1.2, 1), createCue(1.1, 2)]

  const record = createCueAnalyticsRecord({
    recording,
    narratorName: 'Yedidya',
    cues,
  })

  expect(record.intervalCount).toBe(1)
  expect(record.transitionCount).toBe(2)
  expect(record.invalidTransitionCount).toBe(1)
  expect(record.intervalSamples[1]).toMatchObject({
    gap: -0.1,
    isOutlier: true,
    outlierDirection: 'invalid',
    reviewLabel: 'Out of order',
  })
})

test('flags only extreme long pauses for review', () => {
  const cues = [
    createCue(0, 0),
    createCue(1, 1),
    createCue(2, 2),
    createCue(10.6, 3),
    createCue(11.6, 4),
    createCue(12.6, 5),
  ]

  const record = createCueAnalyticsRecord({
    recording,
    narratorName: 'Yedidya',
    cues,
  })

  expect(record.intervalSamples[2]).toMatchObject({
    gap: 8.6,
    isOutlier: true,
    outlierDirection: 'slow',
    reviewLabel: 'Long pause outlier',
  })
  expect(record.outlierCount).toBe(1)
  expect(record.structuralPauseCount).toBe(0)
})

test('ignores compressed transitions that are merely fast', () => {
  const gaps = [0.6, 1.0, 1.4, 1.8, 2.2, 0.2, 2.6]
  const cues = gaps.reduce<WordCue[]>(
    (allCues, gap, index) => {
      const previous = allCues[allCues.length - 1]
      const nextTime = Number(((previous?.timeStart ?? 0) + gap).toFixed(3))
      allCues.push(createCue(nextTime, index + 1))
      return allCues
    },
    [createCue(0, 0)]
  )

  const record = createCueAnalyticsRecord({
    recording,
    narratorName: 'Yedidya',
    cues,
  })

  const compressedTransition = record.intervalSamples.find((sample) => sample.gap === 0.2)
  expect(record.lowerOutlierThreshold).toBe(0)
  expect(compressedTransition).toMatchObject({
    isOutlier: false,
    outlierDirection: null,
    reviewLabel: 'Within expected range',
  })
})
