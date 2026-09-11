/// <reference types="vite/client" />

import { cueFileRelativePathForRecording } from './cue-file.ts'
import {
  audioMediaIdentitiesEqual,
  cuePayloadMatchesRecording,
  inspectCueExportPayload,
} from './cue-validation.ts'
import type { AudioRecording, CueExportPayload } from './types.ts'
import { RetryablePromiseCache } from '../data/retryable-promise-cache.ts'

const cuePayloadLoaders = import.meta.glob<unknown>('../../audio-cues/**/*.json', {
  import: 'default',
})

export type CueDataProblemCode =
  | 'invalid-payload'
  | 'recording-mismatch'
  | 'load-failed'

export interface CueDataProblem {
  code: CueDataProblemCode
  message: string
  details: string[]
}

export type CueDataResolution =
  | {
      status: 'ready'
      path: string
      payload: CueExportPayload
    }
  | {
      status: 'missing'
      path: string | null
      payload: null
    }
  | {
      status: 'invalid' | 'unavailable'
      path: string
      payload: null
      problem: CueDataProblem
    }

type CuePayloadLoader = () => Promise<unknown>

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function describeRecordingMismatch(
  payload: CueExportPayload,
  recording: AudioRecording
) {
  const details: string[] = []
  const compare = (field: string, actual: unknown, expected: unknown) => {
    if (actual !== expected) {
      details.push(
        `${field} is ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}.`
      )
    }
  }

  compare('audioId', payload.audioId, recording.id)
  compare('audioFormat', payload.audioFormat, recording.format)
  compare('narratorId', payload.narratorId, recording.narratorId)
  compare('readingId', payload.readingId, recording.reading.id)
  compare('aliyah', payload.aliyah, recording.aliyah)
  if (
    payload.mediaIdentity &&
    (!recording.mediaIdentity ||
      !audioMediaIdentitiesEqual(payload.mediaIdentity, recording.mediaIdentity))
  ) {
    details.push('mediaIdentity does not match the published audio file.')
  }
  return details
}

export class CueDataResolver {
  private readonly resolutionsByPath = new RetryablePromiseCache<
    string,
    CueDataResolution
  >()

  constructor(
    private readonly loaders: Readonly<Record<string, CuePayloadLoader>>
  ) {}

  resolvePath(path: string): Promise<CueDataResolution> {
    const loader = this.loaders[path]
    if (!loader) {
      return Promise.resolve({ status: 'missing', path, payload: null })
    }

    const resolution = this.resolutionsByPath.get(path, async () => {
      let value: unknown
      try {
        value = await loader()
      } catch (error) {
        return {
          status: 'unavailable',
          path,
          payload: null,
          problem: {
            code: 'load-failed',
            message: 'The published Cue Data file could not be loaded.',
            details: [errorMessage(error)],
          },
        }
      }

      const inspection = inspectCueExportPayload(value)
      if (inspection.status === 'invalid') {
        return {
          status: 'invalid',
          path,
          payload: null,
          problem: {
            code: 'invalid-payload',
            message: 'The published Cue Data file is not valid.',
            details: inspection.issues.map(
              (issue) => `${issue.path}: ${issue.message}`
            ),
          },
        }
      }
      return { status: 'ready', path, payload: inspection.payload }
    })
    void resolution.then(
      (result) => {
        if (result.status === 'unavailable') {
          this.resolutionsByPath.delete(path, resolution)
        }
      },
      () => undefined
    )
    return resolution
  }

  async resolve(recording: AudioRecording): Promise<CueDataResolution> {
    const path = cuePayloadPathForRecording(recording)
    if (!path) return { status: 'missing', path: null, payload: null }

    const resolution = await this.resolvePath(path)
    if (
      resolution.status !== 'ready' ||
      cuePayloadMatchesRecording(resolution.payload, recording)
    ) {
      return resolution
    }

    return {
      status: 'invalid',
      path,
      payload: null,
      problem: {
        code: 'recording-mismatch',
        message: 'The published Cue Data belongs to a different recording.',
        details: describeRecordingMismatch(resolution.payload, recording),
      },
    }
  }

  retry(recording: AudioRecording) {
    const path = cuePayloadPathForRecording(recording)
    if (path) this.resolutionsByPath.delete(path)
    return this.resolve(recording)
  }
}

const cueDataResolver = new CueDataResolver(cuePayloadLoaders)

export function publishedCueSourceForRecording(recording: AudioRecording): string | null {
  const path = cuePayloadPathForRecording(recording)
  return path && Object.hasOwn(cuePayloadLoaders, path) ? path.slice('../../'.length) : null
}

export function cuePayloadPathForRecording({
  narratorId,
  reading,
  aliyah,
}: Pick<AudioRecording, 'narratorId' | 'reading' | 'aliyah'>) {
  const relativePath = cueFileRelativePathForRecording({
    narratorId,
    reading,
    aliyah,
  })
  return relativePath ? `../../${relativePath}` : null
}

export async function loadCuePayloadByPath(path: string) {
  const resolution = await cueDataResolver.resolvePath(path)
  return resolution.payload
}

export async function loadCuePayloadForRecording(recording: AudioRecording) {
  const resolution = await cueDataResolver.resolve(recording)
  return resolution.payload
}

export function resolveCueDataForRecording(recording: AudioRecording) {
  return cueDataResolver.resolve(recording)
}

export function retryCueDataForRecording(recording: AudioRecording) {
  return cueDataResolver.retry(recording)
}
