export interface TokenPosition {
  pageNumber: number
  lineIndex: number
  fragmentIndex: number
  wordIndex: number
}

const tokenKeyPattern = /^([1-9]\d*):(0|[1-9]\d*):(0|[1-9]\d*):(0|[1-9]\d*)$/

function isSafeIndex(value: unknown, minimum: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= minimum
  )
}

export function isTokenPosition(value: unknown): value is TokenPosition {
  if (!value || typeof value !== 'object') return false
  const position = value as Partial<TokenPosition>
  return (
    isSafeIndex(position.pageNumber, 1) &&
    isSafeIndex(position.lineIndex, 0) &&
    isSafeIndex(position.fragmentIndex, 0) &&
    isSafeIndex(position.wordIndex, 0)
  )
}

export function parseTokenKey(tokenKey: string): TokenPosition | null {
  const match = tokenKeyPattern.exec(tokenKey)
  if (!match) return null

  const position: TokenPosition = {
    pageNumber: Number(match[1]),
    lineIndex: Number(match[2]),
    fragmentIndex: Number(match[3]),
    wordIndex: Number(match[4]),
  }
  return isTokenPosition(position) ? position : null
}

export function isValidTokenKey(tokenKey: string) {
  return parseTokenKey(tokenKey) !== null
}

export function formatTokenKey(position: TokenPosition) {
  if (!isTokenPosition(position)) {
    throw new TypeError('Cannot format an invalid token position')
  }
  return `${position.pageNumber}:${position.lineIndex}:${position.fragmentIndex}:${position.wordIndex}`
}

export function compareTokenPositions(left: TokenPosition, right: TokenPosition) {
  return (
    compareNumber(left.pageNumber, right.pageNumber) ||
    compareNumber(left.lineIndex, right.lineIndex) ||
    compareNumber(left.fragmentIndex, right.fragmentIndex) ||
    compareNumber(left.wordIndex, right.wordIndex)
  )
}

function compareNumber(left: number, right: number) {
  if (left === right) return 0
  return left < right ? -1 : 1
}
