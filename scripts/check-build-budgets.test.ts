import { readFile } from 'node:fs/promises'
import { expect, test } from 'vitest'

const packageJsonUrl = new URL('../package.json', import.meta.url)
const budgetScriptUrl = new URL('./check-build-budgets.mjs', import.meta.url)

test('production builds enforce bounded code and host-compatible static assets', async () => {
  const [packageJson, budgetScript] = await Promise.all([
    readFile(packageJsonUrl, 'utf8').then(JSON.parse),
    readFile(budgetScriptUrl, 'utf8'),
  ])

  expect(packageJson.scripts.build).toContain('node scripts/check-build-budgets.mjs')
  expect(budgetScript).toContain("label: 'JavaScript chunk'")
  expect(budgetScript).toContain("label: 'CSS asset'")
  expect(budgetScript).toContain("label: 'Service worker'")
  expect(budgetScript).toContain('MAX_STATIC_ASSET_BYTES = 24 * 1024 * 1024')
  expect(budgetScript).toContain('Cloudflare safety budget')
})
