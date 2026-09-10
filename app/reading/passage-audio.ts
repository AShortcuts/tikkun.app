import { compareRefs } from '../calendar-model/ref-utils.ts'
import { listTorahBooks } from '../components/torah-reference.ts'
import { listTorahVerses } from '../data/torah-index.ts'
import { formatTokenKey } from '../reader/token-position.ts'
import type { AudioRecording, RecordingRange, WordCue } from '../audio/types.ts'
import type { PlaybackPlan, PlaybackSegment } from './playback-plan.ts'

export type PassageAudioProblem = 'checking' | 'missing-audio' | 'partial-audio' | 'timing-needed' | 'incomplete-cues' | 'load-failed' | null
export interface PassageAudioState {
  problem: PassageAudioProblem
  message: string
  recording: AudioRecording | null
  issue?: 'audio' | 'cue'
  canPlay?: boolean
}
export interface PassageAudioPortion {
  range: RecordingRange
  tokenKeys: string[]
  segments: PlaybackSegment[]
}
export interface PassageAudioResolution extends PassageAudioState {
  portions: PassageAudioPortion[]
  missing: RecordingRange[]
  tokenKeys: string[]
  range: RecordingRange
  cueComplete: boolean
}
export interface PassageAudioOptions {
  recordings: readonly AudioRecording[]
  rangeForRecording(recording: AudioRecording): RecordingRange | null
  loadTokens(range: RecordingRange): Promise<string[]>
  loadCues(recording: AudioRecording): Promise<readonly WordCue[]>
}

export const passageRangeLabel = ({ start, end }: RecordingRange) =>
  `${start.c}:${start.v}-${end.c}:${end.v}`
const sameRef = (a: RecordingRange['start'], b: RecordingRange['start']) =>
  a.scroll === b.scroll && compareRefs(a, b) === 0
const sameRange = (a: RecordingRange, b: RecordingRange) => sameRef(a.start, b.start) && sameRef(a.end, b.end)
const keyForRange = (range: RecordingRange) => `${range.start.scroll}:${range.start.b}:${passageRangeLabel(range)}`

function verses(range: RecordingRange) {
  const refs: RecordingRange['start'][] = []
  if (range.start.scroll !== 'torah' || range.start.b !== range.end.b) return refs
  for (let c = range.start.c; c <= range.end.c; c++) {
    for (const v of listTorahVerses(range.start.b, c)) {
      const ref = { ...range.start, c, v }
      if (compareRefs(ref, range.start) >= 0 && compareRefs(ref, range.end) <= 0) refs.push(ref)
    }
  }
  return refs
}

export class PassageAudioResolver {
  private readonly cache = new Map<string, Promise<PassageAudioResolution>>()
  private readonly states = new Map<string, PassageAudioState>()
  private readonly sources: { recording: AudioRecording; range: RecordingRange }[]

  constructor(private readonly options: PassageAudioOptions) {
    this.sources = options.recordings.flatMap(recording => {
      const range = options.rangeForRecording(recording)
      return recording.status === 'available' && range ? [{ recording, range }] : []
    })
  }

  private key(range: RecordingRange, narratorId: string) {
    return `${narratorId}:${keyForRange(range)}`
  }

  private candidates(range: RecordingRange, narratorId: string) {
    return this.sources.filter(source => source.recording.narratorId === narratorId &&
      source.range.start.scroll === range.start.scroll && source.range.start.b === range.start.b &&
      compareRefs(source.range.start, range.end) <= 0 && compareRefs(source.range.end, range.start) >= 0)
      .sort((a, b) => Number(sameRange(b.range, range)) - Number(sameRange(a.range, range)) ||
        compareRefs(a.range.start, b.range.start) || compareRefs(b.range.end, a.range.end) || a.recording.id.localeCompare(b.recording.id))
  }

  peek(range: RecordingRange, narratorId: string): PassageAudioState {
    const known = this.states.get(this.key(range, narratorId))
    if (known) return known
    const candidates = this.candidates(range, narratorId)
    return {
      problem: candidates.length ? 'checking' : 'missing-audio',
      message: candidates.length ? 'Checking audio coverage' : 'Audio not available',
      recording: candidates[0]?.recording ?? null,
    }
  }

