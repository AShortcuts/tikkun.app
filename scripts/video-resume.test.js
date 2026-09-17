import { afterEach, expect, test } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { completedVideoMatches, recordingSettings, videoFileHash } from './video-resume.mjs'

let root
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }) })

async function fixture() {
  root = await mkdtemp(path.join(os.tmpdir(), 'video-resume-'))
  const relativePath = '01 Beresheet/beresheet-1.mp4'
  const filePath = path.join(root, relativePath)
  await mkdir(path.dirname(filePath))
  await writeFile(filePath, 'validated bytes')
  const options = { width: 1300, height: 600, deviceScaleFactor: 3, fps: 60,
    crf: 18, preset: 'veryfast', renderMode: 'cue-keyframes', frameTransport: 'stream', crop: false, cropMargin: 96 }
  const generatedFrom = { audioHash: 'audio', cueHash: 'cues', appBuildHash: 'app' }
  const metadata = { validation: { passed: true }, bytes: 15, outputRelativePath: relativePath,
    outputHash: await videoFileHash(filePath), recordingSettings: recordingSettings(options), generatedFrom }
  return { metadata, options, generatedFrom, relativePath, outputRoot: root }
}

test('skips only a validated file with matching contents, sources and settings', async () => {
  const args = await fixture()
  await expect(completedVideoMatches(args)).resolves.toBe(true)
  for (const key of Object.keys(args.options)) {
    await expect(completedVideoMatches({ ...args, options: { ...args.options, [key]: 'changed' } })).resolves.toBe(false)
  }
  for (const key of ['audioHash', 'cueHash']) {
    await expect(completedVideoMatches({ ...args, generatedFrom: { ...args.generatedFrom, [key]: 'changed' } })).resolves.toBe(false)
  }
  await expect(completedVideoMatches({ ...args, generatedFrom: { ...args.generatedFrom, appBuildHash: 'new-build' } })).resolves.toBe(true)
  await expect(completedVideoMatches({ ...args, metadata: { ...args.metadata, validation: { passed: false } } })).resolves.toBe(false)
  await expect(completedVideoMatches({ ...args, metadata: { ...args.metadata, outputHash: undefined } })).resolves.toBe(false)
})

test('rerenders missing, truncated and same-size corrupted files', async () => {
  const args = await fixture()
  const filePath = path.join(root, args.relativePath)
  await writeFile(filePath, 'corrupted bytes')
  await expect(completedVideoMatches(args)).resolves.toBe(false)
  await writeFile(filePath, 'short')
  await expect(completedVideoMatches(args)).resolves.toBe(false)
  await rm(filePath)
  await expect(completedVideoMatches(args)).resolves.toBe(false)
})

test('does not reuse a file from a different output folder or outside the output root', async () => {
  const args = await fixture()
  await expect(completedVideoMatches({ ...args, relativePath: '02 Noach/file.mp4' })).resolves.toBe(false)
  await expect(completedVideoMatches({ ...args, relativePath: '../escape.mp4',
    metadata: { ...args.metadata, outputRelativePath: '../escape.mp4' } })).resolves.toBe(false)
})
