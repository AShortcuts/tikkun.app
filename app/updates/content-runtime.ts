import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from '../platform/native.ts'
import { CONTENT_MAX_BYTES, object, type ContentSnapshot } from './content-schema.ts'
import { ContentSession } from './content-session.ts'
import { verifyReleaseEnvelope } from './release-signature.ts'
import { updateChannel } from './update-state.ts'

interface ContentBridge {
  readContent(): Promise<{ value: string | null }>
  writeContent(options: { value: string }): Promise<void>
}
let session: ContentSession | null = null
let prepared: Promise<void> | undefined
let checking: Promise<void> | undefined
let lastCheck = 0
let readerReady = false
export function activeContent(): ContentSnapshot | null { return session?.snapshot ?? null }
const report = (error: unknown) => console.error('Tikkun content update failed; keeping installed content', error instanceof Error ? error.message : String(error))

export async function readBoundedResponse(response: Response, limit: number): Promise<string> {
  if (!response.ok || !response.body) throw new Error(`Update download failed (${response.status})`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let result = ''
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > limit) { await reader.cancel(); throw new Error('Update exceeds download limit') }
      result += decoder.decode(chunk.value, { stream: true })
    }
    return result + decoder.decode()
  } finally { reader.releaseLock() }
}

export function prepareNativeContent(): Promise<void> {
  if (!import.meta.env.TIKKUN_NATIVE_MEDIA_ORIGIN || !isNativeApp()) return Promise.resolve()
  return prepared ??= (async () => {
    const bridge = registerPlugin<ContentBridge>('TikkunMedia')
    const next = new ContentSession({
      read: async () => (await bridge.readContent()).value,
      write: async value => bridge.writeContent({ value }),
    }, import.meta.env.TIKKUN_CONTENT_COMPATIBILITY, report)
    try { await next.open(); session = next }
    catch (error) { report(error) }
  })()
}

export async function nativeContentReady() {
  try {
    await session?.ready()
    updateChannel('content', { pending: session?.pending ?? false })
  } catch (error) { updateChannel('content', { phase: 'error' }); report(error); return }
  readerReady = true
  void checkNativeContent()
}

export function checkNativeContent(force = false): Promise<void> {
  if (!session || !readerReady || !import.meta.env.TIKKUN_UPDATE_PUBLIC_KEY) {
    updateChannel('content', { phase: 'disabled' })
    return Promise.resolve()
  }
  if (checking) return checking
  if (!force && Date.now() - lastCheck < 15 * 60_000) return Promise.resolve()
  return checking ??= (async () => {
    const current = session
    if (!current) return
    updateChannel('content', { phase: 'checking' })
    const origin = import.meta.env.TIKKUN_NATIVE_MEDIA_ORIGIN
    const prefix = `${origin}/updates/content/${import.meta.env.TIKKUN_CONTENT_COMPATIBILITY}/`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)
    try {
      const response = await fetch(`${prefix}latest.json`, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal })
      if (response.status === 404) {
        lastCheck = Date.now()
        updateChannel('content', { phase: 'unpublished', checkedAt: lastCheck })
        return
      }
      const manifest = await verifyReleaseEnvelope(JSON.parse(await readBoundedResponse(response, 4096)), import.meta.env.TIKKUN_UPDATE_PUBLIC_KEY)
      if (!object(manifest) || manifest.schema !== 1 || typeof manifest.digest !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.digest) ||
          typeof manifest.bytes !== 'number' || !Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0) throw new Error('Invalid content release manifest')
      if (manifest.bytes > CONTENT_MAX_BYTES) console.warn(`Content release is ${manifest.bytes} bytes; recommended download budget is ${CONTENT_MAX_BYTES} bytes`)
      if (current.isRejected(manifest.digest)) throw new Error('Content release previously failed on this device')
      if (current.has(manifest.digest)) {
        lastCheck = Date.now()
        updateChannel('content', { phase: current.pending ? 'ready' : 'current', pending: current.pending, checkedAt: lastCheck })
        return
      }
      updateChannel('content', { phase: 'downloading' })
      const body = await fetch(`${prefix}${manifest.digest}.json`, { credentials: 'omit', redirect: 'error', signal: controller.signal })
      const payload = await readBoundedResponse(body, manifest.bytes)
      if (new TextEncoder().encode(payload).byteLength !== manifest.bytes) throw new Error('Incomplete content download')
      await current.stage({ digest: manifest.digest, payload })
      lastCheck = Date.now()
      updateChannel('content', { phase: 'ready', pending: true, checkedAt: lastCheck })
    } catch (error) { updateChannel('content', { phase: 'error' }); report(error) }
    finally { clearTimeout(timeout) }
  })().finally(() => { checking = undefined })
}
