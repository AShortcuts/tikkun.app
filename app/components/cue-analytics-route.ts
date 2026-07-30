export interface CueAnalyticsPageModule {
  default(): string
  mountCueAnalyticsPage(
    root: HTMLElement,
    options: { signal: AbortSignal }
  ): Promise<void>
}

export interface CueAnalyticsRouteOptions {
  signal: AbortSignal
  load?: () => Promise<CueAnalyticsPageModule>
}

export async function mountCueAnalyticsRoute(
  root: HTMLElement,
  {
    signal,
    load = () => import('./CueAnalyticsPage.ts'),
  }: CueAnalyticsRouteOptions
) {
  const analytics = await load()
  if (signal.aborted) return
  root.innerHTML = analytics.default()
  if (signal.aborted) return
  await analytics.mountCueAnalyticsPage(root, { signal })
}
