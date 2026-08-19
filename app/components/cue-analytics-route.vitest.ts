import { expect, test, vi } from 'vitest'
import {
  type CueAnalyticsPageModule,
  mountCueAnalyticsRoute,
} from './cue-analytics-route.ts'

test('does not render a late Analytics import after its route is cancelled', async () => {
  const root = document.createElement('main')
  root.textContent = 'Current route'
  const deferred = Promise.withResolvers<CueAnalyticsPageModule>()
  const mount = vi.fn(async () => {})
  const load = () => deferred.promise
  const controller = new AbortController()

  const pending = mountCueAnalyticsRoute(root, {
    signal: controller.signal,
    load,
  })
  controller.abort()
  deferred.resolve({
    default: () => '<section>Analytics</section>',
    mountCueAnalyticsPage: mount,
  })
  await pending

  expect(root.textContent).toBe('Current route')
  expect(mount).not.toHaveBeenCalled()
})

test('renders and mounts the current Analytics route', async () => {
  const root = document.createElement('main')
  const mount = vi.fn(async () => {})
  const controller = new AbortController()

  await mountCueAnalyticsRoute(root, {
    signal: controller.signal,
    load: async () => ({
      default: () => '<section>Analytics</section>',
      mountCueAnalyticsPage: mount,
    }),
  })

  expect(root.textContent).toBe('Analytics')
  expect(mount).toHaveBeenCalledWith(root, { signal: controller.signal })
})
