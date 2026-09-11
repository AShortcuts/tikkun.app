import vm from 'node:vm'
import { expect, test, vi } from 'vitest'
import { renderRecordingMutationLocks } from './recording-mutation-locks.mjs'

test('missing worker locks refuse removal without touching saved files', async () => {
  const remove = vm.runInNewContext(`${renderRecordingMutationLocks('test')}; withRecordingRemoval`, { self: {} })
  const task = vi.fn()
  await expect(remove('audio', task)).rejects.toThrow('Saved files were kept')
  await expect(remove(null, task)).rejects.toThrow('Saved files were kept')
  expect(task).not.toHaveBeenCalled()
})

test('lock errors propagate without falling back to uncoordinated mutations', async () => {
  const api = vm.runInNewContext(`${renderRecordingMutationLocks('test')}; ({ withRecordingRemoval, withRecordingSave })`, {
    self: { registration: { scope: 'https://tikkun.test/' }, navigator: { locks: { request: async () => { throw new Error('lock failed') } } } },
  })
  const task = vi.fn()
  await expect(api.withRecordingRemoval('audio', task)).rejects.toThrow('lock failed')
  await expect(api.withRecordingSave('audio', undefined, task)).rejects.toThrow('lock failed')
  expect(task).not.toHaveBeenCalled()
})

test('download fallback remains supported but respects prior cancellation', async () => {
  const save = vm.runInNewContext(`${renderRecordingMutationLocks('test')}; withRecordingSave`, { self: {} })
  const task = vi.fn(async () => 42)
  await expect(save('audio', undefined, task)).resolves.toBe(42)
  const controller = new AbortController()
  controller.abort()
  await expect(save('audio', controller.signal, task)).rejects.toMatchObject({ name: 'AbortError' })
  expect(task).toHaveBeenCalledOnce()
})
