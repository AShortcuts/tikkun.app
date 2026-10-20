import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { audioImportSource } from './import-aligner-audio.mjs'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

test('startup source uses environment, private config, or the registered library', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tikkun-aligner-import-'))
  roots.push(root)
  const file = path.join(root, 'audio-source.json')
  expect(await audioImportSource(file, {})).toBeNull()
  await writeFile(file, JSON.stringify({ sourceRoot: '/local/recordings' }))
  expect(await audioImportSource(file, {})).toBe('/local/recordings')
  expect(await audioImportSource(file, { TIKKUN_AUDIO_SOURCE_ROOT: '/override' })).toBe('/override')
  await writeFile(file, '{')
  await expect(audioImportSource(file, {})).rejects.toThrow()
  await writeFile(file, '{}')
  await expect(audioImportSource(file, {})).rejects.toThrow(/Set sourceRoot/)
})
