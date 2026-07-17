import { expect, test } from 'vitest'
import {
  createAliyahVideoManifest,
  findVideoForRecording,
  getCompleteCueEligibleRecordings,
  mergeVideoLinks,
  parseVideoLinkRegistry,
  parseVideoRenderMetadataList,
  videoMetadataMatchesProvenance,
} from './library.ts'
import type { ParshaAudioRecording } from '../audio/types.ts'
import type { VideoLinkRegistry, VideoRenderMetadata } from './types.ts'

const audioHash = 'a'.repeat(64)
const cueHash = 'b'.repeat(64)
const appBuildHash = 'c'.repeat(40)

const recording = (
  overrides: Partial<ParshaAudioRecording> = {}
): ParshaAudioRecording => ({
  id: 'bereshit-1',
  narratorId: 'yoni-davidov',
  reading: { kind: 'parsha', id: 'bereshit', name: 'Bereshit', order: 1 },
  parshaSlug: 'bereshit',
  parshaName: 'Bereshit',
  parshaNumber: 1,
  aliyah: 1,
  title: 'Bereshit Aliyah 1',
  playSrc: '/audio/bereshit-1.m4a',
  downloadSrc: '/audio/bereshit-1.m4a',
  format: 'm4a',
  status: 'available',
  ...overrides,
})

const metadata = (
  overrides: Partial<VideoRenderMetadata> = {}
): VideoRenderMetadata => ({
  audioId: 'bereshit-1',
  narratorId: 'yoni-davidov',
  narratorInitials: 'yd',
  parshaSlug: 'bereshit',
  aliyah: 1,
  title: 'Bereshit Aliyah 1',
  fileName: 'bereshit-1_yd_1080p30_a1b2c3d4.mp4',
  width: 1920,
  height: 1080,
  fps: 30,
  durationSeconds: 10,
  frameCount: 300,
  bytes: 10_000_000,
  quality: '1080p30',
  renderMode: 'cue-keyframes',
  capturedFrameCount: 120,
  crop: {
    x: 268,
    y: 0,
    width: 1384,
    height: 1080,
  },
  generatedAt: '2026-05-03T12:00:00.000Z',
  generatedFrom: {
    audioHash,
    cueHash,
    appBuildHash,
  },
  validation: {
    passed: true,
    errors: [],
    warnings: [],
  },
  ...overrides,
})

test('complete cue eligibility requires available recording and full token coverage', () => {
  const complete = recording()
  const incomplete = recording({ id: 'bereshit-2', aliyah: 2 })
  const unavailable = recording({
    id: 'bereshit-3',
    aliyah: 3,
    status: 'missing',
  })

  const eligible = getCompleteCueEligibleRecordings({
    recordings: [complete, incomplete, unavailable],
    cueCountByAudioId: new Map([
      [complete.id, 3],
      [incomplete.id, 2],
      [unavailable.id, 3],
    ]),
    tokenCountByAudioId: new Map([
      [complete.id, 3],
      [incomplete.id, 3],
      [unavailable.id, 3],
    ]),
  })

  expect(eligible.map((entry) => entry.id)).toEqual(['bereshit-1'])
})

test('video links merge only validated metadata with registered Koofr links', () => {
  const links: VideoLinkRegistry = {
    'bereshit-1': {
      videoSrc: 'https://koofr.eu/links/video',
      downloadSrc: 'https://koofr.eu/links/download',
    },
    'bereshit-2': {
      videoSrc: 'https://koofr.eu/links/unvalidated',
      downloadSrc: 'https://koofr.eu/links/unvalidated',
    },
  }

  const manifest = mergeVideoLinks({
    metadata: [
      metadata(),
      metadata({
        audioId: 'bereshit-2',
        validation: {
          passed: false,
          errors: ['ffmpeg decode failed'],
          warnings: [],
        },
      }),
      metadata({ audioId: 'bereshit-3' }),
    ],
    links,
  })

  expect(manifest.length).toBe(1)
  expect(manifest[0]).toMatchObject({
    audioId: 'bereshit-1',
    videoSrc: 'https://koofr.eu/links/video',
    downloadSrc: 'https://koofr.eu/links/download',
    fps: 30,
    renderMode: 'cue-keyframes',
    capturedFrameCount: 120,
  })
})

