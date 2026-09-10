import { appendFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger, createServer, type ViteDevServer } from 'vite'
import { afterEach, expect, test, vi } from 'vitest'
import { isPublicReadingCoverageInput, publicReadingCoveragePlugin } from './public-reading-coverage-plugin.ts'

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

test('watches cue and canonical inputs without watching its own output or private results', () => {
  for (const file of ['audio-cues/reader/parsha/1.json', 'text/pages/torah/165.json', 'generated/audio-manifest.ts', 'app/reader/canonical-line-words.ts']) {
    expect(isPublicReadingCoverageInput('/project', `/project/${file}`)).toBe(true)
  }
  for (const file of ['generated/public-reading-manifest.ts', 'experiments/results/cues.json', 'audio-cues/1.json.stage-1', '../other/audio-cues/1.json']) {
    expect(isPublicReadingCoverageInput('/project', `/project/${file}`)).toBe(false)
  }
})

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

test('queues edits made during generation instead of running overlapping generators', async () => {
  const f = await fixture()
  await writeFile(f.gate, '')
  await f.write('1.json', 'first')
  await vi.waitFor(async () => expect((await f.runs()).match(/captured/g)).toHaveLength(2), { timeout: 5000 })
  await f.write('2.json', 'second')
  await rm(f.gate)
  await vi.waitFor(async () => expect(await f.output()).toBe('["first","second"]'), { timeout: 5000 })
  expect(await f.runs()).toBe('start\ncaptured\ndone\nstart\ncaptured\ndone\nstart\ncaptured\ndone\n')
}, 15_000)

test('closing the server stops its generator and watcher', async () => {
  const f = await fixture()
  await writeFile(f.gate, '')
  await f.write('1.json', 'first')
  await vi.waitFor(async () => expect((await f.runs()).match(/captured/g)).toHaveLength(2), { timeout: 5000 })
  await server!.close()
  server = undefined
  await appendFile(path.join(root!, 'audio-cues/1.json'), 'changed')
  expect(await f.output()).toBe('[]')
  expect(f.errors).not.toHaveBeenCalled()
}, 15_000)
