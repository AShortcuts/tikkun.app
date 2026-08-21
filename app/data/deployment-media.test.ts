import { expect, test, vi } from 'vitest'
import type { ParshaAudioRecording } from '../audio/types.ts'
import { audioRecordings } from './audio-catalog.ts'
import {
  appendRecordingMediaVersion,
  resolveDeploymentMediaUrl,
  resolveRecordingMediaUrls,
} from './deployment-media.ts'

vi.mock('$app/paths', () => ({ base: '/pr-preview/pr-42' }))

const recording: ParshaAudioRecording = {
  id: 'beresheet-1',
  narratorId: 'reader',
  reading: { kind: 'parsha', id: 'beresheet', name: 'Beresheet' },
  aliyah: 1,
  title: 'Beresheet Aliyah 1',
  playSrc: '/audio/reader/beresheet/1.m4a',
  downloadSrc: '/audio/reader/beresheet/1.m4a',
  format: 'm4a',
  status: 'available',
  parshaSlug: 'beresheet',
  parshaName: 'Beresheet',
}

test('prefixes same-origin recording media for a subpath deployment', () => {
  expect(resolveRecordingMediaUrls(recording, '/pr-preview/pr-42')).toMatchObject({
    playSrc: '/pr-preview/pr-42/audio/reader/beresheet/1.m4a',
    downloadSrc: '/pr-preview/pr-42/audio/reader/beresheet/1.m4a',
  })
})

test('versions playable catalog media by its durable identity', () => {
  const mediaIdentity = {
    algorithm: 'sha256' as const,
    digest: 'a'.repeat(64),
    byteLength: 123,
  }
  expect(
    resolveRecordingMediaUrls({ ...recording, mediaIdentity }, '/preview')
  ).toMatchObject({
    playSrc: `/preview/audio/reader/beresheet/1.m4a?tikkun-media=${mediaIdentity.digest}`,
    downloadSrc: '/preview/audio/reader/beresheet/1.m4a',
  })
  expect(
    appendRecordingMediaVersion('/audio/file.m4a?quality=high#cue', 'digest')
  ).toBe('/audio/file.m4a?quality=high&tikkun-media=digest#cue')
})

test('publishes the generated catalog through the deployment base adapter', () => {
  expect(audioRecordings.length).toBeGreaterThan(0)
  for (const catalogRecording of audioRecordings) {
    if (!catalogRecording.playSrc.startsWith('/')) continue
    expect(catalogRecording.playSrc).toMatch(
      /^\/pr-preview\/pr-42\/audio\//
    )
    expect(catalogRecording.downloadSrc).toMatch(
      /^\/pr-preview\/pr-42\/audio\//
    )
  }
})

test('leaves root, external, and already-prefixed media URLs stable', () => {
  expect(resolveDeploymentMediaUrl('/audio/file.m4a', '')).toBe(
    '/audio/file.m4a'
  )
  expect(
    resolveDeploymentMediaUrl('https://media.example/file.m4a', '/preview')
  ).toBe('https://media.example/file.m4a')
  expect(resolveDeploymentMediaUrl('//media.example/file.m4a', '/preview')).toBe(
    '//media.example/file.m4a'
  )
  expect(resolveDeploymentMediaUrl('/preview/audio/file.m4a', '/preview/')).toBe(
    '/preview/audio/file.m4a'
  )
})

test('rejects an invalid deployment base path', () => {
  expect(() => resolveDeploymentMediaUrl('/audio/file.m4a', 'preview')).toThrow(
    'must be empty or start with "/"'
  )
})
