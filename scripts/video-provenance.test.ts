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
    mkdir(path.join(root, 'app'), { recursive: true }),
    mkdir(path.join(root, 'audio-cues'), { recursive: true }),
    mkdir(path.join(root, 'css'), { recursive: true }),
    mkdir(path.join(root, 'generated'), { recursive: true }),
    mkdir(path.join(root, 'site', 'audio'), { recursive: true }),
    mkdir(path.join(root, 'text'), { recursive: true }),
  ])
  await Promise.all([
    writeFile(path.join(root, 'index.html'), '<main></main>'),
    writeFile(path.join(root, 'package.json'), '{}'),
    writeFile(path.join(root, 'app', 'index.ts'), 'export const app = true'),
    writeFile(path.join(root, 'css', 'app.css'), 'main { color: black; }'),
    writeFile(path.join(root, 'app', 'index.test.ts'), 'throw new Error()'),
    writeFile(
      path.join(root, 'audio-cues', 'beresheet.json'),
      '{"cues":[]}'
    ),
    writeFile(path.join(root, 'site', 'audio', 'beresheet.mp3'), 'audio'),
    writeFile(path.join(root, 'text', 'torah-toc.json'), '{}'),
    writeFile(
      path.join(root, 'generated', 'video-manifest.ts'),
      'export const videos = []'
    ),
  ])
  return root
}

test('classifies rendered-app inputs without self-referential media outputs', () => {
  expect(isAppBuildInput('app/index.ts')).toBe(true)
  expect(isAppBuildInput('css/app-layout.css')).toBe(true)
  expect(isAppBuildInput('text/torah-toc.json')).toBe(true)
  expect(isAppBuildInput('scripts/record-aliyah-videos.mjs')).toBe(true)
  expect(isAppBuildInput('app/index.test.ts')).toBe(false)
  expect(isAppBuildInput('audio-cues/beresheet.json')).toBe(false)
  expect(isAppBuildInput('site/audio/beresheet.mp3')).toBe(false)
  expect(isAppBuildInput('generated/video-manifest.ts')).toBe(false)
})

test('hashes working-tree app content independently of excluded provenance inputs', async () => {
  const root = await temporaryAppRoot()
  const initialHash = await currentAppBuildHash(root)

  await Promise.all([
    writeFile(path.join(root, 'app', 'index.test.ts'), 'changed test'),
    writeFile(
      path.join(root, 'audio-cues', 'beresheet.json'),
      '{"cues":[{"timeStart":1}]}'
    ),
    writeFile(path.join(root, 'site', 'audio', 'beresheet.mp3'), 'changed audio'),
  ])
  expect(await currentAppBuildHash(root)).toBe(initialHash)

  await writeFile(path.join(root, 'app', 'index.ts'), 'export const app = false')
  expect(await currentAppBuildHash(root)).not.toBe(initialHash)
  expect(initialHash).toMatch(/^[a-f0-9]{64}$/)
})
