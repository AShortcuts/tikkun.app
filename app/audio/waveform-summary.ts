export interface WaveformSummary {
  audioId: string
  duration: number
  sampleRate: number
  sampleCount: number
  stepSamples: number
  min: Float32Array
  max: Float32Array
}

export function createWaveformSummary({
  audioId,
  sampleRate,
  channelData,
}: {
  audioId: string
  sampleRate: number
  channelData: readonly Float32Array[]
}): WaveformSummary {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('Waveform sample rate must be positive and finite')
  }
  const sampleCount = channelData.reduce(
    (longest, channel) => Math.max(longest, channel.length),
    0
  )
  const stepSamples = Math.max(1, Math.round(sampleRate * 0.01))
  const binCount = Math.ceil(sampleCount / stepSamples)
  const min = new Float32Array(binCount)
  const max = new Float32Array(binCount)
  for (let index = 0; index < binCount; index += 1) {
    const start = index * stepSamples
    const end = Math.min(start + stepSamples, sampleCount)
    let low = Infinity
    let high = -Infinity
    // Keep transients from every channel, including opposite-phase stereo.
    for (const channel of channelData) {
      const channelEnd = Math.min(end, channel.length)
      for (let sampleIndex = start; sampleIndex < channelEnd; sampleIndex += 1) {
        const sample = channel[sampleIndex]
        if (!Number.isFinite(sample)) {
          throw new Error('Waveform audio contains a non-finite sample')
        }
        low = Math.min(low, sample)
        high = Math.max(high, sample)
      }
    }
    min[index] = low
    max[index] = high
  }

  return {
    audioId,
    duration: sampleCount / sampleRate,
    sampleRate,
    sampleCount,
    stepSamples,
    min,
    max,
  }
}
