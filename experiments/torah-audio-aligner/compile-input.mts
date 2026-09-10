import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { audioRecordings } from '../../generated/audio-manifest.ts'
import { rangeAudioRecordings } from '../../app/data/range-audio-manifest.ts'
import { TOKENIZATION_VERSION } from '../../app/audio/cue-schema.ts'
import { parseCueExportPayload, cuePayloadMatchesRecording } from '../../app/audio/cue-validation.ts'
import type { LineType } from '../../app/components/Page.ts'
import { canonicalLineWords } from '../../app/reader/canonical-line-words.ts'
import { tokenizeReaderWords } from '../../app/reader/word-tokenization.ts'
import textFilter from '../../app/text-filter.ts'
import { verseStartSequenceIndex } from '../../app/reading/exact-token-range.ts'
import { readCanonicalTokenKeysForRecordings } from '../../scripts/public-reading-tokens.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const readJson = async (relative: string) => JSON.parse(await readFile(path.join(root, relative), 'utf8'))
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const arguments_ = process.argv.slice(2)
if (arguments_.length && (arguments_.length !== 2 || arguments_[0] !== '--manifest')) throw new Error('Expected --manifest PATH')
const manifestAbsolute = path.resolve(root, arguments_[1] ?? 'docs/research/torah-audio-aligner/pilot-manifest.json')
const manifestPath = path.relative(root, manifestAbsolute)
if (manifestPath.startsWith('..') || path.isAbsolute(manifestPath)) throw new Error('Manifest must remain in the repository')
const manifest = await readJson(manifestPath)
const inputs = [...(manifest.initialSmokeTest ? [manifest.initialSmokeTest] : []), ...manifest.inputs]
if (!inputs.length) throw new Error('Manifest has no recordings')
const selected = inputs.map((input: { audioId: string; narratorId: string }) => {
  const matches = [...audioRecordings, ...rangeAudioRecordings].filter(
    (recording) => recording.id === input.audioId && recording.narratorId === input.narratorId,
  )
  if (matches.length !== 1) throw new Error(`Expected one recording for ${input.audioId}`)
  return matches[0]
})
const referenceDate = '2026-09-08T16:00:00Z'
const canonical = await readCanonicalTokenKeysForRecordings({
  recordings: selected, repoRoot: root, now: new Date(referenceDate),
})
const pageRoot = 'text/pages/torah'
const pages = (await readdir(path.join(root, pageRoot)))
  .filter((name) => /^\d+\.json$/.test(name)).sort((a, b) => parseInt(a) - parseInt(b))
