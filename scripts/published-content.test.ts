import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { buildPublishedContent } from './published-content.ts'
import { parsePublishedCatalog } from '../app/updates/published-content.ts'
import { cue, cuePath, publish, recording, textWith } from '../app/updates/published-content.fixture.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

test('the website publishes every recording and fingerprinted cue file the app accepts', () => {
  const { files, builtIn } = buildPublishedContent(root)
  const latest = files.get('latest.json')!
  const catalog = parsePublishedCatalog(JSON.parse(latest))
  expect(builtIn).toEqual({ digest: sha256(latest), textLayout: catalog.textLayout, cues: catalog.cues })
  expect(catalog.recordings.length).toBeGreaterThan(0)
  expect(Object.keys(catalog.cues).length).toBeGreaterThan(0)
  for (const [cueFile, digest] of Object.entries(catalog.cues)) {
    const published = files.get(`cues/${digest}.json`)
    expect(published && sha256(published)).toBe(digest)
    expect(JSON.parse(published!)).toEqual(JSON.parse(readFileSync(path.join(root, cueFile), 'utf8')))
  }
  expect(files.size).toBe(new Set(Object.values(catalog.cues)).size + 1)
})

test('adding recordings or retiming cues keeps the text fingerprint; changing Torah words does not', () => {
  const first = publish([recording(1)], { [cuePath(1)]: cue(1) })
  const more = publish([recording(1), recording(2)], { [cuePath(1)]: cue(1, 0.5), [cuePath(2)]: cue(2) })
  expect(more.builtIn.textLayout).toBe(first.builtIn.textLayout)
  expect(more.builtIn.digest).not.toBe(first.builtIn.digest)

  const changedWords = textWith({ text: [['\u05d1\u05e8\u05d0\u05e9\u05d9\u05ea']] })
  expect(publish([recording(1)], { [cuePath(1)]: cue(1) }, changedWords).builtIn.textLayout).not.toBe(first.builtIn.textLayout)
  const movedAliyah = textWith({ aliyot: [{ standard: 2 }] })
  expect(publish([recording(1)], { [cuePath(1)]: cue(1) }, movedAliyah).builtIn.textLayout).not.toBe(first.builtIn.textLayout)
})

test('the catalog leaves out private source notes and names the broken cue file', () => {
  const { files } = publish([recording(1)], { [cuePath(1)]: cue(1) })
  expect(files.get('latest.json')).not.toContain('private name')
  expect(() => publish([recording(1)], { [cuePath(1)]: '{"cues": [' })).toThrow(cuePath(1))
})
