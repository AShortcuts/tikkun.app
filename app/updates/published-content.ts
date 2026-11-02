import type { AudioMediaIdentity, AudioNarrator, ParshaAudioRecording } from '../audio/types.ts'
import { parseAudioMediaIdentity } from '../audio/cue-validation.ts'
import { cueFileRelativePathForRecording } from '../audio/cue-file.ts'
import { object } from './content-schema.ts'

// The website publishes the recording list and cue files here, so installed apps
// receive new recordings and cues without an app update. Change the directory only
// for an incompatible catalog format; older apps keep reading the old one.
export const PUBLISHED_CONTENT_DIRECTORY = 'content/v1'
export const PUBLISHED_CONTENT_SCHEMA = 1
export const PUBLISHED_CATALOG_MAX_BYTES = 4 * 1024 * 1024
export const PUBLISHED_CUE_MAX_BYTES = 2 * 1024 * 1024
const digestPattern = /^[a-f0-9]{64}$/
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface PublishedCatalog {
  schema: typeof PUBLISHED_CONTENT_SCHEMA
  // Fingerprint of the Torah word positions that cues point at. Apps accept only
  // catalogs made for the text they ship; adding recordings never changes it.
  textLayout: string
  narrators: AudioNarrator[]
  recordings: ParshaAudioRecording[]
  // Cue file path to the SHA-256 digest of its published bytes.
  cues: Record<string, string>
}

// What a native build was compiled with, so the app can reuse its built-in cue
// files and recognize when the website already matches them.
export interface BuiltInContent {
  digest: string
  textLayout: string
  cues: Record<string, string>
}

export function isContentDigest(value: unknown): value is string {
  return typeof value === 'string' && digestPattern.test(value)
}

export function publishedCueFileName(digest: string) {
  if (!isContentDigest(digest)) throw new Error('Invalid cue file digest')
  return `cues/${digest}.json`
}

export function parseBuiltInContent(value: unknown): BuiltInContent | null {
  if (value === undefined || value === null) return null
  if (!object(value) || !isContentDigest(value.digest) || !isContentDigest(value.textLayout) || !object(value.cues) ||
      !Object.values(value.cues).every(isContentDigest)) throw new Error('Invalid built-in content summary')
  return { digest: value.digest, textLayout: value.textLayout, cues: value.cues as Record<string, string> }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid published content: ${message}`)
}
function label(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length < 512 && !/[<>&\0]/.test(value)
}
function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}
function mediaPath(value: unknown): value is string {
  return typeof value === 'string' && /^\/audio\/[A-Za-z0-9/_.%-]+\.(?:m4a|mp3)$/.test(value) && !value.includes('..')
}

function parseNarrator(raw: unknown): AudioNarrator {
  assert(object(raw) && typeof raw.id === 'string' && slugPattern.test(raw.id) && label(raw.displayName) && label(raw.credit), 'narrator')
  assert(raw.default === undefined || typeof raw.default === 'boolean', 'narrator default')
  return { id: raw.id, displayName: raw.displayName, credit: raw.credit, ...(raw.default === undefined ? {} : { default: raw.default }) }
}

function parseRecording(raw: unknown): ParshaAudioRecording {
  assert(object(raw) && object(raw.reading) && raw.reading.kind === 'parsha', 'recording kind')
  const { reading } = raw
  assert(label(raw.id) && typeof raw.narratorId === 'string' && slugPattern.test(raw.narratorId), 'recording identity')
  assert(typeof raw.parshaSlug === 'string' && slugPattern.test(raw.parshaSlug) && reading.id === raw.parshaSlug, 'recording reading')
  assert(label(raw.parshaName) && reading.name === raw.parshaName && label(raw.title), 'recording name')
  assert(positive(raw.aliyah) && raw.aliyah <= 7 && (raw.format === 'm4a' || raw.format === 'mp3'), 'recording format')
  assert(raw.status === 'available' || raw.status === 'missing', 'recording status')
  assert(mediaPath(raw.playSrc) && mediaPath(raw.downloadSrc), 'recording media path')
  assert(raw.parshaNumber === undefined || positive(raw.parshaNumber), 'parsha number')
  assert(reading.order === undefined || positive(reading.order), 'reading order')
  const identity: AudioMediaIdentity | null = raw.mediaIdentity === undefined ? null : parseAudioMediaIdentity(raw.mediaIdentity)
  assert(raw.mediaIdentity === undefined || identity, 'media identity')
  assert(raw.status !== 'available' || identity, 'available audio requires a media identity')
  return {
    id: raw.id, narratorId: raw.narratorId, parshaSlug: raw.parshaSlug, parshaName: raw.parshaName,
    ...(raw.parshaNumber === undefined ? {} : { parshaNumber: raw.parshaNumber }),
    aliyah: raw.aliyah, title: raw.title, playSrc: raw.playSrc, downloadSrc: raw.downloadSrc,
    format: raw.format, status: raw.status, ...(identity ? { mediaIdentity: identity } : {}),
    reading: { kind: 'parsha', id: raw.parshaSlug, name: raw.parshaName,
      ...(reading.order === undefined ? {} : { order: reading.order }) },
  }
}

export function parsePublishedCatalog(value: unknown): PublishedCatalog {
  assert(object(value) && value.schema === PUBLISHED_CONTENT_SCHEMA, 'schema')
  assert(isContentDigest(value.textLayout), 'text layout')
  assert(Array.isArray(value.narrators) && value.narrators.length > 0 && value.narrators.length <= 100, 'narrators')
  assert(Array.isArray(value.recordings) && value.recordings.length <= 5000 && object(value.cues), 'collections')
  const narrators = value.narrators.map(parseNarrator)
  const narratorIds = new Set(narrators.map(narrator => narrator.id))
  assert(narratorIds.size === narrators.length, 'duplicate narrator')
  const ids = new Set<string>()
  const cuePaths = new Set<string>()
  const recordings = value.recordings.map((raw) => {
    const recording = parseRecording(raw)
    assert(narratorIds.has(recording.narratorId), `unknown narrator for ${recording.id}`)
    const cuePath = cueFileRelativePathForRecording(recording)
    assert(cuePath && !ids.has(recording.id) && !cuePaths.has(cuePath), `duplicate recording ${recording.id}`)
    ids.add(recording.id)
    cuePaths.add(cuePath)
    return recording
  })
  const cues: Record<string, string> = {}
  for (const [path, digest] of Object.entries(value.cues)) {
    assert(cuePaths.has(path) && isContentDigest(digest), `cue file ${path}`)
    cues[path] = digest
  }
  return { schema: PUBLISHED_CONTENT_SCHEMA, textLayout: value.textLayout, narrators, recordings, cues }
}
