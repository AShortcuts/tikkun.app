declare global {
  namespace App {}

  const __TIKKUN_BUILD_ID__: string
  const __TIKKUN_RELEASE_VERSION__: string | null
  const __TIKKUN_ANALYTICS_CONFIG__: import('../app/analytics/config.ts').AnalyticsConfig
  // Native builds only: a summary of the recordings and cues the app was built with.
  const __TIKKUN_BUILT_IN_CONTENT__: import('../app/updates/published-content.ts').BuiltInContent | null
}

export {}
