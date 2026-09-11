import { Capacitor } from '@capacitor/core'
import { afterEach, expect, test, vi } from 'vitest'
import { getWebServiceWorker } from './native.ts'

afterEach(() => vi.restoreAllMocks())

test('never accesses the web worker inside a native app', () => {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
  const navigator = { get serviceWorker(): ServiceWorkerContainer { throw new Error('Must not access worker') } }
  expect(getWebServiceWorker(navigator)).toBeNull()
})

test('preserves browser worker availability', () => {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false)
  const worker = {} as ServiceWorkerContainer
  expect(getWebServiceWorker({ serviceWorker: worker })).toBe(worker)
  expect(getWebServiceWorker({})).toBeNull()
})
