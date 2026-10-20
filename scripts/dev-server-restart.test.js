import { expect, test, vi } from 'vitest'
import { devServerRestartPlugin, replacePreviousDevServer } from './dev-server-restart.mjs'

const root = '/project/Tikkun Reader'
const previous = {
  pid: 42, cwd: root, startedAt: 'Thu Oct 15 08:56:57 2026',
  command: `node ${root}/node_modules/.bin/vite`,
}

function setup(identity = previous) {
  const inspect = vi.fn().mockResolvedValue(identity)
  const signal = vi.fn(() => inspect.mockResolvedValue(null))
  return {
    root, port: 5176, currentPid: 99,
    run: vi.fn().mockResolvedValue({ stdout: '42\n42\n' }),
    inspect, signal, wait: vi.fn().mockResolvedValue(), log: vi.fn(),
  }
}

test('replaces the old checkout server once and waits for it to exit', async () => {
  const options = setup()
  await replacePreviousDevServer(options)
  expect(options.signal).toHaveBeenCalledExactlyOnceWith(42, 'SIGTERM')
  expect(options.wait).toHaveBeenCalledWith(100)
  expect(options.run).toHaveBeenCalledWith('lsof', ['-nP', '-iTCP:5176', '-sTCP:LISTEN', '-t'])
})

test.each([
  'node ROOT/node_modules/.bin/vite --host 0.0.0.0 --port 5176',
  '/usr/local/bin/node ROOT/node_modules/vite/bin/vite.js',
  'node ROOT/node_modules/.bin/vite dev --host',
  'node ROOT/node_modules/.bin/vite serve',
  'node ROOT/node_modules/.bin/vite -m development',
  'node ROOT/node_modules/.bin/vite .',
  'node ROOT/node_modules/.bin/vite --port 5176 dev .',
  'node ROOT/node_modules/.bin/vite --mode preview --port=5176 .',
  'node ROOT/node_modules/.bin/vite --clearScreen false --strictPort --no-open .',
  'node ROOT/node_modules/.bin/vite --config vite.config.ts .',
])('recognizes the project Vite CLI: %s', async command => {
  const options = setup({ ...previous, command: command.replace('ROOT', root) })
  await replacePreviousDevServer(options)
  expect(options.signal).toHaveBeenCalledExactlyOnceWith(42, 'SIGTERM')
})

test.each([
  null,
  { ...previous, cwd: '/other-project' },
  { ...previous, command: 'node api.js' },
  { ...previous, command: 'node /other-project/node_modules/.bin/vite' },
  { ...previous, command: `${previous.command} preview --port 5176` },
  { ...previous, command: `${previous.command} build` },
  { ...previous, command: `${previous.command} /other-project` },
  { ...previous, command: `${previous.command}-unrelated` },
  { ...previous, command: `${previous.command} --port 5176 preview` },
  { ...previous, command: `${previous.command} --port 5176 /other-project` },
  { ...previous, command: `${previous.command} --port=5176 build` },
  { ...previous, command: `${previous.command} --mode development serve /other-project` },
  { ...previous, command: `${previous.command} -c /other-project/vite.config.ts` },
  { ...previous, command: `${previous.command} --unknown-option` },
])('does not signal an unrelated or unverifiable listener: %j', async identity => {
  const options = setup(identity)
  await expect(replacePreviousDevServer(options)).rejects.toThrow(/another or unverified/)
  expect(options.signal).not.toHaveBeenCalled()
})

test('checks every listener before stopping any of them', async () => {
  const options = setup()
  options.run.mockResolvedValue({ stdout: '42\n43\n' })
  options.inspect.mockResolvedValueOnce(previous).mockResolvedValueOnce({ ...previous, pid: 43, cwd: '/other-project' })
  await expect(replacePreviousDevServer(options)).rejects.toThrow(/another or unverified/)
  expect(options.signal).not.toHaveBeenCalled()
})

test('skips its own listener during Vite config restarts', async () => {
  const options = setup()
  options.currentPid = 42
  await replacePreviousDevServer(options)
  expect(options.inspect).not.toHaveBeenCalled()
  expect(options.signal).not.toHaveBeenCalled()
})

test('distinguishes a free port from a failed inspection', async () => {
  const options = setup()
  options.run.mockRejectedValue({ code: 1, stdout: '', stderr: '' })
  await replacePreviousDevServer(options)
  options.run.mockRejectedValue(new Error('lsof unavailable'))
  await expect(replacePreviousDevServer(options)).rejects.toThrow('lsof unavailable')
  expect(options.signal).not.toHaveBeenCalled()
})

test('never signals a reused PID', async () => {
  const options = setup()
  options.inspect.mockResolvedValueOnce(previous).mockResolvedValue({ ...previous, startedAt: 'later' })
  await replacePreviousDevServer(options)
  expect(options.signal).not.toHaveBeenCalled()
})

test('escalates a stuck verified server after allowing graceful shutdown', async () => {
  const options = setup()
  options.signal.mockImplementation((_pid, signal) => {
    if (signal === 'SIGKILL') options.inspect.mockResolvedValue(null)
  })
  await replacePreviousDevServer(options)
  expect(options.signal.mock.calls).toEqual([[42, 'SIGTERM'], [42, 'SIGKILL']])
  expect(options.wait).toHaveBeenCalledTimes(51)
})

test('reports a process that cannot be stopped', async () => {
  const options = setup()
  options.signal.mockImplementation(() => {})
  await expect(replacePreviousDevServer(options)).rejects.toThrow(/did not stop/)
})

test('handles a process exiting before the signal and propagates permission errors', async () => {
  const options = setup()
  options.signal.mockImplementation(() => {
    options.inspect.mockResolvedValue(null)
    throw Object.assign(new Error('no process'), { code: 'ESRCH' })
  })
  await replacePreviousDevServer(options)
  options.inspect.mockResolvedValue(previous)
  options.signal.mockImplementation(() => { throw Object.assign(new Error('permission denied'), { code: 'EPERM' }) })
  await expect(replacePreviousDevServer(options)).rejects.toThrow('permission denied')
})

test('uses the resolved CLI port and avoids tests, middleware, preview and builds', async () => {
  const replace = vi.fn()
  const plugin = devServerRestartPlugin(replace)
  const config = { root, mode: 'development', server: { port: 5177 }, logger: { info: vi.fn() } }
  await plugin.configureServer({ config })
  expect(replace).toHaveBeenCalledWith({ root, port: 5177, log: expect.any(Function) })
  replace.mockClear()
  for (const override of [{ mode: 'test' }, { server: { middlewareMode: true } }, { server: { port: 0 } }]) {
    await plugin.configureServer({ config: { ...config, ...override } })
  }
  expect(replace).not.toHaveBeenCalled()
  expect(plugin.apply).toBe('serve')
  expect(plugin.configurePreviewServer).toBeUndefined()
})
