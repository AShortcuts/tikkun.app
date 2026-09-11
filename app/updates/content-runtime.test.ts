import { expect, test, vi } from 'vitest'
import { buildContentRelease } from '../../scripts/build-content-release.ts'
import { CONTENT_MAX_BYTES, digestText } from './content-schema.ts'
import { generateKeyPairSync, sign } from 'node:crypto'

const native = vi.hoisted(() => ({ stored: null as string | null }))
vi.mock('../platform/native.ts', () => ({ isNativeApp: () => true }))
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({
  readContent: async () => ({ value: native.stored }),
  writeContent: async ({ value }: { value: string }) => { native.stored = value },
}) }))

test.each([false, true])('real content stages and activates on a fresh document (over budget: %s)', async (overBudget) => {
  native.stored = null
  const release = await buildContentRelease()
  const data = JSON.parse(release.payload)
  data.recordings[0].title += ' Updated'
  const payload = JSON.stringify(data) + (overBudget ? ' '.repeat(CONTENT_MAX_BYTES) : '')
  const digest = await digestText(payload)
  vi.stubEnv('TIKKUN_NATIVE_MEDIA_ORIGIN', 'https://tikkunreader.com')
  vi.stubEnv('TIKKUN_CONTENT_COMPATIBILITY', release.compatibility)
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
  vi.stubEnv('TIKKUN_UPDATE_PUBLIC_KEY', keys.publicKey.export({ type: 'spki', format: 'pem' }).toString())
  const manifest = JSON.stringify({ schema: 1, digest, bytes: new TextEncoder().encode(payload).byteLength })
  const fetcher = vi.fn(async (url: string) => new Response(url.endsWith('latest.json')
    ? JSON.stringify({ payload: manifest, signature: sign('sha256', Buffer.from(manifest), keys.privateKey).toString('base64') }) : payload))
  vi.stubGlobal('fetch', fetcher)
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    vi.resetModules()
    const first = await import('./content-runtime.ts')
    await first.prepareNativeContent()
    await first.nativeContentReady()
    await first.checkNativeContent()
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(first.activeContent()).toBeNull()
    expect(native.stored).not.toBeNull()

    vi.resetModules()
    const next = await import('./content-runtime.ts')
    await next.prepareNativeContent()
    const { audioRecordings } = await import('../data/audio-catalog.ts')
    expect(audioRecordings[0].title).toBe(data.recordings[0].title)
    expect(audioRecordings[0].playSrc).toMatch(/^https:\/\/tikkunreader\.com\/audio\//)
    const { loadScrollPageLines } = await import('../view-model/scroll-view-model.ts')
    expect(await loadScrollPageLines('torah', 1)).toEqual(data.pages['torah/1'])
    const { resolveCueDataForRecording } = await import('../audio/cue-data.ts')
    const recording = audioRecordings.find(recording => data.cues[`audio-cues/${recording.narratorId}/${recording.reading.id}/${recording.aliyah}.json`]?.cues.length)
    expect(recording).toBeDefined()
    if (recording) expect((await resolveCueDataForRecording(recording)).status).toBe('ready')
    await next.nativeContentReady()
    await next.checkNativeContent()
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(JSON.parse(native.stored!).pending).toBeNull()
    if (overBudget) expect(warn).toHaveBeenCalledWith(expect.stringContaining('recommended download budget'))
  } finally { warn.mockRestore(); vi.unstubAllGlobals(); vi.unstubAllEnvs() }
}, 20_000)
