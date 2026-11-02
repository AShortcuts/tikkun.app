import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { expect, test } from 'vitest'
import { readZipEntries } from './zip-entries.ts'
import { buildZipFixture } from './zip.fixture.ts'

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
const toArrayBuffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

test('reads a deflated archive written the way the aligner writes its cue ZIP', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'tikkun-zip-'))
  try {
    const archive = path.join(directory, 'cues.zip')
    execFileSync('python3', ['-c', [
      'import sys, zipfile',
      'with zipfile.ZipFile(sys.argv[1], "w", compression=zipfile.ZIP_DEFLATED) as z:',
      '    z.writestr("a-tikkun-cues.json", "{\\"audioId\\": \\"a\\"}" * 40)',
      '    z.writestr("manifest.json", "{}")',
    ].join('\n'), archive])
    return readZipEntries(toArrayBuffer(readFileSync(archive))).then((entries) => {
      expect(entries.map((entry) => entry.name)).toEqual(['a-tikkun-cues.json', 'manifest.json'])
      expect(text(entries[0].bytes)).toBe('{"audioId": "a"}'.repeat(40))
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('reads stored and deflated entries and skips folders', async () => {
  const encoder = new TextEncoder()
  const deflatedText = encoder.encode('deflated content '.repeat(20))
  const entries = await readZipEntries(buildZipFixture([
    { name: 'folder/', bytes: new Uint8Array() },
    { name: 'folder/stored.json', bytes: encoder.encode('{"stored":true}') },
    { name: 'deflated.txt', bytes: deflatedText, deflated: new Uint8Array(deflateRawSync(deflatedText)) },
  ]))
  expect(entries.map((entry) => [entry.name, text(entry.bytes)])).toEqual([
    ['folder/stored.json', '{"stored":true}'],
    ['deflated.txt', 'deflated content '.repeat(20)],
  ])
})

test('rejects files that are not intact ZIP archives', async () => {
  await expect(readZipEntries(new TextEncoder().encode('{"cues": []}').buffer as ArrayBuffer)).rejects.toThrow('not a ZIP')
  const bytes = new TextEncoder().encode('x'.repeat(50))
  await expect(readZipEntries(buildZipFixture([
    { name: 'broken.json', bytes, deflated: new Uint8Array([1, 2, 3, 4]) },
  ]))).rejects.toThrow('damaged')
})
