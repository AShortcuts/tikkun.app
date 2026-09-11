import { randomBytes } from 'node:crypto'
import { mkdtemp, writeFile, truncate, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, test, vi } from 'vitest'
import {
  BUILD_BUDGETS,
  MAX_STATIC_ASSET_BYTES,
  checkBuildBudgets,
} from './check-build-budgets.mjs'

test('keeps simple per-file production budgets', () => {
  expect(BUILD_BUDGETS.map(({ label }) => label)).toEqual([
    'JavaScript chunk',
    'CSS asset',
    'Service worker',
  ])
  expect(MAX_STATIC_ASSET_BYTES).toBe(24 * 1024 * 1024)
})

test('reports every size overrun without failing a complete build', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tikkun-budget-'))
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await writeFile(path.join(root, 'app.js'), randomBytes(460_001))
    await writeFile(path.join(root, 'app.css'), randomBytes(170_001))
    await writeFile(path.join(root, 'service-worker.js'), randomBytes(72_001))
    await writeFile(path.join(root, 'audio.m4a'), '')
    await truncate(path.join(root, 'audio.m4a'), MAX_STATIC_ASSET_BYTES + 1)
    const result = await checkBuildBudgets(root)
    expect(result.warnings).toHaveLength(7)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Build budget warnings:'))
    expect(result.files).toHaveLength(4)
    await rm(path.join(root, 'service-worker.js'))
    await expect(checkBuildBudgets(root)).rejects.toThrow('Service worker: no matching build output')
  } finally {
    warn.mockRestore()
    log.mockRestore()
    await rm(root, { recursive: true, force: true })
  }
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
