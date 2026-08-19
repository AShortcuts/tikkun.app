import { performance } from 'node:perf_hooks'
import {
  createSearchIndex,
  type SearchDocument,
} from '../app/search/index.ts'

const documentCount = 1_000
const searchesPerSample = 250
const sampleCount = 20

const documents: SearchDocument<number>[] = Array.from(
  { length: documentCount },
  (_, index) => ({
    id: `reading.${index}`,
    destinationId: `reading.${index}`,
    primary: index === 17 ? 'Noach Aliyah 3' : `Reading ${index}`,
    aliases: [
      index === 17 ? 'Noah 3' : `Alternate reading ${index}`,
      index === 18 ? 'נֹחַ' : `קריאה ${index}`,
    ],
    keywords: ['reading', `page ${index + 1}`],
    item: index,
  })
)

const queries = [
  'Noach 3',
  'Noah 3',
  'Noahc 3',
  'נח',
  'alternate reading 412',
  'readng 718',
  'page 900',
  '[',
]

function median(samples: number[]) {
  const ordered = [...samples].sort((left, right) => left - right)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 === 0
    ? ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2
    : (ordered[middle] ?? 0)
}

function measureIndexBuilds() {
  return Array.from({ length: sampleCount }, () => {
    const startedAt = performance.now()
    createSearchIndex(documents)
    return performance.now() - startedAt
  })
}

function measureSearches() {
  const index = createSearchIndex(documents)

  for (let iteration = 0; iteration < searchesPerSample; iteration += 1) {
    index.search(queries[iteration % queries.length] ?? '')
  }

  return Array.from({ length: sampleCount }, () => {
    const startedAt = performance.now()
    for (let iteration = 0; iteration < searchesPerSample; iteration += 1) {
      index.search(queries[iteration % queries.length] ?? '')
    }
    return (performance.now() - startedAt) / searchesPerSample
  })
}

const indexSamples = measureIndexBuilds()
const searchSamples = measureSearches()

console.log(
  JSON.stringify(
    {
      documents: documentCount,
      samples: sampleCount,
      searchesPerSample,
      medianIndexBuildMs: Number(median(indexSamples).toFixed(3)),
      medianSearchMs: Number(median(searchSamples).toFixed(3)),
    },
    null,
    2
  )
)
