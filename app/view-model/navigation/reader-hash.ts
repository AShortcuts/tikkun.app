const referencePattern = '[1-9]\\d*-[1-9]\\d*-[1-9]\\d*'
const slugPattern = '[a-z0-9]+(?:-[a-z0-9]+)*'
const readerHashPatterns = [
  new RegExp(`^#/run/[^/?#\\s]+(?:/${referencePattern})?$`),
  new RegExp(`^#/r/${referencePattern}$`),
  new RegExp(`^#/torah/parsha/${slugPattern}(?:/${referencePattern})?$`),
  /^#\/torah\/page\/[1-9]\d*$/,
  new RegExp(`^#/esther/${slugPattern}(?:/${referencePattern})?$`),
  /^#\/esther\/page\/[1-9]\d*$/,
] as const

export function isReaderHash(hash: unknown): hash is string {
  return (
    typeof hash === 'string' &&
    readerHashPatterns.some((pattern) => pattern.test(hash))
  )
}
