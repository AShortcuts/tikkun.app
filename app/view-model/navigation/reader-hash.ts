const referencePattern = '[1-9]\\d*-[1-9]\\d*-[1-9]\\d*'
const slugPattern = '[a-z0-9]+(?:-[a-z0-9]+)*'
const aliyahSuffixPattern = '/aliyah/(?:[1-8]|Maftir)'
const referenceSuffixPattern = new RegExp(`(/${referencePattern})(${aliyahSuffixPattern})?$`)
const torahParshaHashPattern = new RegExp(
  `^#/torah/parsha/${slugPattern}(?:/${referencePattern}(?:${aliyahSuffixPattern})?)?$`
)
const estherParshaHashPattern = new RegExp(
  `^#/esther/(?!(?:page|parsha)(?:/|$))${slugPattern}(?:/${referencePattern})?$`
)
const readerHashPatterns = [
  new RegExp(`^#/run/[^/?#\\s]+(?:/${referencePattern}(?:${aliyahSuffixPattern})?)?$`),
  new RegExp(`^#/torah/${referencePattern}$`),
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
    readerHashPatterns.some((pattern) => pattern.exec(hash)?.[0] === hash)
  )
}

export function isSemanticParshaHash(hash: unknown) {
  return (
    typeof hash === 'string' &&
    semanticParshaHashPatterns.some((pattern) => pattern.exec(hash)?.[0] === hash)
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

  if (!isReaderHash(scrolledHash)) return currentHash
  const reference = scrolledHash.match(referenceSuffixPattern)?.[1]
  if (!reference) return currentHash
  // Dated service indices need not match the canonical parsha's divisions.
  const currentAliyahSuffix = currentHash.match(referenceSuffixPattern)?.[2] ?? ''

  return `${currentHash.replace(referenceSuffixPattern, '')}${reference}${currentAliyahSuffix}`
}
