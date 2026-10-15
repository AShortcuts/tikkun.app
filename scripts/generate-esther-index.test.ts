import { readFileSync, readdirSync } from 'node:fs'
import { expect, test } from 'vitest'
import { createEstherIndex } from './generate-esther-index.mjs'
import type { LineType } from '../app/components/Page.ts'

const directory = new URL('../text/pages/esther/', import.meta.url)
const files = readdirSync(directory).filter(file => /\.json$/.test(file)).sort((a, b) => parseInt(a) - parseInt(b))
const pages: LineType[][] = files.map(file => JSON.parse(readFileSync(new URL(file, directory), 'utf8')))

test('all 167 Esther verses are indexed against the 16 populated columns', () => {
  expect(files).toEqual(Array.from({ length: 16 }, (_, index) => `${index + 1}.json`))
  const index = createEstherIndex(pages)
  expect(Object.values(index[1]).map(chapter => Object.keys(chapter).length)).toEqual([22, 23, 15, 17, 14, 14, 10, 17, 32, 3])
  expect(index[1][10][3]).toEqual({ p: 16, l: 25 })
  expect(JSON.parse(readFileSync(new URL('../text/esther-toc.json', import.meta.url), 'utf8'))).toEqual(index)
})

test('index generation rejects empty columns and missing or repeated references', () => {
  expect(() => createEstherIndex([...pages, []])).toThrow('column 17 is empty')
  const missing = structuredClone(pages)
  missing[0][0].verses = []
  expect(() => createEstherIndex(missing)).toThrow('Out-of-order')
  const duplicate = structuredClone(pages)
  duplicate[0][0].verses.push(duplicate[0][0].verses[0])
  expect(() => createEstherIndex(duplicate)).toThrow('Out-of-order')
  expect(() => createEstherIndex(pages.slice(0, -1))).toThrow('must end at 10:3')
})
