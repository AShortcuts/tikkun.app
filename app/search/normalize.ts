export type SearchRange = readonly [start: number, end: number]

export type NormalizedSearchText = {
  original: string
  value: string
  originalIndices: readonly number[]
}

const SEARCH_CHARACTER = /[\p{L}\p{N}]/u
const COMBINING_MARK = /\p{M}/u

export function normalizeSearchTextWithMap(
  original: string
): NormalizedSearchText {
  const normalized: string[] = []
  const originalIndices: number[] = []
  let originalIndex = 0

  const appendSpace = (sourceIndex: number) => {
    if (!normalized.length || normalized.at(-1) === ' ') return
    normalized.push(' ')
    originalIndices.push(sourceIndex)
  }

  for (const sourceCharacter of original) {
    const sourceIndex = originalIndex
    originalIndex += sourceCharacter.length

    for (const character of sourceCharacter
      .normalize('NFKD')
      .toLocaleLowerCase()) {
      if (COMBINING_MARK.test(character)) continue
      if (!SEARCH_CHARACTER.test(character)) {
        appendSpace(sourceIndex)
        continue
      }

      normalized.push(character)
      for (let offset = 0; offset < character.length; offset += 1) {
        originalIndices.push(sourceIndex)
      }
    }
  }

  if (normalized.at(-1) === ' ') {
    normalized.pop()
    originalIndices.pop()
  }

  return {
    original,
    value: normalized.join(''),
    originalIndices,
  }
}

export function normalizeSearchText(value: string) {
  return normalizeSearchTextWithMap(value).value
}

export function tokenizeSearchText(value: string) {
  const normalized = normalizeSearchText(value)
  return normalized ? normalized.split(' ') : []
}

export function mapNormalizedRangesToOriginal(
  text: NormalizedSearchText,
  ranges: readonly SearchRange[]
): SearchRange[] {
  const mapped = ranges.flatMap(([normalizedStart, normalizedEnd]) => {
    const start = text.originalIndices[normalizedStart]
    const lastSourceIndex = text.originalIndices[normalizedEnd]
    if (start === undefined || lastSourceIndex === undefined) return []

    const nextSourceIndex = text.originalIndices
      .slice(normalizedEnd + 1)
      .find((index) => index > lastSourceIndex)
    const end = (nextSourceIndex ?? text.original.length) - 1
    return [[start, Math.max(start, end)] as const]
  })

  return mergeSearchRanges(mapped)
}

export function mergeSearchRanges(ranges: readonly SearchRange[]) {
  const sorted = [...ranges].sort(
    ([leftStart, leftEnd], [rightStart, rightEnd]) =>
      leftStart - rightStart || leftEnd - rightEnd
  )
  const merged: Array<[number, number]> = []

  for (const [start, end] of sorted) {
    const previous = merged.at(-1)
    if (!previous || start > previous[1] + 1) {
      merged.push([start, end])
      continue
    }
    previous[1] = Math.max(previous[1], end)
  }

  return merged
}
