export type AudioFormat = 'mp3' | 'm4a'

export interface AudioNarrator {
  id: string
  displayName: string
  credit: string
  default?: boolean
  notes?: string
}

export interface WordCue {
  cueNumber?: number
  timeStart: number
  timeEnd?: number
  pageNumber: number
  lineIndex: number
  fragmentIndex: number
  wordIndex: number
}

export interface AudioRecording {
  id: string
  narratorId: string
  parshaSlug: string
  parshaName: string
  parshaNumber?: number
  aliyah: number
  title: string
  playSrc: string
  downloadSrc: string
  format: AudioFormat
  status: 'available' | 'missing'
  cueSrc?: string
  notes?: string
}

export interface CueExportPayload {
  audioId: string
  audioFormat: AudioFormat
  narratorId: string
  parshaSlug: string
  aliyah: number
  tokenCount: number
  cueCount: number
  tokenizationVersion: string
  audioVersion?: string
  cues: WordCue[]
}
