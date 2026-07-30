import { audioRecordings as parshaAudioRecordings } from '../../generated/audio-manifest.ts'
import { rangeAudioRecordings } from './range-audio-manifest.ts'

export const audioRecordings = [
  ...parshaAudioRecordings,
  ...rangeAudioRecordings,
]
