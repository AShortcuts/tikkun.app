import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'
import { get } from 'svelte/store'

const bridge = vi.hoisted(() => ({
  ready: vi.fn(), getVersionCode: vi.fn(), getCurrentBundle: vi.fn(), getNextBundle: vi.fn(),
  getBlockedBundles: vi.fn(), getBundles: vi.fn(), downloadBundle: vi.fn(), setNextBundle: vi.fn(), reload: vi.fn(),
}))
vi.mock('../platform/native.ts', () => ({ isNativeApp: () => true }))
vi.mock('@capawesome/capacitor-live-update', () => ({ LiveUpdate: bridge }))
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const bundleId = 'a'.repeat(64)
const payload = JSON.stringify({ schema: 1, channel: 'production', nativeBuild: '6', bundleId, checksum: bundleId,
  signature: 'YWJj', bytes: 100, rollout: 100 })
const signed = JSON.stringify({ payload, signature: sign('sha256', Buffer.from(payload), keys.privateKey).toString('base64') })
let fetcher: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('TIKKUN_UPDATE_PUBLIC_KEY', keys.publicKey.export({ type: 'spki', format: 'pem' }).toString())
  vi.stubEnv('TIKKUN_NATIVE_MEDIA_ORIGIN', 'https://tikkunreader.com')
  vi.stubGlobal('localStorage', { getItem: () => '0', setItem: vi.fn() })
  fetcher = vi.fn(async () => new Response(signed))
  vi.stubGlobal('fetch', fetcher)
  bridge.ready.mockResolvedValue({ rollback: false })
  bridge.getVersionCode.mockResolvedValue({ versionCode: '6' })
  bridge.getCurrentBundle.mockResolvedValue({ bundleId: null })
  bridge.getNextBundle.mockResolvedValue({ bundleId: null })
  bridge.getBlockedBundles.mockResolvedValue({ bundleIds: [] })
  bridge.getBundles.mockResolvedValue({ bundleIds: [] })
  bridge.downloadBundle.mockResolvedValue(undefined)
  bridge.setNextBundle.mockResolvedValue(undefined)
  bridge.reload.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers() })

test('startup stages silently; automatic checks throttle while manual checks bypass the interval', async () => {
  const runtime = await import('./web-runtime.ts')
  const { nativeUpdateState } = await import('./update-state.ts')
  await runtime.nativeWebReady()
  expect(get(nativeUpdateState).web.pending).toBe(true)
  expect(bridge.reload).not.toHaveBeenCalled()
  await runtime.checkNativeWeb()
  expect(fetcher).toHaveBeenCalledTimes(1)
  await runtime.checkNativeWeb(true)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(bridge.ready).toHaveBeenCalledTimes(1)
})
test('failed network checks can retry and simultaneous manual checks share one download', async () => {
  const { checkNativeWeb } = await import('./web-runtime.ts')
  const { nativeUpdateState } = await import('./update-state.ts')
  fetcher.mockRejectedValueOnce(new Error('offline'))
  await checkNativeWeb()
  expect(get(nativeUpdateState).web.phase).toBe('error')
  await Promise.all([checkNativeWeb(true), checkNativeWeb(true)])
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(bridge.downloadBundle).toHaveBeenCalledTimes(1)
})
test('missing or invalid feeds never claim up to date', async () => {
  const { checkNativeWeb } = await import('./web-runtime.ts')
  const { nativeUpdateState } = await import('./update-state.ts')
  fetcher.mockResolvedValueOnce(new Response('', { status: 404 }))
  await checkNativeWeb(true)
  expect(get(nativeUpdateState).web.phase).toBe('unpublished')
  fetcher.mockResolvedValueOnce(new Response('<html>Home</html>'))
  await checkNativeWeb(true)
  expect(get(nativeUpdateState).web.phase).toBe('error')
  expect(bridge.downloadBundle).not.toHaveBeenCalled()
})
test('retains an already staged update after a subsequent failed check', async () => {
  const { checkNativeWeb } = await import('./web-runtime.ts')
  const { nativeUpdateState } = await import('./update-state.ts')
  bridge.getNextBundle.mockResolvedValue({ bundleId })
  fetcher.mockRejectedValue(new Error('offline'))
  await checkNativeWeb(true)
  expect(get(nativeUpdateState).web).toMatchObject({ pending: true, phase: 'error' })
})
test('Apply refuses active work, then checkpoints before reloading and suppresses duplicate Apply', async () => {
  const { applyNativeUpdate } = await import('./native-updates.ts')
  const { updateChannel, nativeUpdateState } = await import('./update-state.ts')
  updateChannel('web', { pending: true, phase: 'ready' })
  await applyNativeUpdate(() => { throw new Error('Pause audio before applying the update.') })
  expect(bridge.reload).not.toHaveBeenCalled()
  expect(get(nativeUpdateState).applyError).toContain('Pause audio')
  const checkpoint = vi.fn()
  await Promise.all([applyNativeUpdate(checkpoint), applyNativeUpdate(checkpoint)])
  expect(checkpoint).toHaveBeenCalledTimes(1)
  expect(bridge.reload).toHaveBeenCalledTimes(1)
  expect(checkpoint.mock.invocationCallOrder[0]).toBeLessThan(bridge.reload.mock.invocationCallOrder[0])
})

test('Cancel retains staged updates and a retry cannot be canceled by stale completion', async () => {
  const { applyNativeUpdate, cancelNativeUpdate } = await import('./native-updates.ts')
  const { updateChannel, nativeUpdateState } = await import('./update-state.ts')
  updateChannel('web', { pending: true, phase: 'ready' })
  vi.useFakeTimers()
  const checkpoint = vi.fn()
  const first = applyNativeUpdate(checkpoint)
  cancelNativeUpdate()
  const second = applyNativeUpdate(checkpoint)
  await first
  expect(get(nativeUpdateState)).toMatchObject({ applying: true, canCancel: true, web: { pending: true } })
  await vi.advanceTimersByTimeAsync(1200)
  await second
  expect(checkpoint).toHaveBeenCalledOnce()
  expect(bridge.reload).toHaveBeenCalledOnce()
  expect(get(nativeUpdateState).canCancel).toBe(false)
})

test('Cancel during asynchronous preparation prevents reload and ignores its stale error', async () => {
  const { applyNativeUpdate, cancelNativeUpdate } = await import('./native-updates.ts')
  const { updateChannel, nativeUpdateState } = await import('./update-state.ts')
  updateChannel('content', { pending: true, phase: 'ready' })
  vi.useFakeTimers()
  let rejectPreparation!: (error: Error) => void
  const applied = applyNativeUpdate(() => new Promise<void>((_, reject) => { rejectPreparation = reject }))
  await vi.advanceTimersByTimeAsync(1200)
  cancelNativeUpdate()
  rejectPreparation(new Error('Stale failure'))
  await applied
  expect(bridge.reload).not.toHaveBeenCalled()
  expect(get(nativeUpdateState)).toMatchObject({ applying: false, applyError: null, content: { pending: true } })
})
