import { EventEmitter } from '../event-emitter.ts'
import type { AudioRecording, WordCue } from '../audio/types.ts'

export interface ActiveAudioSession {
  recording: AudioRecording
  cues: WordCue[]
  runId: string
  aliyahIndex: number
  tokenKeys: string[]
}

type AudioControllerEvents = {
  'session-loaded': ActiveAudioSession
  'playback-updated': { playing: boolean }
  'frame-updated': { currentTime: number }
  'time-updated': { currentTime: number }
}

export class AudioController extends EventEmitter<AudioControllerEvents> {
  private activeSession: ActiveAudioSession | null = null
  private playbackFrame = 0

  private readonly pumpPlaybackFrame = () => {
    if (this.audio.paused || this.audio.ended) {
      this.playbackFrame = 0
      return
    }

    this.emit('frame-updated', { currentTime: this.audio.currentTime })
    this.playbackFrame = requestAnimationFrame(this.pumpPlaybackFrame)
  }

  constructor(readonly audio: HTMLAudioElement) {
    super()
    audio.addEventListener('play', () => {
      this.startPlaybackFrameLoop()
      this.emit('playback-updated', { playing: true })
    })
    audio.addEventListener('pause', () => {
      this.stopPlaybackFrameLoop()
      this.emit('playback-updated', { playing: false })
    })
    audio.addEventListener('ended', () => {
      this.stopPlaybackFrameLoop()
      this.emit('frame-updated', { currentTime: audio.currentTime })
    })
    audio.addEventListener('seeked', () =>
      this.emit('frame-updated', { currentTime: audio.currentTime })
    )
    audio.addEventListener('timeupdate', () =>
      this.emit('time-updated', { currentTime: audio.currentTime })
    )
  }

  private startPlaybackFrameLoop() {
    if (this.playbackFrame) return
    this.playbackFrame = requestAnimationFrame(this.pumpPlaybackFrame)
  }

  private stopPlaybackFrameLoop() {
    if (!this.playbackFrame) return
    cancelAnimationFrame(this.playbackFrame)
    this.playbackFrame = 0
  }

  get session() {
    return this.activeSession
  }

  async loadSession(session: ActiveAudioSession) {
    this.activeSession = session
    if (this.audio.src !== session.recording.playSrc) {
      this.audio.src = session.recording.playSrc
      this.audio.load()
    }
    this.emit('session-loaded', session)
    return session
  }

  togglePlayback() {
    if (this.audio.paused) return this.audio.play()
    this.audio.pause()
  }

  play() {
    return this.audio.play()
  }

  pause() {
    this.audio.pause()
  }

  seek(time: number) {
    this.audio.currentTime = time
  }

  replayFromStart() {
    const startTime = this.activeSession?.cues[0]?.timeStart ?? 0
    this.seek(startTime)
    return this.play()
  }

  replayCurrentCue() {
    if (!this.activeSession?.cues.length) return
    const current = this.audio.currentTime
    let cueIndex = -1
    for (let i = this.activeSession.cues.length - 1; i >= 0; i--) {
      if (this.activeSession.cues[i].timeStart <= current) {
        cueIndex = i
        break
      }
    }
    const cue = this.activeSession.cues[Math.max(cueIndex, 0)]
    if (!cue) return
    this.seek(cue.timeStart)
    return this.play()
  }
}
