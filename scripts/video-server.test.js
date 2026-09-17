import { expect, test, vi } from 'vitest'
import { canReuseVideoServer } from './video-server.mjs'

const options = { port: 5176, repoRoot: '/project/tikkun' }

test('reuses only a verified Vite listener from this checkout', async () => {
  const run = vi.fn().mockResolvedValue({ stdout: '42\n42\n' })
  const inspect = vi.fn().mockResolvedValue({ cwd: options.repoRoot, command: 'node /project/tikkun/node_modules/vite/bin/vite.js --port 5176' })
  await expect(canReuseVideoServer({ ...options, run, inspect })).resolves.toBe(true)
  expect(inspect).toHaveBeenCalledExactlyOnceWith(42)
})

test('refuses foreign or unverifiable listeners without disrupting them', async () => {
  const run = vi.fn().mockResolvedValue({ stdout: '42\n' })
  for (const identity of [null, { cwd: '/another-project', command: 'node vite' }, { cwd: options.repoRoot, command: 'node api.js' }]) {
    await expect(canReuseVideoServer({ ...options, run, inspect: async () => identity })).rejects.toThrow(/another or unverified/)
  }
})

test('distinguishes a free port from a failed process inspection', async () => {
  const run = vi.fn().mockRejectedValue({ code: 1, stdout: '', stderr: '' })
  await expect(canReuseVideoServer({ ...options, run })).resolves.toBe(false)
  run.mockRejectedValueOnce(new Error('lsof unavailable'))
  await expect(canReuseVideoServer({ ...options, run })).rejects.toThrow('lsof unavailable')
})
