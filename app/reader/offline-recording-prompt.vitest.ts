import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
import { createOfflineRecordingPrompt } from './offline-recording-prompt.ts'

let fixture: HTMLElement

beforeEach(() => {
  fixture = document.createElement('section')
  fixture.innerHTML = `
    <div class="u-hidden" data-target-id="app-offline-prompt">
      <button data-target-id="app-offline-dismiss"></button>
    </div>
  `
  document.body.appendChild(fixture)
})

afterEach(() => {
  fixture.remove()
})

test('retries current work on reconnect and ignores stale work', async () => {
  let online = false
  const retry = vi.fn(async () => {})
  const onRetryError = vi.fn()
  const destroy = createMount()((scope) => {
    const prompt = createOfflineRecordingPrompt(scope, {
      document,
      view: window,
      isOnline: () => online,
      onRetryError,
    })
    expect(prompt.canUseNetwork(retry, () => true)).toBe(false)
  })

  expect(
    fixture
      .querySelector('[data-target-id="app-offline-prompt"]')
      ?.classList.contains('u-hidden')
  ).toBe(false)
  online = true
  window.dispatchEvent(new Event('online'))
  await Promise.resolve()
  expect(retry).toHaveBeenCalledOnce()
  expect(onRetryError).not.toHaveBeenCalled()

  destroy()
})

test('replacement mounts own the connectivity listeners', async () => {
  const mount = createMount()
  const firstRetry = vi.fn(async () => {})
  const secondRetry = vi.fn(async () => {})
  let online = false

  mount((scope) => {
    const prompt = createOfflineRecordingPrompt(scope, {
      document,
      view: window,
      isOnline: () => online,
      onRetryError: vi.fn(),
    })
    prompt.setPendingRetry(firstRetry)
  })
  const destroy = mount((scope) => {
    const prompt = createOfflineRecordingPrompt(scope, {
      document,
      view: window,
      isOnline: () => online,
      onRetryError: vi.fn(),
    })
    prompt.setPendingRetry(secondRetry)
  })

  online = true
  window.dispatchEvent(new Event('online'))
  await Promise.resolve()
  expect(firstRetry).not.toHaveBeenCalled()
  expect(secondRetry).toHaveBeenCalledOnce()

  destroy()
})
