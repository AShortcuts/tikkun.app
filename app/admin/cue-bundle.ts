import { parseCueExportPayload } from '../audio/cue-validation.ts'
import type { CueExportPayload } from '../audio/types.ts'
import { readZipEntries } from './zip-entries.ts'

export interface CueBundleEntry {
  fileName: string
  payload: CueExportPayload
}

export interface CueBundle {
  name: string
  entries: CueBundleEntry[]
}

/** The aliyot chosen from a ZIP; their cues live in the admin drafts. */
export interface StoredCueBundle {
  version: 2
  name: string
  audioIds: string[]
}

export const cueBundleStorageKey = 'tikkun-admin-cue-bundle'
const maxBundleBytes = 60 * 1024 * 1024

export const isZipFile = (file: Pick<File, 'name' | 'type'>) =>
  /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed'

const isIgnoredEntry = (name: string) => {
  const base = name.split('/').pop() ?? ''
  return name.startsWith('__MACOSX/') || base.startsWith('.') || base === 'manifest.json' || !base.endsWith('.json')
}

function sortEntries(entries: CueBundleEntry[]) {
  const key = ({ payload }: CueBundleEntry) => `${payload.narratorId}/${payload.readingId}/${payload.aliyah}`
  return entries.sort((left, right) => key(left).localeCompare(key(right), undefined, { numeric: true }))
}

/** Opens an aligner cue ZIP: one cue JSON per recording plus an optional manifest. */
export async function readCueBundleFile(file: File): Promise<CueBundle> {
  if (file.size > maxBundleBytes) throw new Error('This ZIP is too large to open here. Download fewer recordings at a time.')
  const decoder = new TextDecoder()
  const entries: CueBundleEntry[] = []
  const audioIds = new Set<string>()
  for (const entry of await readZipEntries(await file.arrayBuffer())) {
    if (isIgnoredEntry(entry.name)) continue
    let value: unknown
    try {
      value = JSON.parse(decoder.decode(entry.bytes))
    } catch (error) {
      throw new Error(`${entry.name} is not valid JSON.`, { cause: error })
    }
    const payload = parseCueExportPayload(value)
    if (!payload) throw new Error(`${entry.name} is not a valid cue file.`)
    if (audioIds.has(payload.audioId)) throw new Error(`This ZIP has more than one cue file for ${payload.audioId}.`)
    audioIds.add(payload.audioId)
    entries.push({ fileName: entry.name, payload })
  }
  if (!entries.length) throw new Error('This ZIP has no cue files.')
  return { name: file.name, entries: sortEntries(entries) }
}

export function storeCueBundle(storage: Storage, bundle: StoredCueBundle | null) {
  if (bundle) storage.setItem(cueBundleStorageKey, JSON.stringify(bundle))
  else storage.removeItem(cueBundleStorageKey)
}

export function loadStoredCueBundle(storage: Storage): StoredCueBundle | null {
  const raw = storage.getItem(cueBundleStorageKey)
  if (raw === null) return null
  const value: unknown = JSON.parse(raw)
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  if (record.version !== 2 || typeof record.name !== 'string' || !Array.isArray(record.audioIds) ||
      record.audioIds.some((audioId) => typeof audioId !== 'string')) {
    throw new Error('The saved list of ZIP aliyot is damaged. Import the ZIP again.')
  }
  return { version: 2, name: record.name, audioIds: [...record.audioIds as string[]] }
}
