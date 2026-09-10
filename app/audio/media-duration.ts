import type { AudioRecording } from './types.ts'

const durations = new Map<string, number>()

export async function loadRecordingDuration(recording: AudioRecording, signal: AbortSignal): Promise<number> {
  const key = `${recording.playSrc}:${recording.mediaIdentity?.digest ?? ''}`
  const cached = durations.get(key)
  if (cached !== undefined) return cached
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const audio = new Audio()
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      const duration = audio.duration
      clearTimeout(timeout)
      audio.removeEventListener('loadedmetadata', loaded)
      audio.removeEventListener('error', failed)
      signal.removeEventListener('abort', aborted)
      audio.removeAttribute('src')
      audio.load()
      if (error) reject(error)
      else {
        durations.set(key, duration)
        resolve(duration)
      }
    }
    const loaded = () => finish(Number.isFinite(audio.duration) && audio.duration > 0 ? undefined : new Error(`Invalid audio duration for ${recording.title}`))
    const failed = () => finish(new Error(`Could not load ${recording.title}. Retry playback.`))
    const aborted = () => finish(new DOMException('Audio loading cancelled', 'AbortError'))
    const timeout = setTimeout(failed, 15_000)
    audio.addEventListener('loadedmetadata', loaded, { once: true })
    audio.addEventListener('error', failed, { once: true })
    signal.addEventListener('abort', aborted, { once: true })
    audio.preload = 'metadata'
    audio.src = recording.playSrc
    audio.load()
  })
}
