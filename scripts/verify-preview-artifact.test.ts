import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from 'vitest'

import {
  artifactPathForRequest,
  createRecordingRangeProbes,
  normalizePreviewBasePath,
  parseByteRange,
  previewCacheNamespace,
} from './verify-preview-artifact.mjs'

const basePath = '/pr-preview/pr-42'
const distRoot = path.resolve('dist')

test('requires an explicit non-root preview base path', () => {
  expect(normalizePreviewBasePath('/pr-preview/pr-42/')).toBe(basePath)
  expect(() => normalizePreviewBasePath('')).toThrow('non-root')
  expect(() => normalizePreviewBasePath('/')).toThrow('non-root')
  expect(() => normalizePreviewBasePath('pr-preview/pr-42')).toThrow(
    'absolute path',
  )
  expect(() => normalizePreviewBasePath('/preview?wrong=true')).toThrow(
    'without a query or fragment',
  )
})

test('maps only base-contained clean routes and assets into dist', () => {
  expect(artifactPathForRequest(distRoot, basePath, `${basePath}/`)).toBe(
    path.join(distRoot, 'index.html'),
  )
  expect(
    artifactPathForRequest(
      distRoot,
      basePath,
      `${basePath}/readings/?q=beresheet`,
    ),
  ).toBe(path.join(distRoot, 'readings/index.html'))
  expect(
    artifactPathForRequest(
      distRoot,
      basePath,
      `${basePath}/_app/immutable/start.js`,
    ),
  ).toBe(path.join(distRoot, '_app/immutable/start.js'))
  expect(artifactPathForRequest(distRoot, basePath, '/readings/')).toBeNull()
  expect(
    artifactPathForRequest(
      distRoot,
      basePath,
      `${basePath}/%2e%2e/package.json`,
    ),
  ).toBeNull()
})

test('uses the same stable base-path cache namespace as the service worker', () => {
  expect(previewCacheNamespace(basePath)).toMatch(/^[a-f0-9]{12}$/)
  expect(previewCacheNamespace(`${basePath}/`)).toBe(
    previewCacheNamespace(basePath),
  )
  expect(previewCacheNamespace('/pr-preview/pr-43')).not.toBe(
    previewCacheNamespace(basePath),
  )
})

test('serves bounded and suffix byte ranges for local recording proof', () => {
  expect(parseByteRange('bytes=0-1023', 10_000)).toEqual({
    start: 0,
    end: 1023,
  })
  expect(parseByteRange('bytes=9000-', 10_000)).toEqual({
    start: 9000,
    end: 9999,
  })
  expect(parseByteRange('bytes=-500', 10_000)).toEqual({
    start: 9500,
    end: 9999,
  })
  expect(parseByteRange('bytes=10000-', 10_000)).toBeNull()
  expect(parseByteRange('words=0-10', 10_000)).toBeNull()
})

test('plans bounded beginning, middle, and end recording probes', () => {
  expect(createRecordingRangeProbes(10_000, 1_000)).toEqual([
    {
      label: 'beginning',
      start: 0,
      end: 999,
      length: 1_000,
      header: 'bytes=0-999',
      contentRange: 'bytes 0-999/10000',
    },
    {
      label: 'middle',
      start: 4_500,
      end: 5_499,
      length: 1_000,
      header: 'bytes=4500-5499',
      contentRange: 'bytes 4500-5499/10000',
    },
    {
      label: 'end',
      start: 9_000,
      end: 9_999,
      length: 1_000,
      header: 'bytes=9000-9999',
      contentRange: 'bytes 9000-9999/10000',
    },
  ])
  expect(createRecordingRangeProbes(7, 1_024)).toEqual([
    expect.objectContaining({
      label: 'beginning',
      start: 0,
      end: 6,
      length: 7,
    }),
    expect.objectContaining({ label: 'middle', start: 0, end: 6, length: 7 }),
    expect.objectContaining({ label: 'end', start: 0, end: 6, length: 7 }),
  ])
  expect(() => createRecordingRangeProbes(0)).toThrow('positive safe integer')
  expect(() => createRecordingRangeProbes(10, 0)).toThrow(
    'positive safe integer',
  )
})

test('runs preview behavior verification after the exact preview build', async () => {
  const [packageSource, workflow] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(
      new URL('../.github/workflows/pr-preview.yml', import.meta.url),
      'utf8',
    ),
  ])
  const packageJson = JSON.parse(packageSource)

  expect(packageJson.scripts['preview:verify']).toBe(
    'node scripts/verify-preview-artifact.mjs',
  )
  expect(workflow).toContain(
    'TIKKUN_BASE_PATH: "/pr-preview/pr-${{ github.event.pull_request.number }}"',
  )
  expect(workflow).toContain('TIKKUN_PREVIEW_BROWSER_CHANNEL: chrome')
  expect(workflow).toContain('npm run build && npm run preview:verify')
})
