import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger, createServer, type ViteDevServer } from 'vite'
import { afterEach, expect, test, vi } from 'vitest'
import { publicReadingCoveragePlugin } from './public-reading-coverage-plugin.ts'

let server: ViteDevServer | undefined
let root: string | undefined

afterEach(async () => {
  await server?.close()
  server = undefined
  if (root) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function fixture() {
  root = await realpath(await mkdtemp(path.join(tmpdir(), 'tikkun-coverage-watch-')))
  const directory = root
  for (const name of ['scripts', 'generated', 'audio-cues']) {
    await mkdir(path.join(directory, name))
  }
  await symlink(fileURLToPath(new URL('../node_modules', import.meta.url)), path.join(directory, 'node_modules'))
  await writeFile(path.join(directory, 'scripts/generate-public-reading-manifest.mjs'), `
    import { appendFile, readFile, readdir, writeFile, access } from 'node:fs/promises';
    await appendFile('runs.log', 'start\\n');
    const files = (await readdir('audio-cues')).sort();
    const values = await Promise.all(files.map(file => readFile('audio-cues/' + file, 'utf8')));
    if (values.includes('invalid')) throw new Error('Invalid cue fixture');
    await appendFile('runs.log', 'captured\\n');
    while (await access('gate').then(() => true, () => false)) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const output = JSON.stringify(values);
    const target = 'generated/public-reading-manifest.ts';
    const previous = await readFile(target, 'utf8').catch(() => null);
    if (previous !== output) await writeFile(target, output);
    await appendFile('runs.log', 'done\\n');
    console.log('Updated cue coverage');
  `)
  const logger = createLogger('silent')
  const errors = vi.spyOn(logger, 'error')
  server = await createServer({
    root: directory, configFile: false, mode: 'development',
    customLogger: logger, plugins: [publicReadingCoveragePlugin()],
    server: { middlewareMode: true, hmr: false },
  })
  await vi.waitFor(() => expect(Object.keys(server!.watcher.getWatched())).toContain(directory))
  const send = vi.spyOn(server.hot, 'send')
  return {
    errors, send,
    write: (name: string, value: string) => writeFile(path.join(directory, 'audio-cues', name), value),
    remove: (name: string) => rm(path.join(directory, 'audio-cues', name)),
    output: () => readFile(path.join(directory, 'generated/public-reading-manifest.ts'), 'utf8'),
    runs: () => readFile(path.join(directory, 'runs.log'), 'utf8'),
    gate: path.join(directory, 'gate'),
  }
}

test('batches real file additions, retains valid output on errors, and recovers after correction and deletion', async () => {
  const f = await fixture()
  await Promise.all([f.write('1.json', 'first'), f.write('2.json', 'second')])
  await vi.waitFor(async () => expect(await f.output()).toBe('["first","second"]'), { timeout: 5000 })
  expect((await f.runs()).match(/start/g)).toHaveLength(2)

  await f.write('1.json', 'invalid')
  await vi.waitFor(() => expect(f.errors).toHaveBeenCalled(), { timeout: 5000 })
  expect(await f.output()).toBe('["first","second"]')
  expect(f.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))

  await f.write('1.json', 'first')
  await vi.waitFor(() => expect(f.send).toHaveBeenCalledWith({ type: 'full-reload' }), { timeout: 5000 })
  await f.remove('2.json')
  await vi.waitFor(async () => expect(await f.output()).toBe('["first"]'), { timeout: 5000 })
}, 20_000)

test('reloads the page once the catalog catches up instead of hot-swapping cue data', async () => {
  const f = await fixture()
  const plugin = server!.config.plugins.find((candidate) => candidate.name === 'public-reading-coverage')!
  const hook = plugin.hotUpdate as { handler: (this: unknown, options: unknown) => unknown }
  const update = (file: string) => hook.handler.call({ environment: server!.environments.client }, {
    type: 'update', file: path.join(root!, file), modules: [], timestamp: Date.now(), read: () => '', server,
  })
  await vi.waitFor(async () => expect(await f.output()).toBe('[]'), { timeout: 5000 })
  expect(update('app/reader/reader-runtime.ts')).toBeUndefined()

  await writeFile(f.gate, '')
  await f.write('1.json', 'first')
  await vi.waitFor(async () => expect((await f.runs()).match(/captured/g)).toHaveLength(2), { timeout: 5000 })
  expect(update('audio-cues/1.json')).toEqual([])
  expect(f.send).not.toHaveBeenCalledWith({ type: 'full-reload' })
  await rm(f.gate)
  await vi.waitFor(() => expect(f.send).toHaveBeenCalledWith({ type: 'full-reload' }), { timeout: 5000 })
  expect(await f.output()).toBe('["first"]')

  // A catalog written outside a refresh reloads right away.
  f.send.mockClear()
  expect(update('generated/public-reading-manifest.ts')).toEqual([])
  expect(f.send).toHaveBeenCalledWith({ type: 'full-reload' })
}, 15_000)
