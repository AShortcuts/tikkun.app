import { beforeEach, expect, test, vi } from 'vitest'
const native = vi.hoisted(() => ({ enabled: false, update: vi.fn(async () => {}) }))
vi.mock('./native.ts', () => ({ isNativeApp: () => native.enabled }))
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ update: native.update }) }))
import { publishNativePractice } from './native-practice.ts'

beforeEach(() => { native.enabled = false; native.update.mockClear() })

test('does not call a native plugin in browser builds', () => {
  publishNativePractice({ israel: true })
  expect(native.update).not.toHaveBeenCalled()
})

test('passes only the saved practice and calendar preference to native storage', () => {
  native.enabled = true
  const reading = { hash: '#/torah/parsha/beresheet/1-1-1', parshaName: 'Beresheet' }
  publishNativePractice({ reading })
  publishNativePractice({ israel: true })
  expect(native.update).toHaveBeenNthCalledWith(1, { reading })
  expect(native.update).toHaveBeenNthCalledWith(2, { israel: true })
})
