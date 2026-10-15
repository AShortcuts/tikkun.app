import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { bootstrapPages } from './build-pages.mjs'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

async function fixture(initialNpm = '11.19.0') {
  const root = await mkdtemp(path.join(tmpdir(), 'tikkun-pages-bootstrap-test-'))
  roots.push(root)
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ engines: { node: '22.23.2', npm: '11.19.0' } }))
  const calls: string[][] = []
  const state = { npm: initialNpm, failInstall: false }
  const run = async (command: string, args: string[], environment: NodeJS.ProcessEnv) => {
    calls.push([command, ...args])
    if (command === 'npm') {
      expect(environment.TIKKUN_UPDATE_PRIVATE_KEY).toBeUndefined()
      expect(environment.TIKKUN_UPDATE_PRIVATE_KEY_FILE).toBeUndefined()
      if (args[0] === '--version') return state.npm
      if (args[0] === 'install') state.npm = '11.19.0'
      if (args[0] === 'ci' && state.failInstall) throw new Error('dependency install failed')
    } else {
      expect(args).toEqual(['--import', 'tsx', 'scripts/build-pages-updates.ts'])
      expect(environment.TIKKUN_UPDATE_PRIVATE_KEY).toBe('production test secret')
    }
    return ''
  }
  return { calls, state, options: { root, environment: { CF_PAGES: '1', TIKKUN_UPDATE_PRIVATE_KEY: 'production test secret', TIKKUN_UPDATE_PRIVATE_KEY_FILE: '/private/test.pem' }, nodeVersion: '22.23.2', run } }
}

test.each(['10.9.2', '11.19.0'])('pins npm from %s and isolates secrets during dependency installation', async version => {
  const f = await fixture(version)
  await bootstrapPages(f.options)
  expect(f.calls.filter(call => call.includes('install'))).toHaveLength(version === '11.19.0' ? 0 : 1)
  expect(f.calls.at(-2)).toEqual(['npm', 'ci', '--include=dev'])
  expect(f.calls.at(-1)?.[0]).toBe(process.execPath)
})

test('rejects an unpinned Node or local invocation before any installation', async () => {
  const f = await fixture()
  await expect(bootstrapPages({ ...f.options, nodeVersion: '26.10.0' })).rejects.toThrow('NODE_VERSION')
  await expect(bootstrapPages({ ...f.options, environment: {} })).rejects.toThrow('for Cloudflare Pages')
  expect(f.calls).toEqual([])
})

test('dependency failures stop before the signing process can start', async () => {
  const f = await fixture()
  f.state.failInstall = true
  await expect(bootstrapPages(f.options)).rejects.toThrow('dependency install failed')
  expect(f.calls.every(call => call[0] === 'npm')).toBe(true)
})
