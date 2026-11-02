import { createHash } from 'node:crypto'
import type { AudioNarrator, AudioRecording } from '../audio/types.ts'
import { createPublishedContent } from '../../scripts/published-content.ts'
import type { ContentStore } from './content-session.ts'

export const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

export const narrators: AudioNarrator[] = [
  { id: 'yoni-davidov', displayName: 'Yoni Davidov', credit: 'Recordings by Yoni Davidov', default: true },
]

export function recording(aliyah: number, digest = String(aliyah).repeat(64).slice(0, 64)): AudioRecording {
  return {
    id: `beresheet-${aliyah}`, narratorId: 'yoni-davidov', parshaSlug: 'beresheet', parshaName: 'Beresheet',
    parshaNumber: 1, aliyah, title: `Beresheet Aliyah ${aliyah}`,
    playSrc: `/audio/yoni-davidov/01%20beresheet/${aliyah}.m4a`, downloadSrc: `/audio/yoni-davidov/01%20beresheet/${aliyah}.m4a`,
    format: 'm4a', status: 'available', mediaIdentity: { algorithm: 'sha256', digest, byteLength: 100 },
    notes: 'Source file: private name.m4a',
    reading: { kind: 'parsha', id: 'beresheet', name: 'Beresheet', order: 1 },
  }
}

type TextPages = Parameters<typeof createPublishedContent>[0]['pages']
type TextLine = TextPages[number][1][number]
const line: TextLine = {
  text: [['\u05d1\u05e8\u05d0\u05e9\u05d9\u05ea \u05d1\u05e8\u05d0']],
  verses: [{ book: 1, chapter: 1, verse: 1 }],
  aliyot: [{ standard: 1 }],
}
export const textWith = (changes: Partial<TextLine> = {}): TextPages => [[1, [{ ...line, ...changes }]]]
export const pages = textWith()

export const cuePath = (aliyah: number) => `audio-cues/yoni-davidov/01 beresheet/${aliyah}.json`
export const cue = (aliyah: number, timeStart = 0) => JSON.stringify({
  audioId: `beresheet-${aliyah}`, cues: [{ timeStart, pageNumber: 1, lineIndex: 0, fragmentIndex: 0, wordIndex: 0 }],
}, null, 2)

export function publish(recordings: AudioRecording[], cues: Record<string, string>, textPages: TextPages = pages) {
  return createPublishedContent({ narrators, recordings, pages: textPages, readCueFile: (path) => cues[path] ?? null })
}

export function memoryStore(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial))
  const store = {
    files,
    read: async (name: string) => files.get(name) ?? null,
    write: async (name: string, value: string) => { files.set(name, value) },
    prune: async (keep: readonly string[]) => {
      for (const name of [...files.keys()]) if (name.startsWith('cues/') && !keep.includes(name)) files.delete(name)
    },
  } satisfies ContentStore & { files: Map<string, string> }
  return store
}
