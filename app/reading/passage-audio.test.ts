import { expect, test } from 'vitest'
import { audioRecordings } from '../../generated/audio-manifest.ts'
import { loadPassageTokens } from '../audio/passage-tokens.ts'
import { createRecordingRangeResolver } from '../audio/recording-ranges.ts'
import type { AudioRecording, RecordingRange, WordCue } from '../audio/types.ts'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import { resolveParshaRun } from '../view-model/navigation/parsha-routes.ts'
import { PassageAudioResolver, passagePlaybackPlan } from './passage-audio.ts'

const range = (first: number, last: number): RecordingRange => ({
  start: { scroll: 'torah', b: 5, c: 31, v: first },
  end: { scroll: 'torah', b: 5, c: 31, v: last },
})
const token = (v: number) => `1:0:0:${v}`
const tokens = async (r: RecordingRange) => Array.from({ length: r.end.v - r.start.v + 1 }, (_, i) => token(r.start.v + i))
const recording = (id: string, narratorId = 'reader'): AudioRecording => ({
  id, narratorId, reading: { kind: 'range', id, name: id },
  range: range(1, 3), aliyah: 1, title: id,
  playSrc: `/${id}.mp3`, downloadSrc: `/${id}.mp3`, format: 'mp3', status: 'available',
})
const cue = (v: number, timeStart: number, timeEnd?: number): WordCue => ({
  pageNumber: 1, lineIndex: 0, fragmentIndex: 0, wordIndex: v, timeStart,
  ...(timeEnd === undefined ? {} : { timeEnd }),
})
function resolver(sources: { id: string; range: RecordingRange; cues?: WordCue[]; narrator?: string }[]) {
  return new PassageAudioResolver({
    recordings: sources.map(s => recording(s.id, s.narrator)),
    rangeForRecording: r => sources.find(s => s.id === r.id)!.range,
    loadTokens: tokens,
    loadCues: async r => sources.find(s => s.id === r.id)!.cues ?? [],
  })
}

test('joins whole uncued recordings with complete audio coverage', async () => {
  const result = await resolver([{ id: 'a', range: range(1, 3) }, { id: 'b', range: range(4, 6) }]).resolve(range(1, 6), 'reader')
  expect(result.problem).toBe('incomplete-cues')
  expect(result.missing).toEqual([])
  expect(result.portions).toHaveLength(1)
  expect(result.portions[0].segments.map(s => [s.recording.id, s.startTime, s.endTime])).toEqual([['a', 0, null], ['b', 0, null]])
})

test('complete cues make a reused recording normal, regardless of its original identity', async () => {
  const result = await resolver([{ id: 'standalone', range: range(1, 3), cues: [cue(1, 0), cue(2, 2), cue(3, 4, 6)] }]).resolve(range(1, 3), 'reader')
  expect(result.problem).toBeNull()
  expect(result.cueComplete).toBe(true)
})

test('infers excerpt start from its first word cue without requiring all word cues', async () => {
  const result = await resolver([{ id: 'seventh', range: range(25, 30), cues: [cue(28, 12)] }]).resolve(range(28, 30), 'reader')
  expect(result.problem).toBe('incomplete-cues')
  expect(result.portions[0].segments[0]).toMatchObject({ startTime: 12, endTime: null })
})

test('does not guess an excerpt start from the next available cue', async () => {
  const result = await resolver([{ id: 'seventh', range: range(25, 30), cues: [cue(29, 12)] }]).resolve(range(28, 30), 'reader')
  expect(result.problem).toBe('timing-needed')
  expect(result.portions).toEqual([])
  expect(result).toMatchObject({ issue: 'cue', canPlay: false })
})

test('partial coverage caused only by missing timing remains a cue problem', async () => {
  const result = await resolver([{ id: 'a', range: range(1, 3) }, { id: 'b', range: range(4, 9) }]).resolve(range(1, 6), 'reader')
  expect(result).toMatchObject({ problem: 'partial-audio', issue: 'cue', canPlay: true })
})

test('does not guess an excerpt end using an arbitrary last-word duration', async () => {
  const result = await resolver([{ id: 'source', range: range(1, 6), cues: [cue(1, 0), cue(3, 10)] }]).resolve(range(1, 3), 'reader')
  expect(result.problem).toBe('timing-needed')
})

test('uses the immediately following word cue as an excerpt end', async () => {
  const result = await resolver([{ id: 'source', range: range(1, 6), cues: [cue(1, 0), cue(3, 10), cue(4, 13)] }]).resolve(range(1, 3), 'reader')
  expect(result.portions[0].segments[0].endTime).toBe(13)
})

