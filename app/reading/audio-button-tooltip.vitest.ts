import { afterEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { createMount } from '../lifecycle/mount.ts'
import { mountAudioButtonTooltip } from './audio-button-tooltip.ts'
import '../../css/master.css'

let destroy: (() => void) | undefined
let button: HTMLButtonElement
let controls: HTMLElement | undefined
afterEach(() => { destroy?.(); button?.remove(); controls?.remove(); delete document.documentElement.dataset.readerTheme; delete document.documentElement.dataset.readerMode; delete document.documentElement.dataset.recordingMode; vi.useRealTimers() })

function setup() {
  vi.useFakeTimers()
  button = document.createElement('button')
  button.dataset.audioTooltip = 'No recording available for this aliyah.'
  button.setAttribute('aria-disabled', 'true')
  document.body.append(button)
  destroy = createMount()(scope => mountAudioButtonTooltip(scope, document))
  return document.querySelector<HTMLElement>('.audio-button-tooltip')!
}

test('hover waits briefly, stays in viewport, and Escape dismisses', async () => {
  const tip = setup()
  button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }))
  await vi.advanceTimersByTimeAsync(349)
  expect(tip.hidden).toBe(true)
  await vi.advanceTimersByTimeAsync(1)
  expect(tip.hidden).toBe(false)
  expect(tip.textContent).toBe(button.dataset.audioTooltip)
  const rect = tip.getBoundingClientRect()
  expect(rect.left).toBeGreaterThanOrEqual(8)
  expect(rect.right).toBeLessThanOrEqual(window.innerWidth - 8)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  expect(tip.hidden).toBe(true)
})

test('unplayable buttons remain focusable with accessible descriptions and cleanup', async () => {
  const tip = setup()
  button.focus()
  await vi.advanceTimersByTimeAsync(0)
  expect(document.activeElement).toBe(button)
  expect(tip.hidden).toBe(false)
  expect(button.getAttribute('aria-describedby')).toBe(tip.id)
  destroy?.()
  expect(tip.isConnected).toBe(false)
  expect(button.hasAttribute('aria-describedby')).toBe(false)
})

test.each(['light', 'dark'] as const)('desktop and mobile preserve issue colors and independent dimming in %s mode', async theme => {
  document.documentElement.dataset.readerTheme = theme
  controls = document.createElement('section')
  controls.innerHTML = ['cue', 'audio', 'empty'].map(tone => `
    <div class="mobile-aliyah-capsule" data-audio-tone="${tone}">
      <button class="mobile-aliyah-play-toggle" data-audio-tone="${tone}" data-audio-dimmed="true">Play</button>
    </div>
    <button class="aliyah-audio-button" data-audio-tone="${tone}" data-audio-dimmed="true">Play</button>
    <button class="mobile-aliyah-play" data-audio-tone="${tone}" data-audio-dimmed="true">Play</button>
  `).join('')
  document.body.append(controls)
  for (const width of [1280, 390]) {
    await page.viewport(width, 900)
    for (const button of controls.querySelectorAll<HTMLButtonElement>('button')) {
      button.style.transition = 'none'
      const style = getComputedStyle(button)
      const expectedColor = button.dataset.audioTone === 'cue' ? 'rgb(48, 213, 200)' : button.dataset.audioTone === 'audio' ? 'rgb(196, 95, 102)' : null
      const color = button.classList.contains('mobile-aliyah-play') && button.dataset.audioTone !== 'empty' ? style.backgroundColor : style.color
      if (expectedColor) expect(color).toBe(expectedColor)
      else expect(style.getPropertyValue('--audio-button-color').trim()).toBe(style.getPropertyValue('--light-text-color').trim())
      expect(style.opacity).toBe('0.42')
      document.documentElement.dataset.readerMode = 'admin-authoring'
      expect(getComputedStyle(button).opacity).toBe('1')
      delete document.documentElement.dataset.readerMode
      document.documentElement.dataset.recordingMode = 'true'
      expect(getComputedStyle(button).opacity).toBe('1')
      delete document.documentElement.dataset.recordingMode
    }
  }
})
