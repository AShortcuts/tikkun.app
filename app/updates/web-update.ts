import type { LiveUpdatePlugin } from '@capawesome/capacitor-live-update'
import { object } from './content-schema.ts'
import { verifyReleaseEnvelope } from './release-signature.ts'

export interface WebRelease {
  schema: 1
  nativeBuild: string
  channel: 'production'
  bundleId: string
  checksum: string
  signature: string
  bytes: number
  rollout: number
}
export async function verifyWebRelease(value: unknown, publicKey: string): Promise<WebRelease> {
  const release = await verifyReleaseEnvelope(value, publicKey)
  if (!object(release) || release.schema !== 1 || release.channel !== 'production' ||
      typeof release.nativeBuild !== 'string' || !/^\d+$/.test(release.nativeBuild) ||
      typeof release.bundleId !== 'string' || !/^[a-f0-9]{64}$/.test(release.bundleId) || release.checksum !== release.bundleId ||
      typeof release.signature !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(release.signature) ||
      typeof release.bytes !== 'number' || !Number.isSafeInteger(release.bytes) || release.bytes <= 0 || release.bytes > 50 * 1024 * 1024 ||
      typeof release.rollout !== 'number' || !Number.isInteger(release.rollout) || release.rollout < 0 || release.rollout > 100) throw new Error('Invalid web release')
  return { schema: 1, channel: 'production', nativeBuild: release.nativeBuild, bundleId: release.bundleId, checksum: release.bundleId,
    signature: release.signature, bytes: release.bytes, rollout: release.rollout }
}

export async function stageWebRelease(release: WebRelease, nativeBuild: string, bucket: number,
  origin: string, plugin: Pick<LiveUpdatePlugin, 'getBlockedBundles' | 'getCurrentBundle' | 'getBundles' | 'downloadBundle' | 'setNextBundle'>) {
  if (release.nativeBuild !== nativeBuild || bucket >= release.rollout) return
  if ((await plugin.getBlockedBundles()).bundleIds.includes(release.bundleId) ||
      (await plugin.getCurrentBundle()).bundleId === release.bundleId) return
  if (!(await plugin.getBundles()).bundleIds.includes(release.bundleId)) {
    await plugin.downloadBundle({ bundleId: release.bundleId, artifactType: 'zip', checksum: release.checksum,
      signature: release.signature, url: `${origin}/updates/web/${nativeBuild}/${release.bundleId}.zip` })
  }
  await plugin.setNextBundle({ bundleId: release.bundleId })
  // No reload: native cold-start activation must not interrupt practice/audio.
}