test('generated manifest preserves audio metadata and excludes recordings without links', () => {
  const manifest = createAliyahVideoManifest({
    recordings: [recording(), recording({ id: 'bereshit-2', aliyah: 2 })],
    metadata: [metadata(), metadata({ audioId: 'bereshit-2', aliyah: 2 })],
    links: {
      'bereshit-1': {
        videoSrc: 'https://koofr.eu/links/video',
        downloadSrc: 'https://koofr.eu/links/download',
      },
    },
  })

  expect(manifest.length).toBe(1)
  expect(manifest[0]).toMatchObject({
    audioId: 'bereshit-1',
    narratorId: 'yoni-davidov',
    narratorInitials: 'yd',
    parshaSlug: 'bereshit',
    aliyah: 1,
    title: 'Bereshit Aliyah 1',
  })
})

test('generated manifest excludes videos whose current provenance changed', () => {
  const currentProvenanceByAudioId = new Map([
    [
      'bereshit-1',
      {
        audioHash: 'd'.repeat(64),
        cueHash,
        appBuildHash,
      },
    ],
  ])
  const manifest = createAliyahVideoManifest({
    recordings: [recording()],
    metadata: [metadata()],
    links: {
      'bereshit-1': {
        videoSrc: 'https://koofr.eu/links/video',
        downloadSrc: 'https://koofr.eu/links/download',
      },
    },
    currentProvenanceByAudioId,
  })

  expect(manifest).toEqual([])
  expect(
    videoMetadataMatchesProvenance(metadata(), {
      audioHash,
    })
  ).toBe(true)
})

test('generated manifest rejects duplicate or mismatched identities', () => {
  const links: VideoLinkRegistry = {
    'bereshit-1': {
      videoSrc: 'https://koofr.eu/links/video',
      downloadSrc: 'https://koofr.eu/links/download',
    },
  }

  expect(() =>
    createAliyahVideoManifest({
      recordings: [recording(), recording()],
      metadata: [metadata()],
      links,
    })
  ).toThrow(/Duplicate audio recording id/)
  expect(() =>
    createAliyahVideoManifest({
      recordings: [recording()],
      metadata: [metadata(), metadata()],
      links,
    })
  ).toThrow(/Duplicate video metadata audio id/)
  expect(() =>
    createAliyahVideoManifest({
      recordings: [recording()],
      metadata: [metadata({ narratorId: 'another-reader' })],
      links,
    })
  ).toThrow(/does not match recording/)
})

test('local video registries are parsed before publication', () => {
  expect(parseVideoRenderMetadataList([metadata()])).toEqual([metadata()])
  expect(() =>
    parseVideoRenderMetadataList([metadata({ durationSeconds: Number.NaN })])
  ).toThrow(/Invalid video render metadata/)
  expect(
    parseVideoLinkRegistry({
      'bereshit-1': {
        videoSrc: 'https://koofr.eu/links/video',
        downloadSrc: 'https://koofr.eu/links/download',
      },
    })
  ).toHaveProperty('bereshit-1')
  expect(() =>
    parseVideoLinkRegistry({
      'bereshit-1': {
        videoSrc: 'javascript:alert(1)',
        downloadSrc: 'https://koofr.eu/links/download',
      },
    })
  ).toThrow(/Invalid video link registry entry/)
})

test('findVideoForRecording returns null when a recording has no manifest entry', () => {
  const manifest = [
    {
      ...metadata(),
      videoSrc: 'https://koofr.eu/links/video',
      downloadSrc: 'https://koofr.eu/links/download',
    },
  ]

  expect(findVideoForRecording('bereshit-1', manifest)?.downloadSrc).toBe(manifest[0].downloadSrc)
  expect(findVideoForRecording('bereshit-2', manifest)).toBe(null)
})
