export type PlaybackSessionAliyahIndex = number | 'Maftir'

type PlaybackTarget = {
  recordingId: string
  runId: string
  aliyahIndex: PlaybackSessionAliyahIndex
}

type ActivePlaybackSession = {
  recording: { id: string }
  runId: string
  aliyahIndex: PlaybackSessionAliyahIndex
}

export function playbackTargetKey({
  recordingId,
  runId,
  aliyahIndex,
}: PlaybackTarget) {
  return `${recordingId}:${runId}:${aliyahIndex}`
}

export function playbackTokenRangeAliyahIndex(
  aliyahIndex: PlaybackSessionAliyahIndex
) {
  return aliyahIndex
}

export function activePlaybackSessionKey(session: ActivePlaybackSession) {
  return playbackTargetKey({
    recordingId: session.recording.id,
    runId: session.runId,
    aliyahIndex: session.aliyahIndex,
  })
}

export function isActivePlaybackTarget(
  session: ActivePlaybackSession | null | undefined,
  target: PlaybackTarget
) {
  return Boolean(session && activePlaybackSessionKey(session) === playbackTargetKey(target))
}
