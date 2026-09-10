import type { RecordingIssue } from './recording-issues.ts'
import type { RefWithScroll } from '../ref.ts'

export type AudioFormat = 'mp3' | 'm4a'

export interface AudioMediaIdentity {
  algorithm: 'sha256'
  digest: string
  byteLength: number
}

export interface AudioNarrator {
  id: string
  displayName: string
  credit: string
  default?: boolean
  notes?: string
}

export interface CueReviewFlag {
  id: string
  kind: string
  message: string
  status: 'pending' | 'reviewed'
  sourceTime?: number
  note?: string
}

export interface CueReview {
  source: 'torah-audio-aligner'
  status: 'pending' | 'reviewed'
  flags: readonly CueReviewFlag[]
}

export interface WordCue {
  cueNumber?: number
  timeStart: number
  timeEnd?: number
  pageNumber: number
  lineIndex: number
  fragmentIndex: number
  wordIndex: number
  review?: CueReview
}

export type ParshaReadingIdentity = {
  kind: 'parsha'
  id: string
  name: string
  order?: number
}

export type RangeReadingIdentity = {
  kind: 'range'
  id: string
  name: string
}

export type ReadingIdentity = ParshaReadingIdentity | RangeReadingIdentity

export interface RecordingRange {
  start: RefWithScroll
  end: RefWithScroll
}

interface BaseAudioRecording {
  id: string
  narratorId: string
  reading: ReadingIdentity
  aliyah: number
  title: string
  playSrc: string
  downloadSrc: string
  format: AudioFormat
  status: 'available' | 'missing'
  mediaIdentity?: AudioMediaIdentity
  cueSrc?: string
  notes?: string
}

export interface ParshaAudioRecording extends BaseAudioRecording {
  reading: ParshaReadingIdentity
  parshaSlug: string
  parshaName: string
  parshaNumber?: number
}

export interface RangeAudioRecording extends BaseAudioRecording {
  reading: RangeReadingIdentity
  range: RecordingRange
}

export type AudioRecording = ParshaAudioRecording | RangeAudioRecording

export function isParshaAudioRecording(
  recording: AudioRecording
): recording is ParshaAudioRecording {
  return recording.reading.kind === 'parsha'
}

export function isRangeAudioRecording(
  recording: AudioRecording
): recording is RangeAudioRecording {
  return recording.reading.kind === 'range'
}

interface CueExportPayloadBase {
  audioId: string
  audioFormat: AudioFormat
  narratorId: string
  readingId: string
  aliyah: number
  tokenCount: number
  cueCount: number
  tokenizationVersion: string
  mediaIdentity?: AudioMediaIdentity
  savedAt?: string
  issues?: RecordingIssue[]
  cues: WordCue[]
}

export type CueExportPayload = CueExportPayloadBase
