export type PlaybackSessionAliyahIndex = number | 'Maftir'

type CueLocation = {
  pageNumber: number
  lineIndex: number
}

type CueTokenLocation = CueLocation & {
  fragmentIndex: number
  wordIndex: number
}

type PhysicalLocation = {
  pageNumber: number
  lineNumber: number
}

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

export function firstCueAtOrAfterLocation<T extends CueLocation>(
  cues: T[],
  location: PhysicalLocation | null | undefined
) {
  if (!location) return cues[0] ?? null
  const lineIndex = Math.max(0, location.lineNumber - 1)
  return (
    cues.find(
      (cue) =>
        cue.pageNumber > location.pageNumber ||
        (cue.pageNumber === location.pageNumber && cue.lineIndex >= lineIndex)
    ) ??
    cues[0] ??
    null
  )
}

export function firstCueForTokenKeys<T extends CueTokenLocation>(
  cues: T[],
  tokenKeys: string[]
) {
  const cueByTokenKey = new Map(
    cues.map((cue) => [
      `${cue.pageNumber}:${cue.lineIndex}:${cue.fragmentIndex}:${cue.wordIndex}`,
      cue,
    ])
  )

  for (const tokenKey of tokenKeys) {
    const cue = cueByTokenKey.get(tokenKey)
    if (cue) return cue
  }

  return null
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
