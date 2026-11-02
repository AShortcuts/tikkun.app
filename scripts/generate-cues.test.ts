import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { findRecordingsNeedingCues } from './generate-cues.mjs'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const identity = (digest: string) => ({ algorithm: 'sha256', digest: digest.repeat(64), byteLength: 100 })
const recording = (aliyah: number, digest = 'a', status = 'available') => ({
  id: 'pinchas-' + aliyah, narratorId: 'yoni-davidov', parshaSlug: 'pinchas', aliyah, status,
  title: 'Pinchas Aliyah ' + aliyah, mediaIdentity: identity(digest),
})

test('lists recordings with no cues or cues for different audio, and skips matching ones', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tikkun-generate-cues-'))
  roots.push(root)
  const folder = path.join(root, 'audio-cues/yoni-davidov/41 pinchas')
  await mkdir(folder, { recursive: true })
  await writeFile(path.join(folder, '1.json'), JSON.stringify({ cueCount: 3, mediaIdentity: identity('a') }))
  await writeFile(path.join(folder, '2.json'), JSON.stringify({ cueCount: 3, mediaIdentity: identity('b') }))
  await writeFile(path.join(folder, '3.json'), JSON.stringify({ cueCount: 0, mediaIdentity: identity('a') }))
  await writeFile(path.join(folder, '4.json'), '{')
  const needed = await findRecordingsNeedingCues([
    recording(1), recording(2), recording(3), recording(4), recording(5), recording(6, 'a', 'missing'),
  ], root)
  expect(needed.map((entry) => [entry.recording.id, entry.reason, entry.cuePath])).toEqual([
    ['pinchas-2', 'cue file is for different audio', 'audio-cues/yoni-davidov/41 pinchas/2.json'],
    ['pinchas-3', 'cue file has no cues', 'audio-cues/yoni-davidov/41 pinchas/3.json'],
    ['pinchas-4', 'cue file is unreadable', 'audio-cues/yoni-davidov/41 pinchas/4.json'],
    ['pinchas-5', 'no cue file', 'audio-cues/yoni-davidov/41 pinchas/5.json'],
  ])
})
