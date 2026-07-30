import {
  createWaveformSummary,
  type WaveformSummary,
} from './waveform-summary.ts'

export type WaveformSummaryLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; summary: WaveformSummary }
  | { status: 'failed'; error: Error }

type WaveformEntry =
  | { status: 'loading'; controller: AbortController; promise: Promise<WaveformSummary | null> }
  | { status: 'ready'; summary: WaveformSummary }
  | { status: 'failed'; error: Error }

export class WaveformSummaryLoader {
  private readonly entries = new Map<string, WaveformEntry>()

  constructor(
    private readonly loadSummary: (
      signal: AbortSignal
    ) => Promise<WaveformSummary>
  ) {}

  state(key: string): WaveformSummaryLoadState {
    const entry = this.entries.get(key)
    if (!entry) return { status: 'idle' }
    if (entry.status === 'ready') return entry
    if (entry.status === 'failed') return entry
    return { status: 'loading' }
  }

  load(key: string) {
    const entry = this.entries.get(key)
    if (entry?.status === 'ready') return Promise.resolve(entry.summary)
    if (entry?.status === 'failed') return Promise.resolve(null)
    if (entry?.status === 'loading') return entry.promise

    const controller = new AbortController()
    const promise = this.loadSummary(controller.signal)
      .then((summary) => {
        if (controller.signal.aborted) return null
        this.entries.set(key, { status: 'ready', summary })
        return summary
      })
      .catch((error: unknown): null => {
        if (controller.signal.aborted) {
          if (this.entries.get(key)?.status === 'loading') this.entries.delete(key)
          return null
        }
        const failure = error instanceof Error
          ? error
          : new Error('Waveform summary generation failed')
        this.entries.set(key, { status: 'failed', error: failure })
        return null
      })
    this.entries.set(key, { status: 'loading', controller, promise })
    return promise
  }

  retry(key: string) {
    this.cancel(key)
    return this.load(key)
  }

  cancel(key: string) {
    const entry = this.entries.get(key)
    if (entry?.status === 'loading') entry.controller.abort()
    this.entries.delete(key)
  }

  cancelExcept(key: string | null) {
    for (const candidate of this.entries.keys()) {
      if (candidate !== key) this.cancel(candidate)
    }
  }
}

export async function decodeWaveformSummary({
  audioId,
  src,
  bucketCount,
  signal,
}: {
  audioId: string
  src: string
  bucketCount: number
  signal: AbortSignal
}) {
  const response = await fetch(src, { signal })
  if (!response.ok) {
    throw new Error(`Waveform media request failed with ${response.status}`)
  }

  const buffer = await response.arrayBuffer()
  if (signal.aborted) throw new DOMException('Waveform load cancelled', 'AbortError')
  const audioContext = new AudioContext()
  try {
    const decoded = await audioContext.decodeAudioData(buffer)
    if (signal.aborted) throw new DOMException('Waveform load cancelled', 'AbortError')
    return createWaveformSummary({
      audioId,
      duration: decoded.duration,
      channelData: Array.from(
        { length: decoded.numberOfChannels },
        (_, channelIndex) => decoded.getChannelData(channelIndex)
      ),
      bucketCount,
    })
  } finally {
    if (audioContext.state !== 'closed') await audioContext.close()
  }
}
