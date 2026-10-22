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

export function nextReleaseVersion(version: string): string {
  if (!validReleaseVersion(version)) throw new Error('Invalid app release version')
  const [major, minor, patch = 0] = version.split('.').map(Number)
  const next = `${major}.${minor}.${patch + 1}`
  if (!validReleaseVersion(next)) throw new Error('App release version exceeds supported range')
  return next
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
