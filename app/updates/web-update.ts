import type { LiveUpdatePlugin } from '@capawesome/capacitor-live-update'
import { object } from './content-schema.ts'
import { verifyReleaseEnvelope } from './release-signature.ts'
import { isNewerRelease, nativeFeedKey, parseReleaseIdentity, type BundledAppRelease, type NativeReleaseTarget, type ReleaseIdentity } from './release-identity.ts'

export interface WebRelease extends NativeReleaseTarget {
  schema: 1
  channel: 'production'
  bundleId: string
  checksum: string
  signature: string
  bytes: number
  rollout: number
  release?: ReleaseIdentity
}
export async function verifyWebRelease(value: unknown, publicKey: string): Promise<WebRelease> {
  const release = await verifyReleaseEnvelope(value, publicKey)
  if (!object(release) || release.schema !== 1 || release.channel !== 'production' ||
      typeof release.nativeBuild !== 'string' || !/^\d+$/.test(release.nativeBuild) ||
      (release.nativeVersion !== undefined && typeof release.nativeVersion !== 'string') ||
      typeof release.bundleId !== 'string' || !/^[a-f0-9]{64}$/.test(release.bundleId) || release.checksum !== release.bundleId ||
      typeof release.signature !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(release.signature) ||
      typeof release.bytes !== 'number' || !Number.isSafeInteger(release.bytes) || release.bytes <= 0 ||
      typeof release.rollout !== 'number' || !Number.isInteger(release.rollout) || release.rollout < 0 || release.rollout > 100) throw new Error('Invalid web release')
  const target = { nativeBuild: release.nativeBuild,
    ...(release.nativeVersion === undefined ? {} : { nativeVersion: release.nativeVersion }) }
  nativeFeedKey(target)
  const identity = release.release === undefined ? undefined : parseReleaseIdentity(release.release)
  if (release.bytes > 50 * 1024 * 1024) console.warn(`Web release is ${release.bytes} bytes; recommended download budget is 50 MiB`)
  return { schema: 1, channel: 'production', ...target, bundleId: release.bundleId, checksum: release.bundleId,
    signature: release.signature, bytes: release.bytes, rollout: release.rollout, ...(identity ? { release: identity } : {}) }
}

export async function stageWebRelease(release: WebRelease, nativeBuild: string, bucket: number,
  origin: string, plugin: Pick<LiveUpdatePlugin, 'getBlockedBundles' | 'getCurrentBundle' | 'getBundles' | 'downloadBundle' | 'setNextBundle'>,
  bundled?: BundledAppRelease) {
  const feedKey = nativeFeedKey(bundled?.target ?? { nativeBuild })
  if (nativeFeedKey(release) !== feedKey) throw new Error('Web release targets another native build or version')
  if (bundled && (!release.release || !isNewerRelease(release.release, bundled.release))) return 'current'
  if (bucket >= release.rollout) return 'deferred'
  if ((await plugin.getBlockedBundles()).bundleIds.includes(release.bundleId)) throw new Error('Web release previously failed on this device')
  if ((await plugin.getCurrentBundle()).bundleId === release.bundleId) return 'current'
  if (!(await plugin.getBundles()).bundleIds.includes(release.bundleId)) {
    await plugin.downloadBundle({ bundleId: release.bundleId, artifactType: 'zip', checksum: release.checksum,
      signature: release.signature, url: `${origin}/updates/web/${feedKey}/${release.bundleId}.zip` })
  }
  await plugin.setNextBundle({ bundleId: release.bundleId })
  // No reload: native cold-start activation must not interrupt practice/audio.
  return 'ready'
}
