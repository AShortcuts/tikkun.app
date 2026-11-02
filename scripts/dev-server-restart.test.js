import { expect, test, vi } from 'vitest'
import { replacePreviousDevServer } from './dev-server-restart.mjs'

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

test.each(['node ROOT/node_modules/.bin/vite --host 0.0.0.0 --port 5176'])('recognizes the project Vite CLI: %s', async command => {
  const options = setup({ ...previous, command: command.replace('ROOT', root) })
  await replacePreviousDevServer(options)
  expect(options.signal).toHaveBeenCalledExactlyOnceWith(42, 'SIGTERM')
})

test.each([null, { ...previous, cwd: '/other-project' }])('does not signal an unrelated or unverifiable listener: %j', async identity => {
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

test('never signals a reused PID', async () => {
  const options = setup()
  options.inspect.mockResolvedValueOnce(previous).mockResolvedValue({ ...previous, startedAt: 'later' })
  await replacePreviousDevServer(options)
  expect(options.signal).not.toHaveBeenCalled()
})
