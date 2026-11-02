import { expect, test } from 'vitest'
import type { CueExportPayload } from '../audio/types.ts'
import { isZipFile, loadStoredCueBundle, readCueBundleFile, storeCueBundle } from './cue-bundle.ts'
import { buildZipFixture } from './zip.fixture.ts'

const payload = (aliyah: number): CueExportPayload => ({
  audioId: 'test-' + aliyah, audioFormat: 'm4a', narratorId: 'reader', readingId: 'test', aliyah,
  tokenCount: 2, cueCount: 2, tokenizationVersion: 'v2',
  mediaIdentity: { algorithm: 'sha256', digest: 'a'.repeat(64), byteLength: 10 },
  cues: [0, 1].map((wordIndex) => ({
    cueNumber: wordIndex + 1, timeStart: wordIndex, pageNumber: 1, lineIndex: 0, fragmentIndex: 0, wordIndex,
  })),
})

const encode = (value: unknown) => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value))
const zipFile = (entries: Array<[string, unknown]>, name = 'tikkun-generated-cues.zip') =>
  new File([buildZipFixture(entries.map(([entryName, value]) => ({ name: entryName, bytes: encode(value) })))], name, { type: 'application/zip' })

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

test('opens the aligner ZIP in aliyah order and ignores its manifest and macOS metadata', async () => {
  const bundle = await readCueBundleFile(zipFile([
    ['manifest.json', { private: true, recordings: [] }],
    ['b-tikkun-cues.json', payload(2)],
    ['__MACOSX/._b-tikkun-cues.json', 'binary'],
    ['a-tikkun-cues.json', payload(1)],
  ]))
  expect(bundle.name).toBe('tikkun-generated-cues.zip')
  expect(bundle.entries.map((entry) => [entry.fileName, entry.payload.audioId])).toEqual([
    ['a-tikkun-cues.json', 'test-1'],
    ['b-tikkun-cues.json', 'test-2'],
  ])
})

test('names the file that blocks a bundle from opening', async () => {
  await expect(readCueBundleFile(zipFile([['bad.json', '{']]))).rejects.toThrow('bad.json is not valid JSON')
  await expect(readCueBundleFile(zipFile([['odd.json', { audioId: 'x' }]]))).rejects.toThrow('odd.json is not a valid cue file')
  await expect(readCueBundleFile(zipFile([['a.json', payload(1)], ['b.json', payload(1)]]))).rejects.toThrow('more than one cue file for test-1')
  await expect(readCueBundleFile(zipFile([['manifest.json', {}]]))).rejects.toThrow('no cue files')
})

test('keeps the chosen aliyot until closed and rejects a damaged saved list', () => {
  const storage = new MemoryStorage()
  storeCueBundle(storage, { version: 2, name: 'x.zip', audioIds: ['test-1', 'test-2'] })
  expect(loadStoredCueBundle(storage)).toEqual({ version: 2, name: 'x.zip', audioIds: ['test-1', 'test-2'] })
  storeCueBundle(storage, null)
  expect(loadStoredCueBundle(storage)).toBeNull()
  // The earlier one-tab format held whole cue files.
  storage.setItem('tikkun-admin-cue-bundle', JSON.stringify({ name: 'x.zip', entries: [] }))
  expect(() => loadStoredCueBundle(storage)).toThrow('damaged')
})

test('recognizes ZIP files by name or type', () => {
  expect(isZipFile({ name: 'Cues.ZIP', type: '' })).toBe(true)
  expect(isZipFile({ name: 'download', type: 'application/zip' })).toBe(true)
  expect(isZipFile({ name: '3.json', type: 'application/json' })).toBe(false)
})
