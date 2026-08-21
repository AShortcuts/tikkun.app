import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
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
  fixture.remove()
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

test('replacement mounts remove the previous prompt listeners', () => {
  const mount = createMount()
  const firstResume = vi.fn()
  const secondResume = vi.fn()
  const reading = {
    hash: '#/torah/parsha/beresheet',
    parshaName: 'Beresheet',
    savedAt: Date.now(),
  }

  mount((scope) => {
    createLastReadingPrompt(scope, {
      document,
      disabled: false,
      onResume: firstResume,
    }).show(reading)
  })
  const destroy = mount((scope) => {
    createLastReadingPrompt(scope, {
      document,
      disabled: false,
      onResume: secondResume,
    }).show(reading)
  })

  fixture
    .querySelector<HTMLButtonElement>('[data-target-id="last-reading-resume"]')!
    .click()
  expect(firstResume).not.toHaveBeenCalled()
  expect(secondResume).toHaveBeenCalledOnce()

  destroy()
})
