import { deviceKinds } from './context.ts'

type Rule = (value: unknown) => boolean
const choice = (...values: readonly (string | number | boolean)[]): Rule => value => values.includes(value as string | number | boolean)
const number = (min: number, max: number): Rule => value => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const integer = (min: number, max: number): Rule => value => Number.isInteger(value) && (value as number) >= min && (value as number) <= max
const boolean: Rule = value => typeof value === 'boolean'
const version: Rule = value => typeof value === 'string' && /^(?:web|\d{1,3}(?:\.\d{1,3}){0,2})$/.test(value)

export const appStoreCampaigns = ['tr-home', 'tr-reader', 'oot-home', 'oot-apps', 'yahrtzeit-app-recommended', 'adamn-home'] as const
export const readingTimings = ['last_week', 'this_week', 'next_week', 'weeks_2_4', 'months_1_3', 'later', 'none'] as const

// Local time on the device, added to every event. Shared contract: Adam’s Servers/melytics/EVENTS.md.
export const contextRules = {
  hour: integer(0, 23),
  weekday: choice('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'),
} satisfies Record<string, Rule>

// Only bounded product facts cross this boundary. Never add user text, URLs,
// recording IDs, saved positions, error messages, or account/device identifiers.
export const eventRules = {
  reader_open: { layout: choice('reading', 'match'), sides: choice('one', 'two'), route: choice('calendar', 'parsha', 'page', 'reference', 'run', 'other'), timing: choice(...readingTimings) },
  coming_up_select: { position: choice(1, 2, 3) },
  // Once per local day from the native app or a Home Screen web app; the collector adds region.
  app_active: { first_this_month: boolean, device: choice(...deviceKinds), os: integer(0, 99), app_version: version },
  playback_start: { timed: boolean },
  playback_pause: {},
  playback_complete: {},
  playback_listened: { seconds: number(1, 3600) },
  playback_error: { reason: choice('playback', 'offline', 'prepare') },
  search_results: { surface: choice('embedded', 'overlay'), results: choice('none', '1-5', '6-12') },
  search_select: { surface: choice('embedded', 'overlay'), group: choice('reading', 'page', 'resume', 'checkpoint', 'tools'), position: number(1, 12) },
  download_start: {},
  download_complete: {},
  download_error: {},
  download_pause: {},
  share_reading: { outcome: choice('shared', 'copied', 'cancelled', 'failed') },
  bookmark_change: { action: choice('add', 'remove') },
  reader_setting: { setting: choice('layout', 'sides', 'theme', 'auto_scroll', 'speed'), value: choice('reading', 'match', 'one', 'two', 'automatic', 'light', 'sepia', 'dark', 'custom', 'on', 'off', 'slower', 'normal', 'faster') },
  print_open: {},
  print_requested: { layout: choice('reading', 'match'), sides: choice('one', 'two'), form: choice('tikkun', 'torah'), pages: number(1, 10000) },
  print_error: {},
  client_error: { kind: choice('navigation', 'uncaught', 'unhandled') },
  page_engagement: { seconds: number(1, 3600) },
  app_store_open: { campaign: choice(...appStoreCampaigns, 'none') },
  __ping: {},
} satisfies Record<string, Record<string, Rule>>

export type AnalyticsEvent = keyof typeof eventRules
export type AnalyticsProperties = Record<string, string | number | boolean>

export function validEvent(event: unknown, properties: unknown): properties is AnalyticsProperties {
  if (typeof event !== 'string' || !Object.hasOwn(eventRules, event)) return false
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return false
  const rules: Record<string, Rule> = eventRules[event as AnalyticsEvent]
  const context: Record<string, Rule> = contextRules
  const entries = Object.entries(properties).filter(([key]) => !Object.hasOwn(context, key))
  const contextEntries = Object.entries(properties).filter(([key]) => Object.hasOwn(context, key))
  // Local time is optional (older app builds omit it) but must be valid when present.
  return entries.length === Object.keys(rules).length
    && entries.every(([key, value]) => Object.hasOwn(rules, key) && rules[key](value))
    && contextEntries.every(([key, value]) => context[key](value))
}

export const analyticsPaths = ['/', '/reader', '/readings', '/about', '/privacy', '/support', '/tidbits'] as const

export function analyticsPath(url: URL): string | null {
  // Admin, prototypes, print frames, capture jobs and unknown routes stay out.
  if ([...url.searchParams.keys()].some(key => !['utm_source', 'utm_medium', 'utm_campaign'].includes(key))) return null
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (path === '/reader' && url.hash.startsWith('#/about/')) return null
  return analyticsPaths.find(candidate => candidate === path) ?? null
}

export function readerRouteKind(hash: string) {
  if (/^#\/(?:next|torah\/next)/.test(hash)) return 'calendar'
  if (/^#\/(?:torah|esther)\/parsha\//.test(hash)) return 'parsha'
  if (/^#\/(?:torah|esther)\/page\//.test(hash)) return 'page'
  if (/^#\/r\//.test(hash)) return 'reference'
  if (/^#\/run\//.test(hash)) return 'run'
  return 'other'
}
