import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { formatCueFileJson } from '../app/audio/cue-file.ts'
import { parseCueExportPayload } from '../app/audio/cue-validation.ts'
import { saveCueFile } from './save-cue-file.mjs'

const publishedPath = 'audio-cues/yoni-davidov/01 beresheet/1.json'
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tikkun-save-cue-'))
  roots.push(root)
  const value = JSON.parse(await readFile(publishedPath, 'utf8'))
  return { root, value }
}

test('writes a valid export to its canonical cue path and reports replacements', { timeout: 30_000 }, async () => {
  const { root, value } = await fixture()
  const created = await saveCueFile(value, { repoRoot: root })
  expect(created).toMatchObject({ path: publishedPath, replaced: false, unchanged: false, coverage: 'cued' })
  const written = await readFile(path.join(root, publishedPath), 'utf8')
  expect(written).toBe(formatCueFileJson(parseCueExportPayload(value)!))

  expect(await saveCueFile(value, { repoRoot: root })).toMatchObject({ replaced: false, unchanged: true })
  const edited = { ...value, cues: value.cues.map((cue: { timeStart: number }, index: number) =>
    index === 3 ? { ...cue, timeStart: cue.timeStart + 0.05 } : cue) }
  expect(await saveCueFile(edited, { repoRoot: root })).toMatchObject({ replaced: true, unchanged: false })
})

test('refuses cues the build would reject and leaves the folder untouched', { timeout: 30_000 }, async () => {
  const { root, value } = await fixture()
  const wrongWord = { ...value, cues: value.cues.map((cue: { wordIndex: number }, index: number) =>
    index === 2 ? { ...cue, wordIndex: cue.wordIndex + 40 } : cue) }
  await expect(saveCueFile(wrongWord, { repoRoot: root })).rejects.toThrow()
  await expect(saveCueFile({ ...value, mediaIdentity: undefined }, { repoRoot: root })).rejects.toThrow('no audio fingerprint')
  await expect(saveCueFile({ ...value, audioId: 'not-registered' }, { repoRoot: root })).rejects.toThrow('No available recording')
  await expect(saveCueFile({ cues: [] }, { repoRoot: root })).rejects.toThrow('not a valid cue file')
  await expect(readFile(path.join(root, publishedPath), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
})
