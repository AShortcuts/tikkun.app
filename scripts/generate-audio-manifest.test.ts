import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import {
  inferAliyah,
  importAudioCatalog,
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
  expect(inferAliyah('Beresheet 1st.m4a')).toBe(1)
  expect(inferAliyah("Beresheet ב׳.m4a")).toBe(2)
  expect(() => inferAliyah('Beresheet 1st 2.m4a')).toThrow(/Ambiguous aliyah/)
})

test.each(['54 Vezot Haberacha', '54 Vezos Haberacha'])('imports %s with the canonical Vezot spelling', async (folder) => {
  const root = await temporaryRoot()
  const source = path.join(root, 'source', folder)
  await mkdir(source, { recursive: true })
  await writeFile(path.join(source, '1.m4a'), 'synthetic audio')
  const recordings = await syncAudioCatalog({
    sourceRoot: path.join(root, 'source'),
    targetAudioRoot: path.join(root, 'audio'),
    targetFile: path.join(root, 'manifest.ts'),
  })
  expect(recordings[0]).toMatchObject({ id: 'vezot-haberacha-1', parshaSlug: 'vezot-haberacha', parshaName: 'Vezot Haberacha', parshaNumber: 54 })
})

test('selection rejects equally preferred files for the same aliyah', () => {
  expect(() =>
    selectAliyahFiles(['take-a 1.m4a', 'take-b 1.m4a'], '01 Beresheet')
  ).toThrow(/Ambiguous source files/)
})

test('audio sync canonicalizes source-library spellings', async () => {
  const root = await temporaryRoot()
  const sourceRoot = path.join(root, 'source')
  const targetAudioRoot = path.join(root, 'site/audio/yoni-davidov')
  const targetFile = path.join(root, 'generated/audio-manifest.ts')
  const sources = [
    ['01 Bereshit', 'Bereshit 1.m4a'],
    ['07 Vayetze', 'Vayetze 1.m4a'],
  ]

  for (const [folder, filename] of sources) {
    const sourceFolder = path.join(sourceRoot, folder)
    await mkdir(sourceFolder, { recursive: true })
    await writeFile(path.join(sourceFolder, filename), filename)
  }

  const recordings = await syncAudioCatalog({
    sourceRoot,
    targetAudioRoot,
    targetFile,
  })

  expect(recordings.map(({ id, parshaName }) => ({ id, parshaName }))).toEqual([
    { id: 'beresheet-1', parshaName: 'Beresheet' },
    { id: 'vayetzei-1', parshaName: 'Vayetzei' },
  ])
  await expect(
    readdir(path.join(targetAudioRoot, 'beresheet'))
  ).resolves.toEqual(['1.m4a'])
  await expect(
    readdir(path.join(targetAudioRoot, 'vayetzei'))
  ).resolves.toEqual(['1.m4a'])
})

