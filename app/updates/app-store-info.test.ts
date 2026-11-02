import { expect, test, vi } from 'vitest'
import { appStorePromptCopy, appStorePromptDue, appStoreStatus, parseAppStoreInfo, postponeAppStorePrompt } from './app-store-info.ts'

test('the App Store file decides the prompt, and Later brings it back daily when required and weekly otherwise', () => {
  expect(() => parseAppStoreInfo({ latest: '1.1', minimum: '1.2' })).toThrow('minimum')
  const info = parseAppStoreInfo({ latest: '1.2', minimum: '1.1', message: '  ' })
  expect(info).toEqual({ latest: '1.2', minimum: '1.1' })
  expect(appStoreStatus('1.0', info)).toBe('required')
  expect(appStoreStatus('1.1', info)).toBe('available')
  // A phone newer than the file, before it is edited, is up to date.
  expect(appStoreStatus('1.3', info)).toBe('latest')
  expect(appStorePromptCopy('available', info)).toEqual({ title: 'New Update Available', message: 'Tikkun v1.2 is available in the App Store.' })

  const saved = new Map<string, string>()
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => void saved.set(key, value) }
  const day = 24 * 60 * 60_000
  const available = { installed: '1.1', status: 'available' as const, info }
  const required = { ...available, installed: '1.0', status: 'required' as const }
  expect(appStorePromptDue(available, storage, 0)).toBe(true)
  postponeAppStorePrompt(available, storage, 0)
  expect(appStorePromptDue(available, storage, 6 * day)).toBe(false)
  expect(appStorePromptDue(available, storage, 7 * day)).toBe(true)
  // A different prompt, here a raised minimum, is not held back by the earlier Later.
  expect(appStorePromptDue(required, storage, day)).toBe(true)
  postponeAppStorePrompt(required, storage, day)
  expect(appStorePromptDue(required, storage, 2 * day - 1)).toBe(false)
  expect(appStorePromptDue(required, storage, 2 * day)).toBe(true)
  expect(appStorePromptDue({ ...available, status: 'latest' }, storage, 0)).toBe(false)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  saved.set('tikkun.app-store-prompt', '{broken')
  expect(appStorePromptDue(available, storage, 0)).toBe(true)
})
