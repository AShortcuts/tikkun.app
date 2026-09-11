export interface StoredRecording {
  readonly audioId: string
  readonly digest: string
  readonly byteLength: number
  readonly url: string
}

export function parseRecordingInventory(value: unknown): readonly StoredRecording[] {
  if (!value || typeof value !== 'object' || !('type' in value) || value.type !== 'RECORDING_LIBRARY') {
    throw new Error('Invalid recording library response')
  }
  if ('state' in value && value.state === 'error') {
    throw new Error('errorMessage' in value && typeof value.errorMessage === 'string'
      ? value.errorMessage : 'Could not inspect saved recordings.')
  }
  if (!('state' in value) || value.state !== 'ready' || !('recordings' in value) || !Array.isArray(value.recordings)) {
    throw new Error('Invalid recording library inventory')
  }
  const seenUrls = new Set<string>()
  return Object.freeze(value.recordings.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' ||
      !('audioId' in entry) || typeof entry.audioId !== 'string' || !entry.audioId ||
      !('digest' in entry) || typeof entry.digest !== 'string' || !/^[a-f0-9]{64}$/.test(entry.digest) ||
      !('byteLength' in entry) || typeof entry.byteLength !== 'number' || !Number.isSafeInteger(entry.byteLength) || entry.byteLength <= 0 ||
      !('url' in entry) || typeof entry.url !== 'string' || !entry.url || seenUrls.has(entry.url)) {
      throw new Error('Invalid or duplicate stored recording')
    }
    seenUrls.add(entry.url)
    return Object.freeze({ audioId: entry.audioId, digest: entry.digest, byteLength: entry.byteLength, url: entry.url })
  }))
}
