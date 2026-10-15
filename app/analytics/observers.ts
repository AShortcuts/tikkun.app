import type { ReaderPlaybackSnapshot, ReaderPlaybackChange } from '../reading/reader-playback.ts'
import type { DownloadEntry } from '../offline/download-library.ts'
import type { ReaderPreferences } from '../reader-preferences.ts'
import { analyticsIsCollecting, trackAnalytics } from './client.ts'

type PlaybackSnapshot = Pick<ReaderPlaybackSnapshot, 'sessionRevision' | 'currentTime' | 'playing' | 'ended'> & {
  session: { cueCount: number } | null
}

// Count state transitions, never render frames, progress ticks, or restored files.
export function createPlaybackAnalytics(now = () => performance.now()) {
  let revision = -1
  let started = false
  let completed = false
  let playing = false
  let lastTime = 0
  let lastClock = now()
  let seconds = 0
  const flush = () => {
    const whole = Math.min(3600, Math.floor(seconds))
    if (whole) { trackAnalytics('playback_listened', { seconds: whole }); seconds -= whole }
  }
  return {
    update(change: Pick<ReaderPlaybackChange, 'type'>, snapshot: PlaybackSnapshot) {
      const current = now()
      if (!analyticsIsCollecting()) {
        revision = -1; started = false; completed = false; playing = false; seconds = 0
        lastTime = snapshot.currentTime; lastClock = current
        return
      }
      if (revision !== snapshot.sessionRevision || !snapshot.session) {
        flush(); revision = snapshot.sessionRevision; started = false; completed = false; playing = false; seconds = 0
      }
      const delta = snapshot.currentTime - lastTime
      // Audio position can jump when seeking; only count normal forward motion.
      if (playing && snapshot.playing && delta > 0 && delta <= Math.max(1, (current - lastClock) / 1000 * 3 + 0.5)) seconds += delta
      if (snapshot.playing && !started) {
        started = true
        trackAnalytics('playback_start', { timed: (snapshot.session?.cueCount ?? 0) > 0 })
      }
      if (snapshot.ended && started && !completed) { completed = true; flush(); trackAnalytics('playback_complete') }
      else if (playing && !snapshot.playing && snapshot.session) { flush(); trackAnalytics('playback_pause') }
      if (change.type === 'playback-error') trackAnalytics('playback_error', { reason: 'playback' })
      if (change.type === 'offline-media-error') trackAnalytics('playback_error', { reason: 'offline' })
      if (seconds >= 30) flush()
      playing = snapshot.playing; lastTime = snapshot.currentTime; lastClock = current
    },
    flush,
  }
}

export function createDownloadAnalytics() {
  const active = new Set<string>()
  const phases = new Map<string, DownloadEntry['phase']>()
  let initialized = false
  return (snapshot: { entries: readonly Pick<DownloadEntry, 'key' | 'phase'>[] }) => {
    const collecting = analyticsIsCollecting()
    if (!collecting) active.clear()
    for (const entry of snapshot.entries) {
      const previous = phases.get(entry.key)
      phases.set(entry.key, entry.phase)
      if (!collecting || !initialized || previous === entry.phase) continue
      if (entry.phase === 'queued' && !active.has(entry.key)) {
        active.add(entry.key); trackAnalytics('download_start')
      }
      if (!active.has(entry.key)) continue
      const event = entry.phase === 'stored' ? 'download_complete' : entry.phase === 'error' ? 'download_error' : entry.phase === 'paused' ? 'download_pause' : null
      if (event) { active.delete(entry.key); trackAnalytics(event) }
    }
    initialized = true
  }
}

export function trackPreferenceChanges(previous: ReaderPreferences, next: ReaderPreferences) {
  const fields = [
    ['readerTextLayout', 'layout'], ['readerSideMode', 'sides'], ['themeMode', 'theme'],
  ] as const
  for (const [field, setting] of fields) if (previous[field] !== next[field]) trackAnalytics('reader_setting', { setting, value: next[field] })
  if (previous.autoScrollWithPlayback !== next.autoScrollWithPlayback) trackAnalytics('reader_setting', { setting: 'auto_scroll', value: next.autoScrollWithPlayback ? 'on' : 'off' })
  if (previous.playbackRate !== next.playbackRate) trackAnalytics('reader_setting', { setting: 'speed', value: next.playbackRate < 1 ? 'slower' : next.playbackRate > 1 ? 'faster' : 'normal' })
}
