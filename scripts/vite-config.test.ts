import { expect, test } from 'vitest'

import { defaultViteHost, viteConfig } from '../vite.config'

test('development servers bind to loopback by default', () => {
  expect(defaultViteHost).toBe('127.0.0.1')
  expect(viteConfig.server?.host).toBe(defaultViteHost)
  expect(viteConfig.preview?.host).toBe(defaultViteHost)
})
