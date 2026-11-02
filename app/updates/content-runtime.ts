import { CapacitorException, ExceptionCode } from '@capacitor/core'
import type { AudioNarrator, ParshaAudioRecording } from '../audio/types.ts'
import { isNativeApp } from '../platform/native.ts'
import { getNativeMedia } from '../platform/native-media.ts'
import { digestText, object } from './content-schema.ts'
import { ContentSession, storedCueFiles, type ContentStore } from './content-session.ts'
import { readBoundedResponse } from './download-response.ts'
import {
  PUBLISHED_CATALOG_MAX_BYTES,
  PUBLISHED_CONTENT_DIRECTORY,
  PUBLISHED_CUE_MAX_BYTES,
  parseBuiltInContent,
  parsePublishedCatalog,
  publishedCueFileName,
  type BuiltInContent,
  type PublishedCatalog,
} from './published-content.ts'
import { updateChannel, type UpdatePhase } from './update-state.ts'

// Recordings and cues come from the website, so they reach installed apps without
// an app update. The app keeps the last verified copy for offline use and falls
// back to the copy it was built with.
export interface ActiveContent {
  readonly recordings: ParshaAudioRecording[]
  readonly narrators: AudioNarrator[]
  hasCue(path: string): boolean
  // Paths are relative, such as `audio-cues/yoni-davidov/04 vayera/1.json`.
  cueLoader(path: string, builtInLoader?: () => Promise<unknown>): (() => Promise<unknown>) | undefined
}

export function createActiveContent(catalog: PublishedCatalog, builtIn: BuiltInContent, store: ContentStore): ActiveContent {
  return {
    recordings: catalog.recordings,
    narrators: catalog.narrators,
    hasCue: (path) => Object.hasOwn(catalog.cues, path),
    cueLoader(path, builtInLoader) {
      if (!Object.hasOwn(catalog.cues, path)) return undefined
      const digest = catalog.cues[path]
      if (builtInLoader && builtIn.cues[path] === digest) return builtInLoader
      const name = publishedCueFileName(digest)
      return async () => {
        const text = await store.read(name)
        if (text === null) throw new Error(`Saved cue file ${name} is missing`)
        if (await digestText(text) !== digest) throw new Error(`Saved cue file ${name} is damaged`)
        return JSON.parse(text)
      }
    },
  }
}

const isJsonResponse = (response: Response) =>
  response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() === 'application/json'

async function inBatches<T>(items: readonly T[], size: number, action: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(action))
  }
}

export async function refreshPublishedContent({ session, store, builtIn, origin, fetcher = fetch, signal, onDownload }: {
  session: ContentSession
  store: ContentStore
  builtIn: BuiltInContent
  origin: string
  fetcher?: typeof fetch
  signal?: AbortSignal
  onDownload?: () => void
}): Promise<Extract<UpdatePhase, 'current' | 'ready' | 'unpublished'>> {
  const base = `${origin}/${PUBLISHED_CONTENT_DIRECTORY}/`
  const response = await fetcher(`${base}latest.json`, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal })
  // Until the first publish, the host answers with its web page instead of a catalog.
  if (response.status === 404 || (response.ok && !isJsonResponse(response))) return 'unpublished'
  const text = await readBoundedResponse(response, PUBLISHED_CATALOG_MAX_BYTES)
  const digest = await digestText(text)
  if (digest === session.pendingDigest) return 'ready'
  if (digest === session.usingDigest) {
    await session.discardPending()
    return 'current'
  }
  const catalog = parsePublishedCatalog(JSON.parse(text))
  // Cues for different Torah text would highlight the wrong words; that needs an app update.
  if (catalog.textLayout !== builtIn.textLayout) {
    console.warn('Website recordings and cues were made for different Torah text; keeping this app copy until an app update')
    return 'unpublished'
  }

  const held = await session.heldFiles()
  const needed = storedCueFiles(catalog, builtIn).filter((name) => !held.has(name))
  if (needed.length) onDownload?.()
  await inBatches(needed, 4, async (name) => {
    const cue = await fetcher(`${base}${name}`, { credentials: 'omit', redirect: 'error', signal })
    const body = await readBoundedResponse(cue, PUBLISHED_CUE_MAX_BYTES)
    if (publishedCueFileName(await digestText(body)) !== name) throw new Error(`${name} does not match its fingerprint`)
    await store.write(name, body)
  })
  await session.stage({ digest, catalog: text, builtIn: builtIn.digest })
  await session.prune()
  return 'ready'
}

