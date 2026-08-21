import { expect, test } from 'vitest'
import {
  BUILD_BUDGETS,
  MAX_STATIC_ASSET_BYTES,
} from './check-build-budgets.mjs'

test('keeps simple per-file production budgets', () => {
  expect(BUILD_BUDGETS.map(({ label }) => label)).toEqual([
    'JavaScript chunk',
    'CSS asset',
    'Service worker',
  ])
  expect(MAX_STATIC_ASSET_BYTES).toBe(24 * 1024 * 1024)
})

test('keeps bounded headroom for the integrity-checked offline service worker', () => {
  const serviceWorkerBudget = BUILD_BUDGETS.find(
    (budget) => budget.label === 'Service worker'
  )

  expect(serviceWorkerBudget).toMatchObject({
    rawBytes: 72_000,
    gzipBytes: 14_000,
  })
  expect(serviceWorkerBudget?.matches('service-worker.js')).toBe(true)
  expect(serviceWorkerBudget?.matches('_app/reader.js')).toBe(false)
})
