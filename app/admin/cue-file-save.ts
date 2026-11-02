export const cueFileSaveEndpoint = '/__tikkun/cue-files'
export const cueFileSaveHeader = 'x-tikkun-cue-save'

export type CueFileSaveResult =
  | { status: 'saved'; path: string; replaced: boolean; unchanged: boolean }
  | { status: 'unavailable' }

/**
 * Writes exported cue JSON into this checkout's audio-cues folder through the
 * local dev server. Other computers, builds, and the public site report
 * unavailable so Export falls back to downloads.
 */
export async function saveCueFileToProject(
  serialized: string,
  fetchImpl: typeof fetch = fetch
): Promise<CueFileSaveResult> {
  if (!import.meta.env.DEV) return { status: 'unavailable' }
  let response: Response
  try {
    response = await fetchImpl(cueFileSaveEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [cueFileSaveHeader]: '1' },
      body: serialized,
    })
  } catch (error) {
    throw new Error('The dev server did not respond. Check that npm run dev is still running.', { cause: error })
  }
  if (response.headers.get(cueFileSaveHeader) !== '1' || response.status === 403) {
    return { status: 'unavailable' }
  }
  const body: unknown = await response.json().catch(() => null)
  const result = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  if (!response.ok || result.ok !== true || typeof result.path !== 'string') {
    throw new Error(typeof result.error === 'string' ? result.error : `Saving failed with status ${response.status}.`)
  }
  return {
    status: 'saved',
    path: result.path,
    replaced: result.replaced === true,
    unchanged: result.unchanged === true,
  }
}
