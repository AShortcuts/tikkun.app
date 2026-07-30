import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import {
  buildCurrentVideoProvenance,
  readCueHashes,
} from './generate-video-manifest.mjs'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

async function temporaryCueRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tikkun-video-manifest-'))
  temporaryRoots.push(root)
  return root
}

test('cue provenance is deterministic and duplicate audio ids are rejected', async () => {
  const root = await temporaryCueRoot()
  await mkdir(path.join(root, 'beresheet'))
  const cues = [{ timeStart: 1, pageNumber: 1, lineIndex: 0, fragmentIndex: 0, wordIndex: 0 }]
  await writeFile(
    path.join(root, 'beresheet', 'one.json'),
    JSON.stringify({ audioId: 'beresheet-1', cues })
  )

  const hashes = await readCueHashes(root)
  expect(hashes.get('beresheet-1')).toBe(
    createHash('sha256').update(JSON.stringify(cues)).digest('hex')
  )

  await writeFile(
    path.join(root, 'beresheet', 'duplicate.json'),
    JSON.stringify({ audioId: 'beresheet-1', cues: [] })
  )
  await expect(readCueHashes(root)).rejects.toThrow(/Duplicate cue payload/)
})

test('current video provenance uses every identity that is presently available', () => {
  const result = buildCurrentVideoProvenance({
    recordings: [
      {
        id: 'beresheet-1',
        mediaIdentity: {
          algorithm: 'sha256',
          digest: 'audio-digest',
          byteLength: 10,
        },
      },
      { id: 'beresheet-2' },
    ],
    cueHashes: new Map([['beresheet-1', 'cue-digest']]),
    appBuildHash: 'app-digest',
  })

  expect(result.get('beresheet-1')).toEqual({
    audioHash: 'audio-digest',
    cueHash: 'cue-digest',
    appBuildHash: 'app-digest',
  })
  expect(result.get('beresheet-2')).toEqual({ appBuildHash: 'app-digest' })
})
