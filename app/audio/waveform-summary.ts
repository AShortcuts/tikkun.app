export interface WaveformSummary {
  audioId: string
  duration: number
  buckets: number[]
}

export function createWaveformSummary({
  audioId,
  duration,
  channelData,
  bucketCount,
}: {
  audioId: string
  duration: number
  channelData: readonly Float32Array[]
  bucketCount: number
}): WaveformSummary {
  const safeBucketCount = Math.max(0, Math.floor(bucketCount))
  if (!safeBucketCount) return { audioId, duration, buckets: [] }
  const sampleCount = channelData.reduce(
    (longest, channel) => Math.max(longest, channel.length),
    0
  )
  if (!sampleCount || duration <= 0) {
    return { audioId, duration, buckets: Array.from({ length: safeBucketCount }, () => 0) }
  }

  const bucketSize = sampleCount / safeBucketCount
  const buckets = Array.from({ length: safeBucketCount }, (_, index) => {
    const start = Math.floor(index * bucketSize)
    const end = Math.max(start + 1, Math.floor((index + 1) * bucketSize))
    let sumOfSquares = 0
    let includedSampleCount = 0
    for (const channel of channelData) {
      const channelEnd = Math.min(end, channel.length)
      for (let sampleIndex = start; sampleIndex < channelEnd; sampleIndex += 1) {
        const sample = channel[sampleIndex] ?? 0
        sumOfSquares += sample * sample
        includedSampleCount += 1
      }
    }
    const volume = includedSampleCount
      ? Math.sqrt(sumOfSquares / includedSampleCount)
      : 0
    return Number(volume.toFixed(3))
  })

  return { audioId, duration, buckets }
}