test('audio sync is configurable, copies only selected files, and emits media identity', async () => {
  const root = await temporaryRoot()
  const sourceRoot = path.join(root, 'source')
  const parshaRoot = path.join(sourceRoot, '01 Beresheet')
  const targetAudioRoot = path.join(root, 'site/audio/yoni-davidov')
  const targetFile = path.join(root, 'generated/audio-manifest.ts')
  await mkdir(parshaRoot, { recursive: true })
  await mkdir(targetAudioRoot, { recursive: true })
  await mkdir(path.dirname(targetFile), { recursive: true })
  await writeFile(path.join(targetAudioRoot, 'old-file.m4a'), 'old')
  await writeFile(targetFile, 'old manifest')

  const selectedBytes = Buffer.from('fixed m4a')
  await writeFile(path.join(parshaRoot, 'Beresheet 1.mp3'), 'inferior mp3')
  await writeFile(path.join(parshaRoot, 'Beresheet 1 (fixed).m4a'), selectedBytes)
  await writeFile(path.join(parshaRoot, 'Beresheet 2.mp3'), 'second aliyah')
  await writeFile(path.join(parshaRoot, 'interview.m4a'), 'not an aliyah')
  await writeFile(path.join(parshaRoot, 'notes.txt'), 'not media')

  const recordings = await syncAudioCatalog({
    sourceRoot,
    targetAudioRoot,
    targetFile,
  })

  expect(recordings.map((recording) => recording.id)).toEqual([
    'beresheet-1',
    'beresheet-2',
  ])
  expect(await readdir(path.join(targetAudioRoot, 'beresheet'))).toEqual([
    '1.m4a',
    '2.mp3',
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
  const parshaRoot = path.join(sourceRoot, '01 Beresheet')
  const targetAudioRoot = path.join(root, 'site/audio/yoni-davidov')
  const targetFile = path.join(root, 'generated/audio-manifest.ts')
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

test('startup import adds new recordings, keeps absent sources and cues, and skips unchanged files', async () => {
  const root = await temporaryRoot()
  const sourceRoot = path.join(root, 'source')
  const targetAudioRoot = path.join(root, 'audio')
  const targetFile = path.join(root, 'manifest.ts')
  const firstFolder = path.join(sourceRoot, '01 Beresheet')
  await mkdir(firstFolder, { recursive: true })
  await writeFile(path.join(firstFolder, '1.m4a'), 'existing audio')
  const existingRecordings = await syncAudioCatalog({ sourceRoot, targetAudioRoot, targetFile })
  const firstAudio = path.join(targetAudioRoot, 'beresheet/1.m4a')
  const originalMtime = (await stat(firstAudio)).mtimeMs
  const cueFile = path.join(root, 'saved-cues.json')
  await writeFile(cueFile, 'saved timings')
  await rm(firstFolder, { recursive: true })
  for (const folder of ['38 Korach', '41 Pinchas']) {
    await mkdir(path.join(sourceRoot, folder))
    for (let aliyah = 1; aliyah <= 7; aliyah++) {
      await writeFile(path.join(sourceRoot, folder, `${aliyah}.m4a`), `${folder} ${aliyah}`)
    }
  }
  const options = { sourceRoot, targetAudioRoot, targetFile, existingRecordings,
    narrator: { id: 'yoni-davidov', displayName: 'Yoni Davidov', credit: 'Recordings by Yoni Davidov', default: true } }
  const imported = await importAudioCatalog(options)
  expect(imported.added).toHaveLength(14)
  expect(imported.recordings).toHaveLength(15)
  expect(await readFile(firstAudio, 'utf8')).toBe('existing audio')
  expect((await stat(firstAudio)).mtimeMs).toBe(originalMtime)
  expect(await readFile(cueFile, 'utf8')).toBe('saved timings')
  const manifestMtime = (await stat(targetFile)).mtimeMs
  const newAudio = path.join(targetAudioRoot, 'pinchas/7.m4a')
  const newMtime = (await stat(newAudio)).mtimeMs

  const repeated = await importAudioCatalog({ ...options, existingRecordings: imported.recordings })
  expect(repeated).toMatchObject({ added: [], restored: [], copiedBytes: 0 })
  expect((await stat(targetFile)).mtimeMs).toBe(manifestMtime)
  expect((await stat(newAudio)).mtimeMs).toBe(newMtime)
  await rm(newAudio)
  const restored = await importAudioCatalog({ ...options, existingRecordings: imported.recordings })
  expect(restored).toMatchObject({ added: [], restored: ['pinchas-7'] })
  expect(await readFile(newAudio, 'utf8')).toBe('41 Pinchas 7')
})

test('startup import refuses changed registered audio before adding any new files', async () => {
  const root = await temporaryRoot()
  const sourceRoot = path.join(root, 'source')
  const firstFolder = path.join(sourceRoot, '01 Beresheet')
  const targetAudioRoot = path.join(root, 'audio')
  const targetFile = path.join(root, 'manifest.ts')
  await mkdir(firstFolder, { recursive: true })
  await writeFile(path.join(firstFolder, '1.m4a'), 'original')
  const existingRecordings = await syncAudioCatalog({ sourceRoot, targetAudioRoot, targetFile })
  const before = await readFile(targetFile, 'utf8')
  await writeFile(path.join(firstFolder, '1.m4a'), 'replacement')
  await writeFile(path.join(firstFolder, '2.m4a'), 'new aliyah')

  await expect(importAudioCatalog({ sourceRoot, targetAudioRoot, targetFile, existingRecordings,
    narrator: { id: 'yoni-davidov' } })).rejects.toThrow(/will not replace audio tied to saved cues/)
  expect(await readFile(targetFile, 'utf8')).toBe(before)
  expect(await readFile(path.join(targetAudioRoot, 'beresheet/1.m4a'), 'utf8')).toBe('original')
  expect(await readdir(path.join(targetAudioRoot, 'beresheet'))).toEqual(['1.m4a'])
})

test('startup import refuses an unregistered destination file with different contents', async () => {
  const root = await temporaryRoot()
  const sourceRoot = path.join(root, 'source')
  const firstFolder = path.join(sourceRoot, '01 Beresheet')
  const targetAudioRoot = path.join(root, 'audio')
  const targetFile = path.join(root, 'manifest.ts')
  await mkdir(firstFolder, { recursive: true })
  await writeFile(path.join(firstFolder, '1.m4a'), 'original')
  const existingRecordings = await syncAudioCatalog({ sourceRoot, targetAudioRoot, targetFile })
  await writeFile(path.join(firstFolder, '2.m4a'), 'new aliyah')
  await writeFile(path.join(targetAudioRoot, 'beresheet/2.m4a'), 'unregistered recording')
  const before = await readFile(targetFile, 'utf8')

  await expect(importAudioCatalog({ sourceRoot, targetAudioRoot, targetFile, existingRecordings,
    narrator: { id: 'yoni-davidov' } })).rejects.toThrow(/Existing audio differs/)
  expect(await readFile(targetFile, 'utf8')).toBe(before)
  expect(await readFile(path.join(targetAudioRoot, 'beresheet/2.m4a'), 'utf8')).toBe('unregistered recording')
})
