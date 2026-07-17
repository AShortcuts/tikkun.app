import { stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import {
  audioNarrators,
  audioRecordings as parshaAudioRecordings,
  audioRecordingsByParsha,
} from './audio-manifest.generated.ts'
import { audioRecordings } from './audio-catalog.ts'
import { aliyahVideos } from './video-manifest.generated.ts'

const publishedCuePayloads = import.meta.glob<unknown>('./audio-cues/**/*.json', {
  eager: true,
  import: 'default',
})
const pagePayloads = import.meta.glob<unknown>('./pages/**/*.json', {
  eager: true,
  import: 'default',
})
const tocPayloads = import.meta.glob<unknown>('./tables-of-contents/*.json', {
  eager: true,
  import: 'default',
})
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>()
  return values.filter((value) => {
    if (seen.has(value)) return true
    seen.add(value)
    return false
  })
}

test('generated audio and video catalogs have unique, internally consistent identities', async () => {
  expect(audioNarrators.length).toBeGreaterThan(0)
  expect(duplicateValues(audioNarrators.map((narrator) => narrator.id))).toEqual([])
  expect(audioNarrators.filter((narrator) => narrator.default)).toHaveLength(1)
  expect(duplicateValues(audioRecordings.map((recording) => recording.id))).toEqual([])
  expect(duplicateValues(audioRecordings.map((recording) => recording.playSrc))).toEqual([])

  const knownNarrators = new Set(audioNarrators.map((narrator) => narrator.id))
  const knownRecordingIds = new Set(audioRecordings.map((recording) => recording.id))
  const catalogSlots = new Set<string>()
  for (const recording of audioRecordings) {
    expect(knownNarrators.has(recording.narratorId), recording.id).toBe(true)
    expect(recording.aliyah, recording.id).toBeGreaterThanOrEqual(1)
    expect(recording.aliyah, recording.id).toBeLessThanOrEqual(7)
    const slot = `${recording.narratorId}:${recording.reading.id}:${recording.aliyah}`
    expect(catalogSlots.has(slot), recording.id).toBe(false)
    catalogSlots.add(slot)

    if (recording.status === 'available' && recording.playSrc.startsWith('/')) {
      const publicPath = decodeURIComponent(
        new URL(recording.playSrc, 'https://tikkun.local').pathname
      ).replace(/^\/+/, '')
      const mediaPath = path.resolve(repoRoot, 'static', publicPath)
      expect(mediaPath.startsWith(path.resolve(repoRoot, 'static') + path.sep)).toBe(true)
      const mediaStat = await stat(mediaPath)
      expect(mediaStat.isFile(), recording.id).toBe(true)
      if (recording.mediaIdentity) {
        expect(recording.mediaIdentity.algorithm, recording.id).toBe('sha256')
        expect(recording.mediaIdentity.digest, recording.id).toMatch(/^[a-f0-9]{64}$/)
        expect(recording.mediaIdentity.byteLength, recording.id).toBe(mediaStat.size)
      }
    }
  }

  for (const [parshaSlug, recordings] of Object.entries(audioRecordingsByParsha)) {
    expect(recordings.length, parshaSlug).toBeGreaterThan(0)
    expect(recordings.every((recording) => recording.parshaSlug === parshaSlug)).toBe(true)
    expect(duplicateValues(recordings.map((recording) => String(recording.aliyah)))).toEqual(
      []
    )
  }
  expect(
    new Set(Object.values(audioRecordingsByParsha).flat().map((recording) => recording.id))
  ).toEqual(new Set(parshaAudioRecordings.map((recording) => recording.id)))

  expect(duplicateValues(aliyahVideos.map((video) => video.audioId))).toEqual([])
  for (const video of aliyahVideos) {
    expect(knownRecordingIds.has(video.audioId), video.audioId).toBe(true)
    expect(video.generatedFrom.audioHash, video.audioId).not.toBe('')
    expect(video.generatedFrom.cueHash, video.audioId).not.toBe('')
    expect(video.generatedFrom.appBuildHash, video.audioId).not.toBe('')
  }
})

test('published cue files refer to exactly one generated audio recording', () => {
  const recordingsById = new Map(
    audioRecordings.map((recording) => [recording.id, recording])
  )
  const cueAudioIds: string[] = []
  for (const [cuePath, payload] of Object.entries(publishedCuePayloads)) {
    expect(isRecord(payload), cuePath).toBe(true)
    if (!isRecord(payload)) continue
    expect(typeof payload.audioId, cuePath).toBe('string')
    if (typeof payload.audioId !== 'string') continue
    cueAudioIds.push(payload.audioId)
    const recording = recordingsById.get(payload.audioId)
    expect(recording, cuePath).toBeDefined()
    if (!recording) continue
    expect(payload.narratorId, cuePath).toBe(recording.narratorId)
    expect(payload.audioFormat, cuePath).toBe(recording.format)
    expect(payload.aliyah, cuePath).toBe(recording.aliyah)
  }
  expect(duplicateValues(cueAudioIds)).toEqual([])
})

