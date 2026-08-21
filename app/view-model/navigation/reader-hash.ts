const referencePattern = '[1-9]\\d*-[1-9]\\d*-[1-9]\\d*'
const slugPattern = '[a-z0-9]+(?:-[a-z0-9]+)*'
const referenceSuffixPattern = new RegExp(`/${referencePattern}$`)
const torahParshaHashPattern = new RegExp(
  `^#/torah/parsha/${slugPattern}(?:/${referencePattern})?$`
)
const estherParshaHashPattern = new RegExp(
  `^#/esther/(?!page(?:/|$))${slugPattern}(?:/${referencePattern})?$`
)
const readerHashPatterns = [
  new RegExp(`^#/run/[^/?#\\s]+(?:/${referencePattern})?$`),
  new RegExp(`^#/r/${referencePattern}$`),
  torahParshaHashPattern,
  /^#\/torah\/page\/[1-9]\d*$/,
  estherParshaHashPattern,
  /^#\/esther\/page\/[1-9]\d*$/,
] as const

const semanticParshaHashPatterns = [
  torahParshaHashPattern,
  estherParshaHashPattern,
] as const

export function isReaderHash(hash: unknown): hash is string {
  return (
    typeof hash === 'string' &&
    readerHashPatterns.some((pattern) => pattern.test(hash))
  )
}

export function isSemanticParshaHash(hash: unknown) {
  return (
    typeof hash === 'string' &&
    semanticParshaHashPatterns.some((pattern) => pattern.test(hash))
  )
}

export function preserveSemanticParshaRoute(
  currentHash: string,
  scrolledHash: string
) {
  if (
    !isSemanticParshaHash(currentHash) ||
    isSemanticParshaHash(scrolledHash)
  ) {
    return scrolledHash
  }

  const referenceSuffix = scrolledHash.match(referenceSuffixPattern)?.[0]
  if (!referenceSuffix) return currentHash

  return `${currentHash.replace(referenceSuffixPattern, '')}${referenceSuffix}`
}
