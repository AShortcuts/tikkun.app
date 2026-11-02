import { object } from './content-schema.ts'

export interface ReleaseIdentity { version: string; build: number }
export interface NativeReleaseTarget { nativeBuild: string; nativeVersion?: string }
export interface BundledAppRelease { release: ReleaseIdentity; target: NativeReleaseTarget }
export const updateFeedPath = /^(?:web\/(?:\d+\.\d+(?:\.\d+)?-)?\d+\/(?:latest\.json|[a-f0-9]{64}\.zip)|content\/[a-f0-9]{64}\/(?:latest|[a-f0-9]{64})\.json)$/

export function validReleaseVersion(value: unknown): value is string {
  return typeof value === 'string' && /^\d+\.\d+(?:\.\d+)?$/.test(value) &&
    value.split('.').every(part => Number.isSafeInteger(Number(part)))
}

export function parseReleaseIdentity(value: unknown): ReleaseIdentity {
  if (!object(value) || !validReleaseVersion(value.version) || typeof value.build !== 'number' ||
      !Number.isSafeInteger(value.build) || value.build < 1) throw new Error('Invalid app release version/build')
  return { version: value.version, build: value.build }
}

export function compareReleaseVersions(left: string, right: string): number {
  if (!validReleaseVersion(left) || !validReleaseVersion(right)) throw new Error('Invalid app release version')
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0)
    if (difference) return Math.sign(difference)
  }
  return 0
}

// Release Versions are stored as dotted numbers (2026.11.3), the only form that
// App Store 1.1 accepts, and shown to people as v2026.11-r3.
const datedRelease = /^(\d{4})\.(\d{1,2})\.(\d+)$/

export function releaseLabel(version: string): string {
  if (!validReleaseVersion(version)) throw new Error('Invalid app release version')
  const dated = datedRelease.exec(version)
  return dated && Number(dated[1]) >= 2000 ? `v${dated[1]}.${dated[2].padStart(2, '0')}-r${Number(dated[3])}` : `v${version}`
}

// The next Release Version counts up within the current UTC month and restarts at r1
// in a new month. A clock behind the latest release keeps counting from that release.
export function nextReleaseVersion(latest: string, now: Date): string {
  if (!validReleaseVersion(latest)) throw new Error('Invalid app release version')
  const current = `${now.getUTCFullYear()}.${now.getUTCMonth() + 1}.1`
  const dated = datedRelease.exec(latest)
  if (!dated || Number(dated[1]) < 2000 || compareReleaseVersions(`${dated[1]}.${dated[2]}.1`, current) < 0) return current
  return `${dated[1]}.${Number(dated[2])}.${Number(dated[3]) + 1}`
}

// Minutes since 2026 give web releases a build number that keeps rising even if
// the website is rolled back, so phones always accept the next release.
export function releaseClock(now: Date): number {
  return Math.floor((now.getTime() - Date.UTC(2026, 0, 1)) / 60_000)
}

export function nativeFeedKey(target: NativeReleaseTarget): string {
  if (typeof target.nativeBuild !== 'string' || !/^\d+$/.test(target.nativeBuild) ||
      (target.nativeVersion !== undefined && !validReleaseVersion(target.nativeVersion))) throw new Error('Invalid native release target')
  return target.nativeVersion ? `${target.nativeVersion}-${target.nativeBuild}` : target.nativeBuild
}

export function parseBundledAppRelease(value: unknown): BundledAppRelease {
  if (!object(value) || !object(value.target) || typeof value.target.nativeBuild !== 'string') throw new Error('Invalid bundled app release')
  const target: NativeReleaseTarget = { nativeBuild: value.target.nativeBuild }
  if (value.target.nativeVersion !== undefined) {
    if (!validReleaseVersion(value.target.nativeVersion)) throw new Error('Invalid native release version')
    target.nativeVersion = value.target.nativeVersion
  }
  nativeFeedKey(target)
  return { release: parseReleaseIdentity(value.release), target }
}

// Native releases get a new compatibility feed, so build resets never compete
// with the previous native version. Builds within a feed must always increase.
export function isNewerRelease(candidate: ReleaseIdentity, current: ReleaseIdentity): boolean {
  return candidate.build > current.build && compareReleaseVersions(candidate.version, current.version) >= 0
}
