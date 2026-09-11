import { expect, test, vi } from 'vitest'
import type { AudioRecording, CueExportPayload } from '../audio/types.ts'
import type { CueDataResolution } from '../audio/cue-data.ts'
import { createBundledRecordingDependencies } from './bundled-recording-dependencies.ts'
import { descriptorForRecording } from './recording-download.ts'
import { resolveRecordingAsset } from './recording-storage.ts'

const recording: AudioRecording = {
  id: 'one', narratorId: 'reader', reading: { kind: 'parsha', id: 'test', name: 'Test' },
  parshaSlug: 'test', parshaName: 'Test', aliyah: 1, title: 'Test 1', status: 'available', format: 'm4a',
  playSrc: '/audio/one.m4a', downloadSrc: '/audio/one.m4a',
  mediaIdentity: { algorithm: 'sha256', digest: 'a'.repeat(64), byteLength: 100 },
}
const baseUrl = 'https://tikkunreader.com/reader/'
const asset = resolveRecordingAsset(descriptorForRecording(recording)!, baseUrl)
const payload: CueExportPayload = {
  audioId: 'one', audioFormat: 'm4a', narratorId: 'reader', readingId: 'test', aliyah: 1,
  tokenCount: 1, cueCount: 1, tokenizationVersion: 'v2',
  cues: [{ timeStart: 0, pageNumber: 1, lineIndex: 0, fragmentIndex: 0, wordIndex: 0 }],
}
const ready = (value = payload): CueDataResolution => ({ status: 'ready', path: 'cues', payload: value })
const missing: CueDataResolution = { status: 'missing', path: null, payload: null }

test('distinguishes timed, unpublished, and empty timing payloads', async () => {
  const resolve = vi.fn<(recording: AudioRecording) => Promise<CueDataResolution>>()
    .mockResolvedValueOnce(ready()).mockResolvedValueOnce(missing)
    .mockResolvedValueOnce(ready({ ...payload, cues: [], cueCount: 0 }))
  const dependencies = createBundledRecordingDependencies({ recordings: [recording], baseUrl, resolve })
  await expect(dependencies.check(asset)).resolves.toBe('ready')
  await expect(dependencies.check(asset)).resolves.toBe('audio-only')
  await expect(dependencies.prepare(asset, new AbortController().signal)).resolves.toBe('audio-only')
})

test.each(['invalid', 'unavailable'] as const)('rejects %s published dependencies instead of silently treating them as audio-only', async (status) => {
  const dependencies = createBundledRecordingDependencies({ recordings: [recording], baseUrl, resolve: async () => ({
    status, path: 'cues', payload: null, problem: { code: 'load-failed', message: 'Published timings failed', details: [] },
  }) })
  await expect(dependencies.check(asset)).rejects.toThrow('Published timings failed')
})

test('rejects incompatible tokenization and unknown catalog identities', async () => {
  const dependencies = createBundledRecordingDependencies({ recordings: [recording], baseUrl,
    resolve: async () => ready({ ...payload, tokenizationVersion: 'old' }),
  })
  await expect(dependencies.check(asset)).rejects.toThrow('incompatible text version')
  await expect(dependencies.check({ ...asset, digest: 'b'.repeat(64) })).rejects.toThrow('not in the installed content catalog')
})

test('checks every logical recording sharing one physical file', async () => {
  const alias = { ...recording, id: 'alias' }
  const resolve = vi.fn(async (recording: AudioRecording) => recording.id === 'alias' ? missing : ready())
  const dependencies = createBundledRecordingDependencies({ recordings: [recording, alias], baseUrl, resolve })
  await expect(dependencies.check(asset)).resolves.toBe('audio-only')
  expect(resolve).toHaveBeenCalledTimes(2)
})

test('honors cancellation before and after a bundled module resolves', async () => {
  const controller = new AbortController()
  const resolve = vi.fn(async () => { controller.abort(); return ready() })
  const dependencies = createBundledRecordingDependencies({ recordings: [recording], baseUrl, resolve })
  await expect(dependencies.prepare(asset, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  await expect(dependencies.prepare(asset, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  expect(resolve).toHaveBeenCalledOnce()
})
