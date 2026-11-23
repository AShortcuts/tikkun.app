import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
import { READER_BANNER_AUTO_DISMISS_MS } from './banner-timing.ts'
import { createLastReadingPrompt } from './last-reading-prompt.ts'

let fixture: HTMLElement

beforeEach(() => {
  fixture = document.createElement('section')
  fixture.innerHTML = `
    <div class="u-hidden" data-target-id="last-reading-prompt">
      <span data-target-id="last-reading-copy"></span>
      <button data-target-id="last-reading-resume"></button>
      <button data-target-id="last-reading-dismiss"></button>
    </div>
  `
  document.body.appendChild(fixture)
})

afterEach(() => {
  vi.useRealTimers()
  fixture.remove()
})

test('a Return offer leaves on its own, waits while in use, and a Resume offer stays', () => {
  vi.useFakeTimers()
  let prompt!: ReturnType<typeof createLastReadingPrompt>
  const destroy = createMount()((scope) => {
    prompt = createLastReadingPrompt(scope, { document, disabled: false, onResume: vi.fn() })
  })
  const banner = fixture.querySelector<HTMLElement>('[data-target-id="last-reading-prompt"]')!
  const hidden = () => banner.classList.contains('u-hidden')
  const reading = { hash: '#/torah/parsha/beresheet/1-1-1', parshaName: 'Beresheet', aliyahLabel: 'Aliyah 1', savedAt: Date.now() }

  prompt.show(reading, 'return')
  vi.advanceTimersByTime(READER_BANNER_AUTO_DISMISS_MS - 1)
  expect(hidden()).toBe(false)
  vi.advanceTimersByTime(1)
  expect(hidden()).toBe(true)

  prompt.show(reading, 'return')
  banner.dispatchEvent(new PointerEvent('pointerenter'))
  vi.advanceTimersByTime(READER_BANNER_AUTO_DISMISS_MS * 2)
  expect(hidden()).toBe(false)
  banner.dispatchEvent(new PointerEvent('pointerleave'))
  vi.advanceTimersByTime(READER_BANNER_AUTO_DISMISS_MS)
  expect(hidden()).toBe(true)

  prompt.show(reading, 'return')
  fixture.querySelector<HTMLButtonElement>('[data-target-id="last-reading-resume"]')!.focus()
  vi.advanceTimersByTime(READER_BANNER_AUTO_DISMISS_MS * 2)
  expect(hidden()).toBe(false)
  fixture.querySelector<HTMLButtonElement>('[data-target-id="last-reading-dismiss"]')!.focus()
  vi.advanceTimersByTime(READER_BANNER_AUTO_DISMISS_MS * 2)
  expect(hidden()).toBe(false)
  ;(document.activeElement as HTMLElement).blur()
  vi.advanceTimersByTime(READER_BANNER_AUTO_DISMISS_MS)
  expect(hidden()).toBe(true)

  prompt.show(reading)
  vi.advanceTimersByTime(READER_BANNER_AUTO_DISMISS_MS * 2)
  expect(hidden()).toBe(false)

  destroy()
})

test('shows and resumes a saved reading', () => {
  const onResume = vi.fn()
  const destroy = createMount()((scope) => {
    const prompt = createLastReadingPrompt(scope, {
      document,
      disabled: false,
      onResume,
    })
    prompt.show({
      hash: '#/torah/parsha/beresheet',
      parshaName: 'Beresheet',
      aliyahLabel: 'Aliyah 1',
      savedAt: Date.now(),
    })
  })

  expect(fixture.textContent).toContain('Resume Beresheet, Aliyah 1?')
  fixture
    .querySelector<HTMLButtonElement>('[data-target-id="last-reading-resume"]')!
    .click()
  expect(onResume).toHaveBeenCalledOnce()
  expect(
    fixture
      .querySelector('[data-target-id="last-reading-prompt"]')
      ?.classList.contains('u-hidden')
  ).toBe(true)

  destroy()
})

test('reuses the banner to return to a previous reading', () => {
  const onResume = vi.fn()
  let prompt!: ReturnType<typeof createLastReadingPrompt>
  const destroy = createMount()((scope) => {
    prompt = createLastReadingPrompt(scope, {
      document,
      disabled: false,
      onResume,
    })
  })
  const previousReading = {
    hash: '#/torah/parsha/beresheet/1-1-1',
    parshaName: 'Beresheet',
    aliyahLabel: 'Aliyah 1',
    savedAt: Date.now(),
  }

  prompt.dismiss()
  prompt.show(previousReading, 'return')

  expect(fixture.textContent).toContain('Return to Beresheet, Aliyah 1?')
  const returnButton = fixture.querySelector<HTMLButtonElement>(
    '[data-target-id="last-reading-resume"]'
  )!
  expect(returnButton.textContent).toBe('Return')
  expect(
    fixture
      .querySelector('[data-target-id="last-reading-dismiss"]')
      ?.getAttribute('aria-label')
  ).toBe('Dismiss return prompt')

  returnButton.click()
  expect(onResume).toHaveBeenCalledWith(previousReading)
  expect(
    fixture
      .querySelector('[data-target-id="last-reading-prompt"]')
      ?.classList.contains('u-hidden')
  ).toBe(true)

  destroy()
})
