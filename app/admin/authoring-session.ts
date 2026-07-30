import type { WordCue } from '../audio/types.ts'
import type {
  ActiveAudioSession,
  ActivePlaybackSegment,
} from '../reading/audio-controller.ts'
import type { PlaybackPlan } from '../reading/playback-plan.ts'

export function createAuthoringPlaybackPlan(
  plan: PlaybackPlan,
  recordingId: string
): PlaybackPlan | null {
  if (plan.status === 'overlap-only') return null

  const currentSegment = plan.segments.find(
    (segment) => segment.recording.id === recordingId
  )
  if (!currentSegment) return null

  return {
    ...plan,
    status:
      currentSegment.tokenKeys[0] === plan.tokenKeys[0]
        ? 'current-only'
        : 'partial-start',
    segments: [
      {
        ...currentSegment,
        startTime: 0,
        endTime: null,
      },
    ],
  }
}

export function getAuthoringSegment(
  session: ActiveAudioSession | null
): ActivePlaybackSegment | null {
  if (
    !session ||
    session.status === 'overlap-only' ||
    session.segments.length !== 1
  ) {
    return null
  }

  const segment = session.segments[0]
  return segment &&
    segment.recording.id === session.recording.id &&
    segment.startTime === 0 &&
    segment.endTime === null
    ? segment
    : null
}

export function isAuthoringSession(session: ActiveAudioSession | null) {
  return getAuthoringSegment(session) !== null
}

export function replaceAuthoringSessionCues(
  session: ActiveAudioSession,
  cues: WordCue[]
) {
  const segment = getAuthoringSegment(session)
  if (!segment) return false

  session.cues = cues
  segment.cues = cues
  return true
}

export interface ReaderPlaybackCheckpoint {
  session: ActiveAudioSession
  currentTime: number
}

export class AuthoringSessionTransition {
  private generation = 0
  private checkpoint: ReaderPlaybackCheckpoint | null = null

  begin(session: ActiveAudioSession, currentTime: number) {
    if (!Number.isFinite(currentTime) || currentTime < 0) {
      throw new TypeError('Reader playback checkpoint time must be finite and nonnegative')
    }
    this.checkpoint ??= { session, currentTime }
    return ++this.generation
  }

  isCurrent(generation: number) {
    return generation === this.generation
  }

  leave() {
    this.generation += 1
    const checkpoint = this.checkpoint
    this.checkpoint = null
    return checkpoint
  }
}
