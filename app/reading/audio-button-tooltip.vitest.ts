import { afterEach, expect, test, vi } from 'vitest'
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

test('audio hover opens below the button, stays in viewport, and Escape dismisses', async () => {
  const tip = setup()
  button.style.cssText = 'position:fixed;top:160px;left:40px;width:44px;height:44px'
  button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }))
  await vi.advanceTimersByTimeAsync(349)
  expect(tip.hidden).toBe(true)
  await vi.advanceTimersByTimeAsync(1)
  expect(tip.hidden).toBe(false)
  expect(tip.textContent).toBe(button.dataset.audioTooltip)
  const rect = tip.getBoundingClientRect()
  expect(rect.top).toBe(button.getBoundingClientRect().bottom + 8)
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
