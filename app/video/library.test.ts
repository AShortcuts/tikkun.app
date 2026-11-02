import { expect, test } from 'vitest'
import { createAliyahVideoManifest, getCompleteCueEligibleRecordings, videoMetadataMatchesProvenance } from './library.ts'
import type { ParshaAudioRecording } from '../audio/types.ts'
import type { VideoLinkRegistry, VideoRenderMetadata } from './types.ts'

const audioHash = 'a'.repeat(64)
const cueHash = 'b'.repeat(64)
const appBuildHash = 'c'.repeat(40)

const recording = (
  overrides: Partial<ParshaAudioRecording> = {}
): ParshaAudioRecording => ({
  id: 'beresheet-1',
  narratorId: 'yoni-davidov',
  reading: { kind: 'parsha', id: 'beresheet', name: 'Beresheet', order: 1 },
  parshaSlug: 'beresheet',
  parshaName: 'Beresheet',
  parshaNumber: 1,
  aliyah: 1,
  title: 'Beresheet Aliyah 1',
  playSrc: '/audio/beresheet-1.m4a',
  downloadSrc: '/audio/beresheet-1.m4a',
  format: 'm4a',
  status: 'available',
  ...overrides,
})

const metadata = (
  overrides: Partial<VideoRenderMetadata> = {}
): VideoRenderMetadata => ({
  audioId: 'beresheet-1',
  narratorId: 'yoni-davidov',
  narratorInitials: 'yd',
  parshaSlug: 'beresheet',
  aliyah: 1,
  title: 'Beresheet Aliyah 1',
  fileName: 'beresheet-1_yd_1080p30_a1b2c3d4.mp4',
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
  const incomplete = recording({ id: 'beresheet-2', aliyah: 2 })
  const unavailable = recording({
    id: 'beresheet-3',
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

  expect(eligible.map((entry) => entry.id)).toEqual(['beresheet-1'])
})

test('generated manifest excludes videos whose current provenance changed', () => {
  const currentProvenanceByAudioId = new Map([
    [
      'beresheet-1',
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
      'beresheet-1': {
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
    'beresheet-1': {
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
