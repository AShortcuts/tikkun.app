export function getWordProgress({
  cueIndex,
  cueCount,
  tokenCount,
}: {
  cueIndex: number
  cueCount: number
  tokenCount: number
}) {
  const total = tokenCount || cueCount
  const current =
    cueCount > 0
      ? Math.max(0, Math.min(total, Math.max(cueIndex + 1, 1)))
      : 0
  const ratio = total > 0 ? Math.max(0, Math.min(1, current / total)) : 0

  return {
    current,
    total,
    label: `${current} / ${total}`,
    ratio,
  }
}

export function getCueProgress({
  cueIndex,
  cueCount,
}: {
  cueIndex: number
  cueCount: number
}) {
  const total = Math.max(0, cueCount)
  const current = total > 0 ? Math.max(1, Math.min(total, cueIndex + 1)) : 0

  return {
    current,
    total,
    label: `Cue ${current} / ${total}`,
  }
}
