import { base } from '$app/paths'
import { audioRecordings as parshaAudioRecordings } from '../../generated/audio-manifest.ts'
import { rangeAudioRecordings } from './range-audio-manifest.ts'
import { resolveRecordingMediaUrls } from './deployment-media.ts'

export const audioRecordings = [
  ...parshaAudioRecordings,
  ...rangeAudioRecordings,
].map((recording) => resolveRecordingMediaUrls(recording, base))
