// Device context for analytics. Independent of the reader so other Capacitor apps and PWAs can reuse it.
// Shared contract: Adam’s Servers/melytics/EVENTS.md.

export const deviceKinds = [
  'iphone', 'ipad', 'mac', 'apple_vision', 'apple_tv',
  'android_phone', 'android_tablet', 'windows', 'chromebook', 'linux',
  // iPadOS browsers use a Mac identity and touchscreen Macs exist, so the web cannot tell them apart.
  'ipad_or_mac',
  'other',
] as const
export type DeviceKind = typeof deviceKinds[number]
export interface DeviceFacts { device: DeviceKind; os: number; app_version: string }

const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export const LAST_ACTIVE_DAY_KEY = 'tikkun.analytics-last-active-day'

export function eventContext(now: Date) {
  return { hour: now.getHours(), weekday: weekdays[now.getDay()] }
}

/** Device family from a browser identity. Order matters: Android and ChromeOS identities also mention Linux. */
export function webDeviceKind(userAgent: string): DeviceKind {
  if (/iPhone|iPod/.test(userAgent)) return 'iphone'
  if (/iPad/.test(userAgent)) return 'ipad'
  if (/Android/.test(userAgent)) return /Mobile/.test(userAgent) ? 'android_phone' : 'android_tablet'
  if (/CrOS/.test(userAgent)) return 'chromebook'
  if (/Windows NT/.test(userAgent)) return 'windows'
  if (/Macintosh/.test(userAgent)) return 'ipad_or_mac'
  if (/Linux|X11/.test(userAgent)) return 'linux'
  return 'other'
}

/** Major OS version from a browser identity; 0 when it is frozen or absent (desktop Safari reports 10_15_7). */
export function osMajorFromUserAgent(userAgent: string) {
  const match = /(?:iPhone OS|CPU OS|Android) (\d{1,2})/.exec(userAgent)
  return match ? Number(match[1]) : 0
}

export function isHomeScreenApp(view: Window) {
  try {
    return view.matchMedia('(display-mode: standalone)').matches || (view.navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch { return false }
}

function localDay(now: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Decides whether today's check-in is due. Only the last local day is stored, never an identifier.
 * Returns null when a check-in was already sent today or storage is unavailable.
 */
export function dueCheckIn(storage: Storage, now: Date): { first_this_month: boolean; commit(): void } | null {
  const today = localDay(now)
  let last: string | null
  try { last = storage.getItem(LAST_ACTIVE_DAY_KEY) } catch { return null }
  if (last === today) return null
  return {
    first_this_month: last?.slice(0, 7) !== today.slice(0, 7),
    commit() { try { storage.setItem(LAST_ACTIVE_DAY_KEY, today) } catch { /* Next foreground retries. */ } },
  }
}
