export const ANALYTICS_PREFERENCE_KEY = 'tikkun.usage-analytics'
export const ANALYTICS_PREFERENCE_EVENT = 'tikkun:usage-analytics'
let sessionChoice: boolean | null = null

export function analyticsAllowed(view: Window) {
  if (sessionChoice !== null) return sessionChoice
  try { return view.localStorage.getItem(ANALYTICS_PREFERENCE_KEY) !== 'off' }
  catch { return false } // If a privacy preference cannot be read, do not collect.
}

export function setAnalyticsAllowed(view: Window, allowed: boolean) {
  sessionChoice = allowed
  try {
    view.localStorage.setItem(ANALYTICS_PREFERENCE_KEY, allowed ? 'on' : 'off')
    sessionChoice = null
  } finally { view.dispatchEvent(new Event(ANALYTICS_PREFERENCE_EVENT)) }
}
