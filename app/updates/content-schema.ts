import type { LineType } from '../components/Page.ts'
import type { AudioRecording, CueExportPayload } from '../audio/types.ts'
import { parseAudioMediaIdentity, parseCueExportPayload, cuePayloadMatchesRecording } from '../audio/cue-validation.ts'
import { TOKENIZATION_VERSION } from '../audio/cue-schema.ts'
import { canonicalLineWords } from '../reader/canonical-line-words.ts'

export const CONTENT_MAX_BYTES = 12 * 1024 * 1024
export const CONTENT_SCHEMA = 1
export interface ContentSnapshot {
  schema: 1
  pages: Record<string, LineType[]>
  recordings: AudioRecording[]
  cues: Record<string, CueExportPayload>
}

export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length < 4096 && !/[<>&]/.test(value) && !value.includes('\0')
}
function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid content update: ${message}`)
}
export async function digestText(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function parseContentSnapshot(value: unknown): ContentSnapshot {
  assert(object(value) && value.schema === CONTENT_SCHEMA, 'schema')
  assert(object(value.pages) && object(value.cues) && Array.isArray(value.recordings), 'collections')
  const pages: ContentSnapshot['pages'] = {}
  for (const [key, raw] of Object.entries(value.pages)) {
    assert(/^(torah|esther)\/[1-9]\d{0,2}$/.test(key) && Array.isArray(raw) && raw.length <= 100, 'page')
    pages[key] = raw.map((line): LineType => {
      assert(object(line) && Array.isArray(line.text) && Array.isArray(line.verses) && Array.isArray(line.aliyot) && typeof line.isPetucha === 'boolean', 'line')
      const columns = line.text.map((column): string[] => {
        assert(Array.isArray(column) && column.length < 100, 'column')
        return column.map((fragment) => { assert(typeof fragment === 'string' && fragment.length < 4096 && !/[<>&]/.test(fragment) && !fragment.includes('\0'), 'text'); return fragment })
      })
      const verses = line.verses.map((verse) => {
        assert(object(verse) && positive(verse.book) && positive(verse.chapter) && positive(verse.verse), 'verse')
        return { book: verse.book, chapter: verse.chapter, verse: verse.verse }
      })
      const aliyot = line.aliyot.map((aliyah) => {
        assert(object(aliyah) && positive(aliyah.standard) && aliyah.standard <= 8, 'aliyah')
        assert(aliyah.double === undefined || (positive(aliyah.double) && aliyah.double <= 8), 'double aliyah')
        return { standard: aliyah.standard, ...(typeof aliyah.double === 'number' ? { double: aliyah.double } : {}) }
      })
      return { text: columns, verses, aliyot, isPetucha: line.isPetucha }
    })
  }
  assert(Object.keys(pages).length > 0 && Object.keys(pages).length <= 1000, 'page count')
  const ids = new Set<string>()
  const slots = new Set<string>()
  const recordings = value.recordings.map((raw): AudioRecording => {
    assert(object(raw) && object(raw.reading) && raw.reading.kind === 'parsha', 'recording kind')
    assert(text(raw.id) && text(raw.narratorId) && text(raw.parshaSlug) && /^[a-z0-9-]+$/.test(raw.parshaSlug), 'recording identity')
    assert(raw.reading.id === raw.parshaSlug && text(raw.parshaName) && raw.reading.name === raw.parshaName && text(raw.title), 'recording name')
    assert(positive(raw.aliyah) && raw.aliyah <= 7 && (raw.format === 'm4a' || raw.format === 'mp3'), 'recording format')
    assert(raw.status === 'available' || raw.status === 'missing', 'recording status')
    const mediaPath = (path: unknown) => typeof path === 'string' && /^\/audio\/[a-z0-9/_.-]+\.(m4a|mp3)$/.test(path) && !path.includes('..')
    assert(mediaPath(raw.playSrc) && mediaPath(raw.downloadSrc) && raw.playSrc === raw.downloadSrc, 'media path')
    assert(typeof raw.playSrc === 'string' && typeof raw.downloadSrc === 'string', 'media URL')
    const identity = parseAudioMediaIdentity(raw.mediaIdentity)
    assert(raw.status !== 'available' || identity, 'available audio requires an identity')
    const slot = `${raw.narratorId}:${raw.parshaSlug}:${raw.aliyah}`
    assert(!ids.has(raw.id) && !slots.has(slot), 'duplicate recording')
    ids.add(raw.id); slots.add(slot)
    assert(raw.parshaNumber === undefined || positive(raw.parshaNumber), 'parsha order')
    return { id: raw.id, narratorId: raw.narratorId, reading: { kind: 'parsha', id: raw.parshaSlug, name: raw.parshaName },
      parshaSlug: raw.parshaSlug, parshaName: raw.parshaName, aliyah: raw.aliyah, title: raw.title,
      playSrc: raw.playSrc, downloadSrc: raw.downloadSrc, format: raw.format, status: raw.status,
      ...(typeof raw.parshaNumber === 'number' ? { parshaNumber: raw.parshaNumber } : {}),
      ...(identity ? { mediaIdentity: identity } : {}) }
  })
  assert(recordings.length > 0 && recordings.length <= 2000, 'recording count')
  const byId = new Map(recordings.map(recording => [recording.id, recording]))
  const cues: ContentSnapshot['cues'] = {}
  const tokens = new Map<string, Set<string>>()
  for (const [key, raw] of Object.entries(value.cues)) {
    const cue = parseCueExportPayload(raw)
    assert(cue && (cue.cues.length === 0 || cue.tokenizationVersion === TOKENIZATION_VERSION), `cue schema: ${key}`)
    const recording = byId.get(cue.audioId)
    assert(recording && (cue.cues.length === 0 || cue.mediaIdentity) && cuePayloadMatchesRecording(cue, recording), `cue/audio identity: ${key}`)
    assert(key === `audio-cues/${recording.narratorId}/${recording.reading.id}/${recording.aliyah}.json`, 'cue path')
    for (const position of cue.cues) {
      const pageKey = `torah/${position.pageNumber}`
      const page = pages[pageKey]
      assert(page, 'cue page')
      let pageTokens = tokens.get(pageKey)
      if (!pageTokens) {
        pageTokens = new Set(page.flatMap((line, index) => canonicalLineWords(position.pageNumber, index, line).map(word => word.tokenKey)))
        tokens.set(pageKey, pageTokens)
      }
      assert(pageTokens.has(`${position.pageNumber}:${position.lineIndex}:${position.fragmentIndex}:${position.wordIndex}`), 'cue token')
    }
    cues[key] = cue.cues.length ? cue : { ...cue, tokenizationVersion: TOKENIZATION_VERSION }
  }
  return { schema: CONTENT_SCHEMA, pages, recordings, cues }
}

// Keep physical addresses, verse indexes and token positions compatible with the
// installed Reader. Structural changes require a new native/web app release.
export async function contentCompatibility(snapshot: ContentSnapshot) {
  return digestText(JSON.stringify({ schema: CONTENT_SCHEMA, tokens: TOKENIZATION_VERSION,
    pages: Object.entries(snapshot.pages).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, lines]) => [key, lines.map((line, index) => ({
      verses: line.verses, aliyot: line.aliyot, isPetucha: line.isPetucha,
      words: canonicalLineWords(1, index, line).map(word => word.tokenKey),
    }))]),
    narrators: [...new Set(snapshot.recordings.map(recording => recording.narratorId))].sort(),
    readings: [...new Set(snapshot.recordings.map(recording => recording.reading.id))].sort(),
  }))
}
