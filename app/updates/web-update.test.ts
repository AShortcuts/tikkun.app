import { generateKeyPairSync, sign } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import { stageWebRelease, verifyWebRelease, type WebRelease } from './web-update.ts'
import type { BundledAppRelease } from './release-identity.ts'

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const release: WebRelease = { schema: 1, channel: 'production', nativeBuild: '4', bundleId: 'a'.repeat(64),
  checksum: 'a'.repeat(64), signature: 'YWJj', bytes: 100, rollout: 10 }
function envelope(value: unknown) {
  const payload = JSON.stringify(value)
  return { payload, signature: sign('sha256', Buffer.from(payload), privateKey).toString('base64') }
}
function plugin() {
  return { getBlockedBundles: vi.fn(async () => ({ bundleIds: [] as string[] })),
    getCurrentBundle: vi.fn(async () => ({ bundleId: null })), getBundles: vi.fn(async () => ({ bundleIds: [] as string[] })),
    downloadBundle: vi.fn(async () => undefined), setNextBundle: vi.fn(async () => undefined) }
}
test('requires valid signature covering rollout and native build metadata', async () => {
  expect(await verifyWebRelease(envelope(release), pem)).toEqual(release)
  const tampered = envelope(release); tampered.payload = JSON.stringify({ ...release, nativeBuild: '3' })
  await expect(verifyWebRelease(tampered, pem)).rejects.toThrow('signature mismatch')
  await expect(verifyWebRelease(envelope({ ...release, rollout: 101 }), pem)).rejects.toThrow('Invalid web release')
})

test('preserves signed release numbering and optional native version in schema 1', async () => {
  const numbered = { ...release, nativeVersion: '1.2', release: { version: '1.2.1', build: 10 } }
  expect(await verifyWebRelease(envelope(numbered), pem)).toEqual(numbered)
  for (const patch of [{ nativeVersion: '1.3' }, { release: { version: '1.2.1', build: 11 } }]) {
    const tampered = envelope(numbered)
    tampered.payload = JSON.stringify({ ...numbered, ...patch })
    await expect(verifyWebRelease(tampered, pem)).rejects.toThrow('signature mismatch')
  }
})

test.each([
  { nativeVersion: null }, { nativeVersion: 1.2 }, { nativeVersion: '../1.2' },
  { release: null }, { release: { version: '1.2' } },
  { release: { version: 'invalid', build: 10 } }, { release: { version: '1.2', build: '10' } },
])('rejects malformed signed release identity: %j', async patch => {
  await expect(verifyWebRelease(envelope({ ...release, ...patch }), pem)).rejects.toThrow()
})

test('warns for large signed web releases but rejects invalid byte counts', async () => {
  const large = { ...release, bytes: 50 * 1024 * 1024 + 1 }
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    expect(await verifyWebRelease(envelope(large), pem)).toEqual(large)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('recommended download budget is 50 MiB'))
    for (const bytes of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(verifyWebRelease(envelope({ ...release, bytes }), pem)).rejects.toThrow('Invalid web release')
    }
  } finally { warn.mockRestore() }
})
test('only stages matching native builds inside the rollout, never reloads', async () => {
  const bridge = plugin()
  await expect(stageWebRelease(release, '3', 0, 'https://tikkunreader.com', bridge)).rejects.toThrow('another native build')
  await stageWebRelease(release, '4', 10, 'https://tikkunreader.com', bridge)
  expect(bridge.downloadBundle).not.toHaveBeenCalled()
  await stageWebRelease(release, '4', 9, 'https://tikkunreader.com', bridge)
  expect(bridge.downloadBundle).toHaveBeenCalledWith(expect.objectContaining({ signature: release.signature, checksum: release.checksum }))
  expect(bridge.setNextBundle).toHaveBeenCalledWith({ bundleId: release.bundleId })
})
test('does not retry a rolled back bundle or schedule a failed download', async () => {
  const bridge = plugin()
  bridge.getBlockedBundles.mockResolvedValueOnce({ bundleIds: [release.bundleId] })
  await expect(stageWebRelease(release, '4', 0, 'https://tikkunreader.com', bridge)).rejects.toThrow('previously failed')
  expect(bridge.downloadBundle).not.toHaveBeenCalled()
  bridge.downloadBundle.mockRejectedValueOnce(new Error('Invalid signature'))
  await expect(stageWebRelease(release, '4', 0, 'https://tikkunreader.com', bridge)).rejects.toThrow('Invalid signature')
  expect(bridge.setNextBundle).not.toHaveBeenCalled()
})

const bundled: BundledAppRelease = { release: { version: '1.1', build: 9 }, target: { nativeBuild: '8' } }

test.each([
  undefined,
  { version: '1.1', build: 8 },
  { version: '1.1.0', build: 9 },
  { version: '1.0.9', build: 10 },
  { version: '1.1.1', build: 9 },
])('does not stage unnumbered or non-newer releases over a bundled release: %j', async identity => {
  const bridge = plugin()
  const candidate = { ...release, nativeBuild: '8', ...(identity ? { release: identity } : {}) }
  expect(await stageWebRelease(candidate, '9', 0, 'https://tikkunreader.com', bridge, bundled)).toBe('current')
  expect(bridge.getBlockedBundles).not.toHaveBeenCalled()
  expect(bridge.getCurrentBundle).not.toHaveBeenCalled()
  expect(bridge.getBundles).not.toHaveBeenCalled()
  expect(bridge.downloadBundle).not.toHaveBeenCalled()
  expect(bridge.setNextBundle).not.toHaveBeenCalled()
})

test.each(['1.1.0', '1.1.1'])('accepts a higher build at version %s on the embedded target instead of the Sqim build', async version => {
  const bridge = plugin()
  const candidate = { ...release, nativeBuild: '8', release: { version, build: 10 } }
  expect(await stageWebRelease(candidate, '9', 0, 'https://tikkunreader.com', bridge, bundled)).toBe('ready')
  expect(bridge.downloadBundle).toHaveBeenCalledWith(expect.objectContaining({
    url: `https://tikkunreader.com/updates/web/8/${release.bundleId}.zip`,
  }))
  expect(bridge.setNextBundle).toHaveBeenCalledWith({ bundleId: release.bundleId })
})

test.each([
  { nativeBuild: '1' },
  { nativeVersion: '1.1', nativeBuild: '1' },
  { nativeVersion: '1.2', nativeBuild: '2' },
])('rejects another target before ignoring an unnumbered release: %j', async target => {
  const bridge = plugin()
  const nextNative: BundledAppRelease = { release: { version: '1.2', build: 1 },
    target: { nativeVersion: '1.2', nativeBuild: '1' } }
  await expect(stageWebRelease({ ...release, ...target }, '1', 0, 'https://tikkunreader.com', bridge, nextNative))
    .rejects.toThrow('another native build or version')
  expect(bridge.downloadBundle).not.toHaveBeenCalled()
  expect(bridge.setNextBundle).not.toHaveBeenCalled()
})

test('legacy callers still accept numbered updates on their numeric target', async () => {
  const bridge = plugin()
  expect(await stageWebRelease({ ...release, release: { version: '1.1.1', build: 10 } }, '4', 0,
    'https://tikkunreader.com', bridge)).toBe('ready')
  expect(bridge.setNextBundle).toHaveBeenCalledWith({ bundleId: release.bundleId })
})
