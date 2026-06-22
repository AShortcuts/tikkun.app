export interface WaveformSummary {
  audioId: string
  duration: number
  buckets: number[]
}

export function createWaveformSummary({
  audioId,
  duration,
  samples,
  bucketCount,
}: {
  audioId: string
  duration: number
  samples: Float32Array
  bucketCount: number
}): WaveformSummary {
  const safeBucketCount = Math.max(0, Math.floor(bucketCount))
  if (!safeBucketCount) return { audioId, duration, buckets: [] }
  if (!samples.length || duration <= 0) {
    return { audioId, duration, buckets: Array.from({ length: safeBucketCount }, () => 0) }
  }

  const bucketSize = samples.length / safeBucketCount
  const buckets = Array.from({ length: safeBucketCount }, (_, index) => {
    const start = Math.floor(index * bucketSize)
    const end = Math.max(start + 1, Math.floor((index + 1) * bucketSize))
    let peak = 0
    for (let sampleIndex = start; sampleIndex < Math.min(end, samples.length); sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(samples[sampleIndex] ?? 0))
    }
    return Number(peak.toFixed(3))
  })

  return { audioId, duration, buckets }
}
