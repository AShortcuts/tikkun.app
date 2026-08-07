export interface HttpByteRange {
  start: number
  end: number
}

export function parseHttpByteRange(
  header: string,
  totalLength: number
): HttpByteRange | null {
  if (!Number.isSafeInteger(totalLength) || totalLength <= 0) return null

  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
  if (!match || (!match[1] && !match[2])) return null

  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null
    return {
      start: Math.max(0, totalLength - suffixLength),
      end: totalLength - 1,
    }
  }

  const start = Number(match[1])
  if (!Number.isSafeInteger(start) || start >= totalLength) return null

  const requestedEnd = match[2] ? Number(match[2]) : totalLength - 1
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return null

  return {
    start,
    end: Math.min(requestedEnd, totalLength - 1),
  }
}
