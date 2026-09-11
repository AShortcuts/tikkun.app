import { expect, test, vi } from 'vitest'
import { renderRecordingMutationLocks } from './recording-mutation-locks.mjs'

interface Mutations {
  withRecordingSave<T>(url: string, signal: AbortSignal | undefined, task: () => Promise<T>): Promise<T>
  withRecordingRemoval<T>(url: string | null, task: () => Promise<T>): Promise<T>
}
const owner = (namespace: string): Mutations => new Function('self', `${renderRecordingMutationLocks(namespace)}; return { withRecordingSave, withRecordingRemoval }`)({ navigator, registration: { scope: `https://tikkun.test/${namespace}/` } })
function gate() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}
async function noLocks(namespace: string) {
  const snapshot = await navigator.locks.query()
  expect(snapshot.held?.filter((lock) => lock.name?.includes(namespace))).toEqual([])
  expect(snapshot.pending?.filter((lock) => lock.name?.includes(namespace))).toEqual([])
}

test('cross-owner saves serialize per URL, blocking matching and bulk removal only', async () => {
  const namespace = crypto.randomUUID(), first = owner(namespace), second = owner(namespace)
  const hold = gate(), entered = vi.fn(), next = vi.fn(async () => {})
  const saving = first.withRecordingSave('one', undefined, async () => { entered(); await hold.promise })
  const waiting = second.withRecordingSave('one', undefined, next)
  try {
    await expect.poll(() => entered.mock.calls.length).toBe(1)
    expect(next).not.toHaveBeenCalled()
    const remove = vi.fn(async () => {})
    await expect(second.withRecordingRemoval('one', remove)).rejects.toThrow('Another tab')
    await expect(second.withRecordingRemoval(null, remove)).rejects.toThrow('Another tab')
    expect(remove).not.toHaveBeenCalled()
    await second.withRecordingRemoval('unrelated', remove)
    expect(remove).toHaveBeenCalledOnce()
  } finally { hold.release(); await Promise.all([saving, waiting]) }
  expect(next).toHaveBeenCalledOnce()
  await second.withRecordingRemoval(null, async () => {})
  await noLocks(namespace)
})

test('bulk deletion rejects new saves and holds its lock through failing cleanup', async () => {
  const namespace = crypto.randomUUID(), first = owner(namespace), second = owner(namespace)
  const hold = gate(), entered = vi.fn(), save = vi.fn(async () => {})
  const removing = first.withRecordingRemoval(null, async () => { entered(); await hold.promise; throw new Error('delete failed') })
  const failed = expect(removing).rejects.toThrow('delete failed')
  try {
    await expect.poll(() => entered.mock.calls.length).toBe(1)
    await expect(second.withRecordingSave('two', undefined, save)).rejects.toThrow('Another tab')
    await expect(second.withRecordingRemoval('one', save)).rejects.toThrow('Another tab')
    expect(save).not.toHaveBeenCalled()
  } finally { hold.release(); await failed }
  await second.withRecordingSave('two', undefined, save)
  expect(save).toHaveBeenCalledOnce()
  await noLocks(namespace)
})

test('cancelling a save waiting for an asset releases its global reservation', async () => {
  const namespace = crypto.randomUUID(), first = owner(namespace), second = owner(namespace)
  const hold = gate(), entered = vi.fn(), task = vi.fn(async () => {})
  const saving = first.withRecordingSave('one', undefined, async () => { entered(); await hold.promise })
  const controller = new AbortController()
  const waiting = second.withRecordingSave('one', controller.signal, task)
  const cancelled = expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
  try {
    await expect.poll(() => entered.mock.calls.length).toBe(1)
    controller.abort()
    await cancelled
    expect(task).not.toHaveBeenCalled()
  } finally { controller.abort(); hold.release(); await saving }
  await second.withRecordingRemoval(null, async () => {})
  await noLocks(namespace)
})

test('deployment namespaces do not block each other', async () => {
  const firstNamespace = crypto.randomUUID(), secondNamespace = crypto.randomUUID()
  const hold = gate(), entered = vi.fn()
  const first = owner(firstNamespace).withRecordingRemoval(null, async () => { entered(); await hold.promise })
  try {
    await expect.poll(() => entered.mock.calls.length).toBe(1)
    await owner(secondNamespace).withRecordingSave('one', undefined, async () => {})
  } finally { hold.release(); await first }
  await noLocks(firstNamespace)
  await noLocks(secondNamespace)
})
