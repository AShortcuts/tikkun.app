import { audioRecordings as parshaAudioRecordings } from './audio-manifest.generated.ts'
import { rangeAudioRecordings } from './range-audio-manifest.ts'

export const audioRecordings = [
  ...parshaAudioRecordings,
  ...rangeAudioRecordings,
]
