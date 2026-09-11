import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { recordingDependencyManifest } from './recording-dependency-manifest.mjs'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tikkun-dependency-manifest-'))
  roots.push(root)
  await mkdir(path.join(root, '_app/immutable/chunks'), { recursive: true })
  const outputFiles = ['text', 'cue', 'shared', 'tools'].map((name) => `_app/immutable/chunks/${name}.js`)
  for (const file of outputFiles) await writeFile(path.join(root, file), 'test')
  const manifest = {
    text: { file: outputFiles[0], imports: ['shared'] },
    cue: { file: outputFiles[1], imports: ['shared'] },
    shared: { file: outputFiles[2] },
    'app/reading/passage-audio-tools.ts': { file: outputFiles[3], imports: ['shared'] },
  }
  const inventory = { version: 'exact-build', modules: { 'text/pages/torah/1.json': outputFiles[0], 'audio-cues/test/1.json': outputFiles[1] } }
  return { root, outputFiles, manifest, inventory }
}

test('describes exact emitted bytes, shared imports, and deployment-relative URLs', async () => {
  const f = await fixture()
  const result = await recordingDependencyManifest({ ...f, basePath: '/preview' })
  expect(result.version).toBe('exact-build')
  expect(result.core).toHaveLength(3)
  expect(result.cues['audio-cues/test/1.json']).toHaveLength(2)
  expect(result.core[0]).toEqual({ url: '/preview/_app/immutable/chunks/shared.js', byteLength: 4, digest: createHash('sha256').update('test').digest('hex') })
  await writeFile(path.join(f.root, f.outputFiles[0]), 'updated')
  const updated = await recordingDependencyManifest(f)
  expect(updated.core.find((asset) => asset.url.endsWith('/text.js'))?.digest).not.toBe(result.core.find((asset) => asset.url.endsWith('/text.js'))?.digest)
})

test('includes lazy playback tools and static dependencies without caching unrelated optional features', async () => {
  const f = await fixture()
  const result = await recordingDependencyManifest({ ...f, manifest: {
    ...f.manifest, 'app/admin/cue-authoring.ts': { file: '_app/immutable/chunks/authoring.js' },
  } })
  expect(result.core.map((asset) => asset.url)).toEqual([
    '/_app/immutable/chunks/shared.js', '/_app/immutable/chunks/text.js', '/_app/immutable/chunks/tools.js',
  ])
  await expect(recordingDependencyManifest({ ...f, outputFiles: f.outputFiles.filter((file) => !file.endsWith('/tools.js')) }))
    .rejects.toThrow('missing a bundled dependency')
})

test('fails rather than inventing missing content identities', async () => {
  const f = await fixture()
  await expect(recordingDependencyManifest({ ...f, inventory: { ...f.inventory, version: '' } })).rejects.toThrow('build-matched')
  await expect(recordingDependencyManifest({ ...f, outputFiles: [] })).rejects.toThrow('missing a bundled dependency')
  await expect(recordingDependencyManifest({ ...f, inventory: { version: 'build', modules: {} } })).rejects.toThrow('no text pages')
})
