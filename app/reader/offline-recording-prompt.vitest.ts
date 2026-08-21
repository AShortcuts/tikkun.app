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

test('stays hidden until an offline playback attempt really fails', () => {
  const destroy = createMount()((scope) => {
    createOfflineRecordingPrompt(scope, {
      document,
      view: window,
      onRetryError: vi.fn(),
    })
  })

  window.dispatchEvent(new Event('offline'))
  expect(isPromptHidden()).toBe(true)

  destroy()
})

test('shows a real playback failure and retries current work on reconnect', async () => {
  const retry = vi.fn(async () => {})
  const onRetryError = vi.fn()
  const destroy = createMount()((scope) => {
    const prompt = createOfflineRecordingPrompt(scope, {
      document,
      view: window,
      onRetryError,
    })
    prompt.recordPlaybackFailure(retry, () => true)
  })

  expect(isPromptHidden()).toBe(false)
  window.dispatchEvent(new Event('online'))
  await Promise.resolve()
  expect(retry).toHaveBeenCalledOnce()
  expect(onRetryError).not.toHaveBeenCalled()
  expect(isPromptHidden()).toBe(true)

  destroy()
})

test('does not retry a playback failure after its target becomes stale', async () => {
  let current = true
  const retry = vi.fn(async () => {})
  const destroy = createMount()((scope) => {
    const prompt = createOfflineRecordingPrompt(scope, {
      document,
      view: window,
      onRetryError: vi.fn(),
    })
    prompt.recordPlaybackFailure(retry, () => current)
  })

  current = false
  window.dispatchEvent(new Event('online'))
  await Promise.resolve()
  expect(retry).not.toHaveBeenCalled()
  expect(isPromptHidden()).toBe(true)

  destroy()
})

test('replacement mounts own the reconnect listener', async () => {
  const mount = createMount()
  const firstRetry = vi.fn(async () => {})
  const secondRetry = vi.fn(async () => {})

  mount((scope) => {
    const prompt = createOfflineRecordingPrompt(scope, {
      document,
      view: window,
      onRetryError: vi.fn(),
    })
    prompt.recordPlaybackFailure(firstRetry)
  })
  const destroy = mount((scope) => {
    const prompt = createOfflineRecordingPrompt(scope, {
      document,
      view: window,
      onRetryError: vi.fn(),
    })
    prompt.recordPlaybackFailure(secondRetry)
  })

  window.dispatchEvent(new Event('online'))
  await Promise.resolve()
  expect(firstRetry).not.toHaveBeenCalled()
  expect(secondRetry).toHaveBeenCalledOnce()

  destroy()
})

function isPromptHidden() {
  return Boolean(
    fixture
      .querySelector('[data-target-id="app-offline-prompt"]')
      ?.classList.contains('u-hidden')
  )
}
