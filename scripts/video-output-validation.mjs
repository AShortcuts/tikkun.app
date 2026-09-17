function frameRate(value) {
  const [numerator, denominator = 1] = String(value).split('/').map(Number)
  return numerator / denominator
}

export function outputValidationErrors(probe, expected, ffmpegLog) {
  const errors = []
  const video = probe.streams?.find((stream) => stream.codec_type === 'video')
  const audio = probe.streams?.find((stream) => stream.codec_type === 'audio')
  if (!video) errors.push('missing video stream')
  if (!audio) errors.push('missing audio stream')
  const checks = [
    ['width', Number(video?.width), expected.width, 0],
    ['height', Number(video?.height), expected.height, 0],
    ['fps', frameRate(video?.avg_frame_rate), expected.fps, 0.01],
    ['frame count', Number(video?.nb_read_frames), expected.frameCount, 0],
    ['duration', Number(probe.format?.duration), expected.duration, 0.35],
  ]
  for (const [label, actual, wanted, tolerance] of checks) {
    if (!Number.isFinite(actual) || actual <= 0 || Math.abs(actual - wanted) > tolerance) {
      errors.push(`${label} mismatch or unavailable: ${actual} (expected ${wanted})`)
    }
  }
  if (/\bdrop=\s*[1-9]\d*/i.test(ffmpegLog)) errors.push('ffmpeg reported dropped frames')
  if (expected.renderMode !== 'cue-keyframes' && /\bdup=\s*[1-9]\d*/i.test(ffmpegLog)) {
    errors.push('ffmpeg reported duplicated frames')
  }
  if (/non-monoton(?:ous|ic)/i.test(ffmpegLog)) errors.push('ffmpeg reported non-monotonic timestamps')
  if (/\berror\b/i.test(ffmpegLog)) errors.push('ffmpeg log contains error wording')
  return errors
}
