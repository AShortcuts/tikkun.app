import { expect, test, vi } from 'vitest'
import { handleAliyahPermalinkClick } from './aliyah-permalink.ts'

test('copies an aliyah permalink and marks the link as copied after a successful click', async () => {
  document.body.innerHTML = `
    <a data-aliyah-link="true" href="#/torah/parsha/lech-lecha/1-12-14">
      <span data-aliyah-link-icon="link"></span>
      <span data-aliyah-link-icon="check" hidden></span>
    </a>
  `
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })

  const link = document.querySelector<HTMLAnchorElement>('[data-aliyah-link="true"]')
  if (!link) throw new Error('Expected link')
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'target', {
    configurable: true,
    value: link,
  })

  await handleAliyahPermalinkClick(event)

  expect(event.defaultPrevented).toBe(true)
  expect(writeText).toHaveBeenCalledWith(link.href)
  expect(link.dataset.copyState).toBe('copied')
  expect(link.querySelector('[data-aliyah-link-icon="link"]')?.hasAttribute('hidden')).toBe(true)
  expect(link.querySelector('[data-aliyah-link-icon="check"]')?.hasAttribute('hidden')).toBe(false)
})

test('resets the copied state and icon together', async () => {
  vi.useFakeTimers()
  try {
    document.body.innerHTML = `
      <button type="button" data-aliyah-link="true" data-aliyah-url="#/torah/parsha/lech-lecha/1-12-14">
        <span data-aliyah-link-icon="link"></span>
        <span data-aliyah-link-icon="check" hidden></span>
      </button>
    `
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })

    const link = document.querySelector<HTMLButtonElement>(
      '[data-aliyah-link="true"]'
    )
    if (!link) throw new Error('Expected link')
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: link,
    })

    await handleAliyahPermalinkClick(event)
    expect(link.dataset.copyState).toBe('copied')

    vi.runOnlyPendingTimers()

    expect(link.dataset.copyState).toBeUndefined()
    expect(
      link
        .querySelector('[data-aliyah-link-icon="link"]')
        ?.hasAttribute('hidden')
    ).toBe(false)
    expect(
      link
        .querySelector('[data-aliyah-link-icon="check"]')
        ?.hasAttribute('hidden')
    ).toBe(true)
  } finally {
    vi.useRealTimers()
  }
})

test('copies the current aliyah permalink even when the reader is already on that URL', async () => {
  window.location.hash = '#/torah/parsha/lech-lecha/1-12-14'
  document.body.innerHTML = `
    <button type="button" data-aliyah-link="true" data-aliyah-url="#/torah/parsha/lech-lecha/1-12-14">
      <span data-aliyah-link-icon="link"></span>
      <span data-aliyah-link-icon="check" hidden></span>
    </button>
  `
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })

  const button = document.querySelector<HTMLButtonElement>('[data-aliyah-link="true"]')
  if (!button) throw new Error('Expected button')
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'target', {
    configurable: true,
    value: button,
  })

  await handleAliyahPermalinkClick(event)

  expect(event.defaultPrevented).toBe(true)
  expect(writeText).toHaveBeenCalledWith(
    `${window.location.origin}${window.location.pathname}${window.location.search}#/torah/parsha/lech-lecha/1-12-14`
  )
  expect(button.dataset.copyState).toBe('copied')
  expect(button.querySelector('[data-aliyah-link-icon="link"]')?.hasAttribute('hidden')).toBe(true)
  expect(button.querySelector('[data-aliyah-link-icon="check"]')?.hasAttribute('hidden')).toBe(false)
})

test('copies a clean permalink regardless of unrelated Reader query state', async () => {
  window.location.hash =
    '#/torah/parsha/noach/1-9-8?aliyah=5&aliyahRun=2026-10-17%3Ashacharis%2Cmain'
  document.body.innerHTML = `
    <button type="button" data-aliyah-link="true" data-aliyah-url="#/torah/parsha/noach/1-9-8">
      <span data-aliyah-link-icon="link"></span>
      <span data-aliyah-link-icon="check" hidden></span>
    </button>
  `
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })

  const button = document.querySelector<HTMLButtonElement>('[data-aliyah-link="true"]')
  if (!button) throw new Error('Expected button')
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'target', {
    configurable: true,
    value: button,
  })

  await handleAliyahPermalinkClick(event)

  expect(writeText).toHaveBeenCalledWith(
    `${window.location.origin}${window.location.pathname}${window.location.search}#/torah/parsha/noach/1-9-8`
  )
})

test('does not navigate or show success when aliyah permalink copying fails', async () => {
  document.body.innerHTML = `
    <button type="button" data-aliyah-link="true" data-aliyah-url="#/torah/parsha/lech-lecha/1-12-14">
      <span data-aliyah-link-icon="link"></span>
      <span data-aliyah-link-icon="check" hidden></span>
    </button>
  `
  const writeText = vi.fn().mockRejectedValue(new Error('blocked'))
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  const link = document.querySelector<HTMLElement>('[data-aliyah-link="true"]')
  if (!link) throw new Error('Expected link')
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'target', {
    configurable: true,
    value: link,
  })

  await handleAliyahPermalinkClick(event)

  expect(event.defaultPrevented).toBe(true)
  expect(writeText).toHaveBeenCalledWith(
    `${window.location.origin}${window.location.pathname}${window.location.search}#/torah/parsha/lech-lecha/1-12-14`
  )
  expect(link.dataset.copyState).toBeUndefined()
  expect(link.querySelector('[data-aliyah-link-icon="link"]')?.hasAttribute('hidden')).toBe(false)
  expect(link.querySelector('[data-aliyah-link-icon="check"]')?.hasAttribute('hidden')).toBe(true)
  expect(warn).toHaveBeenCalled()
  warn.mockRestore()
})