const builtIn = parseBuiltInContent(__TIKKUN_BUILT_IN_CONTENT__)
let store: ContentStore | null = null
let session: ContentSession | null = null
let active: ActiveContent | null = null
let prepared: Promise<void> | undefined
let prepareFailed = false
let checking: Promise<void> | undefined
let lastCheck = 0
let readerReady = false

const report = (error: unknown) => console.error(
  'Tikkun recordings and cues update failed; keeping the current copy',
  error instanceof Error ? error.message : String(error)
)

// Null on the website, whose own deploy already carries the newest copy.
export function activeContent(): ActiveContent | null {
  return active
}

function nativeContentStore(): ContentStore {
  const media = getNativeMedia()
  return {
    async read(name) {
      const result: unknown = await media.readContent({ name })
      const value = object(result) ? result.value : undefined
      if (value !== null && typeof value !== 'string') throw new Error('Invalid saved content response')
      return value
    },
    write: (name, value) => media.writeContent({ name, value }),
    prune: (keep) => media.pruneContent({ keep }),
  }
}

// Runs before the Reader modules load, because they read the recording list once.
export function prepareNativeContent(): Promise<void> {
  const summary = builtIn
  if (!summary || !import.meta.env.TIKKUN_NATIVE_MEDIA_ORIGIN || !isNativeApp()) return Promise.resolve()
  return prepared ??= (async () => {
    const nextStore = nativeContentStore()
    const next = new ContentSession(nextStore, summary, report)
    try {
      await next.open()
      store = nextStore
      session = next
      active = next.catalog ? createActiveContent(next.catalog, summary, nextStore) : null
    } catch (error) {
      // App Store Version 1.1 predates this on-phone storage. Its web updates still carry
      // the latest recordings and cues, so the website check simply stays off there.
      if (!(error instanceof CapacitorException && error.code === ExceptionCode.Unimplemented)) {
        prepareFailed = true
        report(error)
      }
    }
  })()
}

export async function nativeContentReady() {
  if (!session) {
    updateChannel('content', { phase: prepareFailed ? 'error' : 'disabled' })
    return
  }
  try {
    await session.ready()
    updateChannel('content', { pending: session.pending })
  } catch (error) {
    updateChannel('content', { phase: 'error' })
    report(error)
    return
  }
  readerReady = true
  void checkNativeContent()
}

export function checkNativeContent(force = false): Promise<void> {
  const current = session
  const currentStore = store
  if (!current || !currentStore || !builtIn) {
    updateChannel('content', { phase: prepareFailed ? 'error' : 'disabled' })
    return Promise.resolve()
  }
  // The first check runs once the Reader has started with this launch's content.
  if (!readerReady) return Promise.resolve()
  if (checking) return checking
  if (!force && Date.now() - lastCheck < 15 * 60_000) return Promise.resolve()
  const summary = builtIn
  return checking = (async () => {
    updateChannel('content', { phase: 'checking' })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)
    try {
      const phase = await refreshPublishedContent({
        session: current,
        store: currentStore,
        builtIn: summary,
        origin: import.meta.env.TIKKUN_NATIVE_MEDIA_ORIGIN,
        signal: controller.signal,
        onDownload: () => updateChannel('content', { phase: 'downloading' }),
      })
      lastCheck = Date.now()
      updateChannel('content', { phase, pending: current.pending, checkedAt: lastCheck })
    } finally {
      clearTimeout(timeout)
    }
  })().catch((error: unknown) => {
    updateChannel('content', { phase: 'error' })
    report(error)
  }).finally(() => { checking = undefined })
}
