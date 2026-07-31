import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import {
  createTorahIndex,
  PAGE_LINE_RADIX,
  renderTorahIndex,
} from './generate-torah-index.mjs'

const canonicalToc = JSON.parse(
  readFileSync(new URL('../text/torah-toc.json', import.meta.url), 'utf8')
)

test('the committed compact Torah index matches the canonical Torah TOC', () => {
  const committed = readFileSync(
    new URL('../generated/torah-index.json', import.meta.url),
    'utf8'
  )
  expect(committed).toBe(renderTorahIndex(createTorahIndex(canonicalToc)))
})

test('Torah index generation rejects gaps and unencodable lines', () => {
  expect(() =>
    createTorahIndex({
      1: {
        2: {
          1: { p: 1, l: 1 },
        },
      },
    })
  ).toThrow(/chapters keys must be contiguous/)

  expect(() =>
    createTorahIndex({
      1: {
        1: {
          1: { p: 1, l: PAGE_LINE_RADIX },
        },
      },
    })
  ).toThrow(/exceeds radix/)
})