test('missing middle creates separate portions and never a plan that jumps the gap', async () => {
  const result = await resolver([{ id: 'a', range: range(1, 3) }, { id: 'b', range: range(7, 9) }]).resolve(range(1, 9), 'reader')
  expect(result.problem).toBe('partial-audio')
  expect(result.missing).toEqual([range(4, 6)])
  expect(result.portions.map(p => p.range)).toEqual([range(1, 3), range(7, 9)])
  const plan = passagePlaybackPlan(result, result.portions[1], { runId: 'combined', index: 4 }, 'Combined reading')
  expect(plan.tokenKeys).toEqual([token(7), token(8), token(9)])
  expect(plan.status).toBe('partial-passage')
  expect(plan.readingLabel).toBe('Combined reading')
})

test('keeps missing opening and ending separate', async () => {
  const result = await resolver([{ id: 'middle', range: range(4, 6) }]).resolve(range(1, 9), 'reader')
  expect(result.missing).toEqual([range(1, 3), range(7, 9)])
})

test('does not silently use another narrator', async () => {
  const result = await resolver([{ id: 'other', range: range(1, 3), narrator: 'other' }]).resolve(range(1, 3), 'reader')
  expect(result.problem).toBe('missing-audio')
  expect(result.recording).toBeNull()
})

test('prefers one exact recording over multiple sources', async () => {
  const result = await resolver([{ id: 'a', range: range(1, 3) }, { id: 'b', range: range(4, 6) }, { id: 'exact', range: range(1, 6) }]).resolve(range(1, 6), 'reader')
  expect(result.portions[0].segments.map(s => s.recording.id)).toEqual(['exact'])
})

test('chooses a complete route over a longer first source with an untimed overlap', async () => {
  const result = await resolver([
    { id: 'long', range: range(1, 4) },
    { id: 'short', range: range(1, 3) },
    { id: 'ending', range: range(4, 6) },
  ]).resolve(range(1, 6), 'reader')
  expect(result.problem).toBe('incomplete-cues')
  expect(result.portions[0].segments.map(s => s.recording.id)).toEqual(['short', 'ending'])
})

test('trims source overlap once, using the first unplayed word', async () => {
  const result = await resolver([{ id: 'a', range: range(1, 3) }, { id: 'b', range: range(3, 6), cues: [cue(3, 0), cue(4, 2)] }]).resolve(range(1, 6), 'reader')
  expect(result.portions[0].tokenKeys).toEqual(await tokens(range(1, 6)))
  expect(result.portions[0].segments[1].startTime).toBe(2)
})

test('does not hold a timed highlight over an untimed word', async () => {
  const result = await resolver([{ id: 'a', range: range(1, 3), cues: [cue(1, 0), cue(3, 10)] }]).resolve(range(1, 3), 'reader')
  expect(result.portions[0].segments[0].cues[0].timeEnd).toBe(0)
})

test('real Nitzavim-Vayelech maps available aliyot and missing opening from canonical text', async () => {
  const generator = new LeiningGenerator({ ashkenazi: true, israel: false, includeModernHolidays: false })
  const run = resolveParshaRun(generator, 'nitzavim-vayelech', new Date('2026-09-07T12:00:00'))!.run
  const subject = new PassageAudioResolver({
    recordings: audioRecordings,
    rangeForRecording: createRecordingRangeResolver(),
    loadTokens: loadPassageTokens,
    loadCues: async () => [],
  })
  for (const [index, sources] of [[5, ['vayelech-3', 'vayelech-4']], [6, ['vayelech-5']], [7, ['vayelech-6', 'vayelech-7']]] as const) {
    const result = await subject.resolve(run.aliyot.find(a => a.index === index)!, 'yoni-davidov')
    expect(result.problem).toBe('incomplete-cues')
    expect(result.portions[0].segments.map(s => s.recording.id)).toEqual(sources)
    expect(result.portions[0].tokenKeys).toEqual(result.tokenKeys)
  }
  const fourth = await subject.resolve(run.aliyot.find(a => a.index === 4)!, 'yoni-davidov')
  expect(fourth.problem).toBe('partial-audio')
  expect(fourth.message).toBe('Audio unavailable for Devarim 30:15-30:20 portion')
  expect(fourth.missing).toEqual([{ start: { scroll: 'torah', b: 5, c: 30, v: 15 }, end: { scroll: 'torah', b: 5, c: 30, v: 20 } }])
  expect(fourth.portions[0].segments.map(s => s.recording.id)).toEqual(['vayelech-1', 'vayelech-2'])
  const maftir = await subject.resolve(run.aliyot.find(a => a.index === 'Maftir')!, 'yoni-davidov')
  expect(maftir.problem).toBe('timing-needed')
})
