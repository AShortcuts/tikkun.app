import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import {
  inferAliyah,
  parseAudioSyncOptions,
  selectAliyahFiles,
  syncAudioCatalog,
} from './generate-audio-manifest.mjs'

const temporaryRoots: string[] = []

async function temporaryRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tikkun-audio-sync-'))
  temporaryRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

test('aliyah inference rejects filenames with conflicting signals', () => {
  expect(inferAliyah('Bereshit 1st.m4a')).toBe(1)
  expect(inferAliyah("Bereshit ב׳.m4a")).toBe(2)
  expect(() => inferAliyah('Bereshit 1st 2.m4a')).toThrow(/Ambiguous aliyah/)
})

test('selection rejects equally preferred files for the same aliyah', () => {
  expect(() =>
    selectAliyahFiles(['take-a 1.m4a', 'take-b 1.m4a'], '01 Bereshit')
  ).toThrow(/Ambiguous source files/)
})

test('audio sync is configurable, copies only selected files, and emits media identity', async () => {
  const root = await temporaryRoot()
  const sourceRoot = path.join(root, 'source')
  const parshaRoot = path.join(sourceRoot, '01 Bereshit')
  const targetAudioRoot = path.join(root, 'static/audio/yoni-davidov')
  const targetFile = path.join(root, 'src/data/audio-manifest.generated.ts')
  await mkdir(parshaRoot, { recursive: true })
  await mkdir(targetAudioRoot, { recursive: true })
  await mkdir(path.dirname(targetFile), { recursive: true })
  await writeFile(path.join(targetAudioRoot, 'old-file.m4a'), 'old')
  await writeFile(targetFile, 'old manifest')

  const selectedBytes = Buffer.from('fixed m4a')
  await writeFile(path.join(parshaRoot, 'Bereshit 1.mp3'), 'inferior mp3')
  await writeFile(path.join(parshaRoot, 'Bereshit 1 (fixed).m4a'), selectedBytes)
  await writeFile(path.join(parshaRoot, 'Bereshit 2.mp3'), 'second aliyah')
  await writeFile(path.join(parshaRoot, 'interview.m4a'), 'not an aliyah')
  await writeFile(path.join(parshaRoot, 'notes.txt'), 'not media')

  const recordings = await syncAudioCatalog({
    sourceRoot,
    targetAudioRoot,
    targetFile,
  })

  expect(recordings.map((recording) => recording.id)).toEqual([
    'bereshit-1',
    'bereshit-2',
  ])
  expect(await readdir(path.join(targetAudioRoot, '01-bereshit'))).toEqual([
    'Bereshit 1 (fixed).m4a',
    'Bereshit 2.mp3',
  ])
  await expect(readFile(path.join(targetAudioRoot, 'old-file.m4a'))).rejects.toMatchObject({
    code: 'ENOENT',
  })

  const expectedDigest = createHash('sha256').update(selectedBytes).digest('hex')
  const generated = await readFile(targetFile, 'utf8')
  expect(generated).toContain(`digest: "${expectedDigest}"`)
  expect(generated).toContain(`byteLength: ${selectedBytes.length}`)
  expect(generated).not.toContain('interview.m4a')
})

test('failed discovery leaves the previous catalog and media untouched', async () => {
  const root = await temporaryRoot()
  const sourceRoot = path.join(root, 'source')
  const parshaRoot = path.join(sourceRoot, '01 Bereshit')
  const targetAudioRoot = path.join(root, 'static/audio/yoni-davidov')
  const targetFile = path.join(root, 'src/data/audio-manifest.generated.ts')
  await mkdir(parshaRoot, { recursive: true })
  await mkdir(targetAudioRoot, { recursive: true })
  await mkdir(path.dirname(targetFile), { recursive: true })
  await writeFile(path.join(parshaRoot, 'take-a 1.m4a'), 'a')
  await writeFile(path.join(parshaRoot, 'take-b 1.m4a'), 'b')
  await writeFile(path.join(targetAudioRoot, 'existing.m4a'), 'existing')
  await writeFile(targetFile, 'existing manifest')

  await expect(
    syncAudioCatalog({ sourceRoot, targetAudioRoot, targetFile })
  ).rejects.toThrow(/Ambiguous source files/)

  await expect(readFile(path.join(targetAudioRoot, 'existing.m4a'), 'utf8')).resolves.toBe(
    'existing'
  )
  await expect(readFile(targetFile, 'utf8')).resolves.toBe('existing manifest')
})

test('command options accept environment and explicit source configuration', () => {
  expect(() => parseAudioSyncOptions([], {})).toThrow(/Audio source is required/)
  expect(
    parseAudioSyncOptions([], { TIKKUN_AUDIO_SOURCE_ROOT: '/env/audio' })
      .sourceRoot
  ).toBe('/env/audio')
  expect(
    parseAudioSyncOptions(['--source', '/cli/audio'], {
      TIKKUN_AUDIO_SOURCE_ROOT: '/env/audio',
    }).sourceRoot
  ).toBe('/cli/audio')
})
