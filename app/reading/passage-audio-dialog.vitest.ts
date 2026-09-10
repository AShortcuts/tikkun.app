import { afterEach, expect, test, vi } from 'vitest'
import { createMount } from '../lifecycle/mount.ts'
import { createPassageAudioDialog } from './passage-audio-dialog.ts'
import type { PassageAudioResolution, PassageAudioPortion } from './passage-audio.ts'

const range = { start: { scroll: 'torah' as const, b: 5, c: 31, v: 1 }, end: { scroll: 'torah' as const, b: 5, c: 31, v: 6 } }
const portion: PassageAudioPortion = { range, tokenKeys: [], segments: [] }
const partial: PassageAudioResolution = {
  range, tokenKeys: [], missing: [], cueComplete: false,
  problem: 'partial-audio', message: 'Opening unavailable: 30:15-30:20', recording: null,
  portions: [portion],
}
let destroy: (() => void) | undefined
afterEach(() => { destroy?.(); destroy = undefined })

test('explains missing coverage and requires explicit partial-playback selection', async () => {
  let result!: Promise<PassageAudioPortion | null>
  const authorize = vi.fn()
  destroy = createMount()(scope => {
    result = createPassageAudioDialog(scope, document)(partial, scope.signal, authorize)
  })
  const dialog = document.querySelector('dialog')!
  expect(dialog.open).toBe(true)
  expect(dialog.textContent).toContain('Opening unavailable: 30:15-30:20')
  expect(authorize).not.toHaveBeenCalled()
  dialog.querySelector('button')!.click()
  expect(await result).toBe(portion)
  expect(authorize).toHaveBeenCalledWith(portion)
  expect(dialog.open).toBe(false)
})

test('cancelling or changing route never starts partial playback', async () => {
  const lifetime = new AbortController()
  let result!: Promise<PassageAudioPortion | null>
  const authorize = vi.fn()
  destroy = createMount()(scope => {
    result = createPassageAudioDialog(scope, document)(partial, lifetime.signal, authorize)
  })
  lifetime.abort()
  expect(await result).toBeNull()
  expect(authorize).not.toHaveBeenCalled()
  expect(document.querySelector('dialog')!.open).toBe(false)
})

test('missing excerpt timing offers an explanation without a play action', async () => {
  let result!: Promise<PassageAudioPortion | null>
  destroy = createMount()(scope => {
    result = createPassageAudioDialog(scope, document)({ ...partial, problem: 'timing-needed', message: 'Excerpt timing needed: 31:28-31:30', portions: [] }, scope.signal, vi.fn())
  })
  const dialog = document.querySelector('dialog')!
  expect(dialog.querySelectorAll('button')).toHaveLength(1)
  expect(dialog.textContent).toContain('Excerpt timing needed')
  dialog.querySelector('button')!.click()
  expect(await result).toBeNull()
})