test('Page Data files are contiguous and every rendered line has a valid shape', () => {
  const pageNumbersByScroll = new Map<string, number[]>()
  for (const [pagePath, payload] of Object.entries(pagePayloads)) {
    const match = /\/pages\/([^/]+)\/(\d+)\.json$/.exec(pagePath)
    expect(match, pagePath).not.toBeNull()
    if (!match) continue
    const [, scroll, pageText] = match
    const pageNumber = Number(pageText)
    const pageNumbers = pageNumbersByScroll.get(scroll) ?? []
    pageNumbers.push(pageNumber)
    pageNumbersByScroll.set(scroll, pageNumbers)

    expect(Array.isArray(payload), pagePath).toBe(true)
    if (!Array.isArray(payload)) continue
    for (const [lineIndex, line] of payload.entries()) {
      const label = `${pagePath} line ${lineIndex + 1}`
      expect(isRecord(line), label).toBe(true)
      if (!isRecord(line)) continue
      expect(Array.isArray(line.text), label).toBe(true)
      expect((line.text as unknown[]).flat(2).every((value) => typeof value === 'string'), label)
        .toBe(true)
      expect(Array.isArray(line.verses), label).toBe(true)
      expect(Array.isArray(line.aliyot), label).toBe(true)
      expect(typeof line.isPetucha, label).toBe('boolean')
      for (const verse of Array.isArray(line.verses) ? line.verses : []) {
        expect(isRecord(verse), label).toBe(true)
        if (!isRecord(verse)) continue
        expect(Number.isSafeInteger(verse.book), label).toBe(true)
        expect(Number.isSafeInteger(verse.chapter), label).toBe(true)
        expect(Number.isSafeInteger(verse.verse), label).toBe(true)
      }
    }
  }

  for (const [scroll, pageNumbers] of pageNumbersByScroll) {
    pageNumbers.sort((left, right) => left - right)
    expect(pageNumbers, scroll).toEqual(
      Array.from(
        { length: pageNumbers[pageNumbers.length - 1] ?? 0 },
        (_, index) => index + 1
      )
    )
  }
})

test('TOC locations reference existing Page Data and Torah mappings are bidirectional', () => {
  const pagesByKey = new Map(
    Object.entries(pagePayloads).map(([pagePath, payload]) => {
      const match = /\/pages\/([^/]+)\/(\d+)\.json$/.exec(pagePath)
      return [match ? `${match[1]}:${match[2]}` : pagePath, payload]
    })
  )

  for (const [tocPath, toc] of Object.entries(tocPayloads)) {
    const scroll = /\/([^/]+)\.json$/.exec(tocPath)?.[1]
    expect(scroll, tocPath).toBeDefined()
    expect(isRecord(toc), tocPath).toBe(true)
    if (!scroll || !isRecord(toc)) continue

    for (const [book, chapters] of Object.entries(toc)) {
      expect(isRecord(chapters), `${tocPath} book ${book}`).toBe(true)
      if (!isRecord(chapters)) continue
      for (const [chapter, verses] of Object.entries(chapters)) {
        expect(isRecord(verses), `${tocPath} ${book}:${chapter}`).toBe(true)
        if (!isRecord(verses)) continue
        for (const [verse, location] of Object.entries(verses)) {
          const label = `${tocPath} ${book}:${chapter}:${verse}`
          expect(isRecord(location), label).toBe(true)
          if (!isRecord(location)) continue
          expect(Number.isSafeInteger(location.p), label).toBe(true)
          expect(Number.isSafeInteger(location.l), label).toBe(true)
          expect(Number(location.p), label).toBeGreaterThan(0)
          expect(Number(location.l), label).toBeGreaterThan(0)
          const page = pagesByKey.get(`${scroll}:${location.p}`)
          expect(Array.isArray(page), label).toBe(true)

          if (scroll === 'torah' && Array.isArray(page)) {
            const line = page[Number(location.l) - 1]
            expect(isRecord(line), label).toBe(true)
            const matchingVerse =
              isRecord(line) && Array.isArray(line.verses)
                ? line.verses.some(
                    (candidate) =>
                      isRecord(candidate) &&
                      String(candidate.book) === book &&
                      String(candidate.chapter) === chapter &&
                      String(candidate.verse) === verse
                  )
                : false
            expect(matchingVerse, label).toBe(true)
          }
        }
      }
    }
  }
})
