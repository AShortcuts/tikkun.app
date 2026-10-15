import { beforeEach, expect, test, vi } from 'vitest'

const native = vi.hoisted(() => ({ enabled: false, available: true, impact: vi.fn(async () => {}) }))
vi.mock('@capacitor/core', () => ({ Capacitor: {
  isNativePlatform: () => native.enabled,
  isPluginAvailable: () => native.available,
} }))
vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: native.impact }, ImpactStyle: { Light: 'LIGHT' } }))
import { nativeControlHaptic } from './native-haptics.ts'

beforeEach(() => {
  native.enabled = false
  native.available = true
  native.impact.mockReset()
})

test('haptics are limited to native touch activation with an installed plugin', () => {
  nativeControlHaptic('touch')
  native.enabled = true
  for (const pointer of ['', 'mouse', 'pen']) nativeControlHaptic(pointer)
  native.available = false
  nativeControlHaptic('touch')
  expect(native.impact).not.toHaveBeenCalled()
  native.available = true
  native.impact.mockResolvedValue()
  nativeControlHaptic('touch')
  expect(native.impact).toHaveBeenCalledExactlyOnceWith({ style: 'LIGHT' })
})

test('a failed haptic is logged without interrupting the control action', async () => {
  native.enabled = true
  const error = new Error('Native haptic failed')
  native.impact.mockRejectedValue(error)
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  nativeControlHaptic('touch')
  await Promise.resolve()
  expect(log).toHaveBeenCalledWith('Could not play reader control haptic', error)
  log.mockRestore()
})
