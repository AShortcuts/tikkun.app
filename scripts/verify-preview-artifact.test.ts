
import path from 'node:path'
import { expect, test } from 'vitest'

import { artifactPathForRequest, parseByteRange } from './verify-preview-artifact.mjs'

const basePath = '/pr-preview/pr-42'
const distRoot = path.resolve('dist')

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
