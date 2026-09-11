// A JavaScript session can disappear before the native player releases its file.
// Keep prior sources until the corresponding release acknowledgment succeeds.
export function createPlaybackRetention(options: {
  currentSources(): readonly string[]
  whenReleased(): Promise<void>
  onReleased(): Promise<void>
}) {
  let retained = new Set<string>()
  let revision = 0
  let frozen = false
  const sources = () => [...new Set([...retained, ...options.currentSources()])]
  return {
    sources,
    async sync() {
      if (frozen) return
      retained = new Set(sources())
      const current = ++revision
      await options.whenReleased()
      if (frozen || current !== revision) return
      retained = new Set(options.currentSources())
      await options.onReleased()
    },
    freeze() {
      retained = new Set(sources())
      frozen = true
      revision += 1
      return [...retained]
    },
  }
}
