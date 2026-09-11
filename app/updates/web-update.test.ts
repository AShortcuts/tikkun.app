import { generateKeyPairSync, sign } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import { stageWebRelease, verifyWebRelease, type WebRelease } from './web-update.ts'

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
