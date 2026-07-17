import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import {
  currentAppBuildHash,
  isAppBuildInput,
} from './video-provenance.mjs'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

async function temporaryAppRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tikkun-video-provenance-'))
  temporaryRoots.push(root)
  await Promise.all([
    mkdir(path.join(root, 'css'), { recursive: true }),
    mkdir(path.join(root, 'src', 'data', 'audio-cues'), { recursive: true }),
    mkdir(path.join(root, 'static', 'audio'), { recursive: true }),
  ])
  await Promise.all([
    writeFile(path.join(root, 'index.html'), '<main></main>'),
    writeFile(path.join(root, 'package.json'), '{}'),
    writeFile(path.join(root, 'src', 'index.ts'), 'export const app = true'),
    writeFile(path.join(root, 'css', 'app.css'), 'main { color: black; }'),
    writeFile(path.join(root, 'src', 'index.test.ts'), 'throw new Error()'),
    writeFile(
      path.join(root, 'src', 'data', 'audio-cues', 'bereshit.json'),
      '{"cues":[]}'
    ),
    writeFile(path.join(root, 'static', 'audio', 'bereshit.mp3'), 'audio'),
    writeFile(
      path.join(root, 'src', 'data', 'video-manifest.generated.ts'),
      'export const videos = []'
    ),
  ])
  return root
}

test('classifies rendered-app inputs without self-referential media outputs', () => {
  expect(isAppBuildInput('src/index.ts')).toBe(true)
  expect(isAppBuildInput('css/app-layout.css')).toBe(true)
  expect(isAppBuildInput('scripts/record-aliyah-videos.mjs')).toBe(true)
  expect(isAppBuildInput('src/index.test.ts')).toBe(false)
  expect(isAppBuildInput('src/data/audio-cues/bereshit.json')).toBe(false)
  expect(isAppBuildInput('static/audio/bereshit.mp3')).toBe(false)
  expect(isAppBuildInput('src/data/video-manifest.generated.ts')).toBe(false)
})

test('hashes working-tree app content independently of excluded provenance inputs', async () => {
  const root = await temporaryAppRoot()
  const initialHash = await currentAppBuildHash(root)

  await Promise.all([
    writeFile(path.join(root, 'src', 'index.test.ts'), 'changed test'),
    writeFile(
      path.join(root, 'src', 'data', 'audio-cues', 'bereshit.json'),
      '{"cues":[{"timeStart":1}]}'
    ),
    writeFile(path.join(root, 'static', 'audio', 'bereshit.mp3'), 'changed audio'),
  ])
  expect(await currentAppBuildHash(root)).toBe(initialHash)

  await writeFile(path.join(root, 'src', 'index.ts'), 'export const app = false')
  expect(await currentAppBuildHash(root)).not.toBe(initialHash)
  expect(initialHash).toMatch(/^[a-f0-9]{64}$/)
})
