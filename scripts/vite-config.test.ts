import { expect, test } from 'vitest'

import { defaultViteHost, viteConfig } from '../vite.config'

test('development is reachable on the local network while preview stays on loopback', () => {
  expect(defaultViteHost).toBe('0.0.0.0')
  expect(viteConfig.server?.host).toBe(defaultViteHost)
  expect(viteConfig.preview?.host).toBe('127.0.0.1')
})