const pageHash = createHash('sha256')
const tokens = new Map<string, object>()
let previousWords: ReturnType<typeof canonicalLineWords> = []
let currentVerse: LineType['verses'][number] | undefined
for (const filename of pages) {
  const bytes = await readFile(path.join(root, pageRoot, filename))
  pageHash.update(filename + '\0').update(bytes).update('\0')
  const lines: LineType[] = JSON.parse(bytes.toString('utf8'))
  lines.forEach((line, lineIndex) => {
    const words = canonicalLineWords(parseInt(filename), lineIndex, line)
    const starts = new Map(line.verses.map((verse, verseOrdinal) => [
      verseStartSequenceIndex({ currentLineWords: words, previousLineWords: previousWords, verseOrdinal }), verse,
    ]))
    words.forEach((word, ordinal) => {
      currentVerse = starts.get(ordinal) ?? currentVerse
      if (!currentVerse) throw new Error(`Missing verse for ${word.tokenKey}`)
      const [pageNumber, , fragmentIndex, wordIndex] = word.tokenKey.split(':').map(Number)
      const sourceFragment = line.text[Math.floor(fragmentIndex / 100)][fragmentIndex % 100]
      const variant = tokenizeReaderWords(textFilter({ text: sourceFragment, annotated: true }))[wordIndex]
      if (tokens.has(word.tokenKey)) throw new Error(`Duplicate token ${word.tokenKey}`)
      tokens.set(word.tokenKey, {
        tokenKey: word.tokenKey, annotatedText: word.annotatedText,
        position: { pageNumber, lineIndex, fragmentIndex, wordIndex },
        verse: { ...currentVerse }, sourceFragment, usesQere: variant.isKri,
      })
    })
    if (words.length) previousWords = words
  })
}
const textPagesSha256 = pageHash.digest('hex')
if (textPagesSha256 !== manifest.textPagesSha256) throw new Error('Text changed since pilot preparation; refresh the pilot explicitly')
const compilerSources: Record<string, string> = {}
const provenanceSources: Record<string, string> = {}
for (const relative of [
  'generated/audio-manifest.ts', 'app/data/range-audio-manifest.ts',
  'app/audio/cue-schema.ts', 'app/audio/cue-validation.ts',
  'app/reader/canonical-line-words.ts', 'app/reader/word-tokenization.ts',
  'app/text-filter.ts', 'app/reading/exact-token-range.ts',
  'scripts/public-reading-tokens.ts',
]) compilerSources[relative] = hash(await readFile(path.join(root, relative)))
for (const relative of [manifestPath, 'experiments/torah-audio-aligner/compile-input.mts']) {
  provenanceSources[relative] = hash(await readFile(path.join(root, relative)))
}
const recordings = []
const evaluation = []
for (const [index, recording] of selected.entries()) {
  const input = inputs[index]
  const mediaPath = path.join('site', recording.playSrc)
  if (mediaPath !== input.mediaPath) throw new Error(`Media path changed: ${recording.id}`)
  const bytes = await readFile(path.join(root, mediaPath))
  const mediaIdentity = { algorithm: 'sha256', digest: hash(bytes), byteLength: bytes.length }
  if (mediaIdentity.digest !== input.mediaIdentity.digest || mediaIdentity.byteLength !== input.mediaIdentity.byteLength ||
      mediaIdentity.digest !== recording.mediaIdentity?.digest) throw new Error(`Media identity mismatch: ${recording.id}`)
  const keys = canonical.get(recording.id)
  if (!keys?.length) throw new Error(`Missing canonical tokens: ${recording.id}`)
  const cue = input.legacyCuePath == null ? null : parseCueExportPayload(await readJson(input.legacyCuePath))
  if (input.legacyCuePath != null) {
    if (!cue || !cuePayloadMatchesRecording(cue, recording) || cue.tokenizationVersion !== TOKENIZATION_VERSION) {
      throw new Error(`Legacy cues do not match recording: ${recording.id}`)
    }
    const legacyKeys = cue.cues.map((entry) => [entry.pageNumber, entry.lineIndex, entry.fragmentIndex, entry.wordIndex].join(':'))
    if (keys.length !== legacyKeys.length || keys.some((key, i) => key !== legacyKeys[i])) {
      throw new Error(`Legacy canonical sequence mismatch: ${recording.id}`)
    }
  }
  recordings.push({
    audioId: recording.id, narratorId: recording.narratorId, title: recording.title,
    readingId: recording.reading.id, audioFormat: recording.format, aliyah: recording.aliyah,
    split: input.split ?? (index === 0 ? 'development' : ['beresheet-1', 'haazinu-4'].includes(recording.id) ? 'calibration' : 'evaluation'),
    mediaPath, mediaIdentity, durationSeconds: input.durationSeconds,
    tokens: keys.map((key) => {
      const token = tokens.get(key)
      if (!token) throw new Error(`Missing display token: ${key}`)
      return token
    }),
  })
  evaluation.push({
    audioId: recording.id, mediaIdentity,
    sourcePath: input.legacyCuePath ?? null,
    sourceSha256: input.legacyCuePath == null ? null : hash(await readFile(path.join(root, input.legacyCuePath))),
    kind: cue ? 'legacy-playback-starts-not-acoustic-ground-truth' : 'unlabeled-no-cue-reference',
    cues: cue?.cues.map((entry, i) => ({ tokenKey: keys[i], timeStart: entry.timeStart, excludedFromTiming: i === 0 })) ?? [],
  })
}
console.log(JSON.stringify({
  input: {
    schemaVersion: 'torah-aligner-input-v1', tokenizationVersion: TOKENIZATION_VERSION,
    referenceDate, textPagesSha256, compilerSources, provenanceSources,
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    recordings,
  },
  evaluation: { schemaVersion: 'torah-aligner-legacy-v1', textPagesSha256, recordings: evaluation },
}))
