import { afterEach, beforeEach, expect, test } from 'vitest'
import { page } from 'vitest/browser'
import '../../css/master.css'
import '../../css/page.css'
import '../../css/reader-enhancements.css'
import '../../css/cue-authoring.css'

let fixture: HTMLElement

beforeEach(async () => {
  await page.viewport(1280, 900)
  fixture = document.createElement('section')
  fixture.innerHTML = `
    <button class="aliyah-audio-button" aria-label="Inactive aliyah audio">Play</button>
    <button class="aliyah-audio-button is-active" aria-label="Active aliyah audio">Pause</button>
    <div class="floating-player is-expanded is-playing">
      <div class="floating-player-controls">
        <button
          class="floating-player-button"
          data-target-id="floating-play"
          aria-label="Floating player pause"
        >Pause</button>
      </div>
    </div>
    <button data-target-id="admin-play-current" aria-label="Authoring playback">Play</button>
  `
  document.body.appendChild(fixture)
})

afterEach(() => fixture.remove())

test('keeps active aliyah hover yellow while inactive playback hover stays blue', async () => {
  const inactive = required<HTMLButtonElement>(
    '[aria-label="Inactive aliyah audio"]'
  )
  const active = required<HTMLButtonElement>('[aria-label="Active aliyah audio"]')

  await page.getByRole('button', { name: 'Inactive aliyah audio' }).hover()
  await transitionSettled()
  expect(getComputedStyle(inactive).backgroundColor).toBe(
    computedBackground('color-mix(in srgb, dodgerblue 20%, transparent)')
  )

  await page
    .getByRole('button', { name: 'Active aliyah audio', exact: true })
    .hover()
  await transitionSettled()
  const activeHover = getComputedStyle(active).backgroundColor
  expect(activeHover).toBe(
    computedBackground(
      'color-mix(in srgb, hsl(48, 100%, 62%) 26%, transparent)'
    )
  )
  expect(activeHover).not.toBe(getComputedStyle(inactive).backgroundColor)
})

test('gives enabled playback controls pointer affordance across lazy CSS boundaries', () => {
  for (const selector of [
    '.aliyah-audio-button',
    '[data-target-id="floating-play"]',
    '[data-target-id="admin-play-current"]',
  ]) {
    expect(getComputedStyle(required(selector)).cursor).toBe('pointer')
  }
})

test('keeps expanded playing hover tied to the blue playing state', async () => {
  const play = required('[data-target-id="floating-play"]')
  await page.getByRole('button', { name: 'Floating player pause' }).hover()
  await transitionSettled()

  expect(getComputedStyle(play).backgroundColor).toBe(
    computedBackground('color-mix(in srgb, #0a84ff 86%, white)')
  )
  expect(getComputedStyle(play).color).toBe('rgb(255, 255, 255)')
})

function computedBackground(value: string) {
  const sample = document.createElement('span')
  sample.style.backgroundColor = value
  document.body.appendChild(sample)
  const computed = getComputedStyle(sample).backgroundColor
  sample.remove()
  return computed
}

function transitionSettled() {
  return new Promise((resolve) => setTimeout(resolve, 250))
}

function required<T extends Element = HTMLElement>(selector: string): T {
  const element = fixture.querySelector<T>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}