  resolve(range: RecordingRange, narratorId: string): Promise<PassageAudioResolution> {
    const key = this.key(range, narratorId)
    const existing = this.cache.get(key)
    if (existing) return existing
    const request = this.build(range, narratorId).then(result => {
      this.states.set(key, result)
      return result
    }, error => {
      this.cache.delete(key)
      this.states.set(key, { problem: 'load-failed', message: 'Audio details could not be loaded. Retry playback.', recording: this.candidates(range, narratorId)[0]?.recording ?? null })
      throw error
    })
    this.cache.set(key, request)
    return request
  }

  private async build(range: RecordingRange, narratorId: string): Promise<PassageAudioResolution> {
    const refs = verses(range)
    const tokenCache = new Map<string, Promise<string[]>>()
    const loadTokens = (range: RecordingRange) => {
      const key = keyForRange(range)
      let request = tokenCache.get(key)
      if (!request) { request = this.options.loadTokens(range); tokenCache.set(key, request) }
      return request
    }
    const tokenKeys = await loadTokens(range)
    const candidates = await Promise.all(this.candidates(range, narratorId).map(async source => ({
      ...source,
      tokens: await loadTokens(source.range),
      cues: new Map((await this.options.loadCues(source.recording)).map(cue => [formatTokenKey(cue), cue])),
    })))
    type Step = { startIndex: number; endIndex: number; segment: PlaybackSegment | null }
    type Path = { covered: number; cues: number; count: number; steps: Step[] }
    const paths = new Map<string, Promise<Path>>()
    let timingNeeded = false
    // Optimize full coverage before join count. A greedy longest clip can strand
    // a later overlap whose cut has no cues, despite another complete route.
    const solve = (index: number, afterGap: boolean): Promise<Path> => {
      if (index >= refs.length) return Promise.resolve({ covered: 0, cues: 0, count: 0, steps: [] })
      const key = `${index}:${afterGap}`
      const cached = paths.get(key)
      if (cached) return cached
      const request = (async () => {
        const rest = await solve(index + 1, true)
        let best: Path = { ...rest, steps: [{ startIndex: index, endIndex: index, segment: null }, ...rest.steps] }
        for (const source of candidates) {
          if (compareRefs(source.range.start, refs[index]) > 0 || compareRefs(source.range.end, refs[index]) < 0) continue
          if (afterGap && compareRefs(source.range.start, refs[index]) < 0) continue
          let lastIndex = index
          while (lastIndex + 1 < refs.length && compareRefs(refs[lastIndex + 1], source.range.end) <= 0) lastIndex++
          const ends = new Set([lastIndex])
          for (const next of candidates) {
            const startIndex = refs.findIndex(ref => sameRef(ref, next.range.start))
            if (startIndex > index && startIndex <= lastIndex) ends.add(startIndex - 1)
          }
          for (const endIndex of ends) {
            const selectedRange = { start: refs[index], end: refs[endIndex] }
            const selectedTokens = await loadTokens(selectedRange)
            const firstIndex = source.tokens.indexOf(selectedTokens[0])
            if (firstIndex < 0 || !selectedTokens.every((key, i) => source.tokens[firstIndex + i] === key)) continue
            const startTime = sameRef(selectedRange.start, source.range.start) ? 0 : source.cues.get(selectedTokens[0])?.timeStart
            const endToken = selectedTokens[selectedTokens.length - 1]
            const nextToken = source.tokens[firstIndex + selectedTokens.length]
            const endTime = sameRef(selectedRange.end, source.range.end) ? null :
              source.cues.get(endToken)?.timeEnd ?? (nextToken ? source.cues.get(nextToken)?.timeStart : undefined)
            if (startTime === undefined || endTime === undefined || (endTime !== null && endTime <= startTime)) {
              timingNeeded = true
              continue
            }
            const cues = selectedTokens.flatMap((key, i) => {
              const cue = source.cues.get(key)
              if (!cue) return []
              const following = source.cues.get(selectedTokens[i + 1])
              // Never hold a highlight across words without timing data.
              const timeEnd = cue.timeEnd ?? following?.timeStart ??
                (i === selectedTokens.length - 1 ? endTime ?? undefined : cue.timeStart)
              return [{ ...cue, ...(timeEnd === undefined ? {} : { timeEnd: endTime === null ? timeEnd : Math.min(timeEnd, endTime) }) }]
            })
            const segment = { recording: source.recording, tokenKeys: selectedTokens, cues, startTime, endTime }
            const tail = await solve(endIndex + 1, false)
            const candidate: Path = { covered: tail.covered + endIndex - index + 1, cues: tail.cues + cues.length, count: tail.count + 1,
              steps: [{ startIndex: index, endIndex, segment }, ...tail.steps] }
            if (candidate.covered > best.covered || (candidate.covered === best.covered &&
              (candidate.count < best.count || (candidate.count === best.count && candidate.cues > best.cues)))) best = candidate
          }
        }
        return best
      })()
      paths.set(key, request)
      return request
    }
    const portions: PassageAudioPortion[] = []
    const missing: RecordingRange[] = []
    let current: PassageAudioPortion | null = null
    for (const step of (await solve(0, false)).steps) {
      if (!step.segment) {
        const last = missing[missing.length - 1]
        if (!current && last) last.end = refs[step.endIndex]
        else missing.push({ start: refs[step.startIndex], end: refs[step.endIndex] })
        current = null
      } else {
        if (!current) {
          current = { range: { start: refs[step.startIndex], end: refs[step.endIndex] }, tokenKeys: [], segments: [] }
          portions.push(current)
        }
        current.range.end = refs[step.endIndex]
        current.tokenKeys.push(...step.segment.tokenKeys)
        current.segments.push(step.segment)
      }
    }
    const complete = portions.length === 1 && sameRange(portions[0].range, range)
    const cueComplete = complete && portions[0].segments.every(segment => segment.cues.length === segment.tokenKeys.length)
    timingNeeded = missing.some(gap => candidates.some(source => compareRefs(source.range.start, gap.end) <= 0 && compareRefs(source.range.end, gap.start) >= 0)) && timingNeeded
    const problem: PassageAudioProblem = complete ? cueComplete ? null : 'incomplete-cues' :
      portions.length ? 'partial-audio' : timingNeeded ? 'timing-needed' : 'missing-audio'
    const absent = refs.filter(ref => !candidates.some(source => compareRefs(source.range.start, ref) <= 0 && compareRefs(source.range.end, ref) >= 0))
    const issue = absent.length ? 'audio' : complete && cueComplete ? undefined : 'cue'
    const missingReferences = missing.map(gap =>
      [listTorahBooks().find(book => book.number === gap.start.b)?.label, passageRangeLabel(gap)].filter(Boolean).join(' '))
    const missingMessage = absent.length
      ? `Audio unavailable for ${missingReferences.join(', ')} ${missing.length === 1 ? 'portion' : 'portions'}`
      : `Excerpt timing needed: ${missingReferences.join(', ')}`
    const message = complete ? cueComplete ? '' : 'Full audio available. Some word highlighting is missing.' :
      `${missingMessage}${absent.length && timingNeeded ? '. Some excerpts also need timing cues.' : ''}`
    return { problem, message, recording: portions[0]?.segments[0]?.recording ?? candidates[0]?.recording ?? null,
      portions, missing, tokenKeys, range, cueComplete, issue, canPlay: portions.length > 0 }
  }
}

export function passagePlaybackPlan(resolution: PassageAudioResolution, portion: PassageAudioPortion,
  target: PlaybackPlan['target'], readingLabel: string): PlaybackPlan {
  return {
    target, readingLabel,
    tokenKeys: portion.tokenKeys,
    segments: portion.segments,
    status: resolution.problem === 'partial-audio' ? 'partial-passage' : 'passage',
    passage: { range: portion.range, requestedRange: resolution.range, cueComplete: portion.segments.every(segment => segment.cues.length === segment.tokenKeys.length) },
  }
}
