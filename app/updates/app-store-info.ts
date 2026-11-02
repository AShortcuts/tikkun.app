import { object } from './content-schema.ts'
import { compareReleaseVersions, releaseLabel, validReleaseVersion } from './release-identity.ts'

export const APP_STORE_URL = 'https://apps.apple.com/app/id6810923824'
export const APP_STORE_INFO_PATH = 'app-store.json'

// Published from config/app-store.json on every website deploy.
export interface AppStoreInfo { latest: string; minimum: string; message?: string }
export type AppStoreStatus = 'latest' | 'available' | 'required'
export interface AppStoreState { installed: string | null; status: AppStoreStatus | null; info: AppStoreInfo | null }

export function parseAppStoreInfo(value: unknown): AppStoreInfo {
  if (!object(value) || !validReleaseVersion(value.latest) || !validReleaseVersion(value.minimum) ||
      compareReleaseVersions(value.minimum, value.latest) > 0) {
    throw new Error('App Store info needs latest and minimum App Store Versions, with minimum no newer than latest')
  }
  if (value.message !== undefined && (typeof value.message !== 'string' || value.message.trim().length > 160)) {
    throw new Error('App Store info message must be text of at most 160 characters')
  }
  const message = typeof value.message === 'string' ? value.message.trim() : ''
  return { latest: value.latest, minimum: value.minimum, ...(message ? { message } : {}) }
}

// A phone newer than the published file, such as one installed before the file is edited, counts as latest.
export function appStoreStatus(installed: string, info: AppStoreInfo): AppStoreStatus {
  if (compareReleaseVersions(installed, info.minimum) < 0) return 'required'
  return compareReleaseVersions(installed, info.latest) < 0 ? 'available' : 'latest'
}

export function appStorePromptCopy(status: Exclude<AppStoreStatus, 'latest'>, info: AppStoreInfo) {
  return status === 'required'
    ? { title: 'App Update Required',
        message: info.message ?? 'This version of Tikkun can\u2019t receive new updates. Update in the App Store to keep getting them.' }
    : { title: 'New Update Available', message: info.message ?? `Tikkun ${releaseLabel(info.latest)} is available in the App Store.` }
}

// After Update or Later, a required prompt returns the next day and an optional one the next week.
// A different prompt, such as a newer App Store Version, shows right away.
const PROMPT_KEY = 'tikkun.app-store-prompt'
const DAY = 24 * 60 * 60_000
const promptId = (status: AppStoreStatus, info: AppStoreInfo) => `${status}:${status === 'required' ? info.minimum : info.latest}`

export function appStorePromptDue(state: AppStoreState, storage: Pick<Storage, 'getItem'>, now: number): boolean {
  if (!state.info || !state.status || state.status === 'latest') return false
  let saved: unknown = null
  try { saved = JSON.parse(storage.getItem(PROMPT_KEY) ?? 'null') }
  catch (error) { console.error('Ignoring an unreadable App Store prompt reminder', error) }
  return !object(saved) || saved.id !== promptId(state.status, state.info) || typeof saved.until !== 'number' || saved.until <= now
}

export function postponeAppStorePrompt(state: AppStoreState, storage: Pick<Storage, 'setItem'>, now: number) {
  if (!state.info || !state.status || state.status === 'latest') return
  storage.setItem(PROMPT_KEY, JSON.stringify({ id: promptId(state.status, state.info),
    until: now + (state.status === 'required' ? DAY : 7 * DAY) }))
}
