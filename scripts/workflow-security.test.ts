import { readFile } from 'node:fs/promises'
import { expect, test } from 'vitest'

const previewWorkflowUrl = new URL('../.github/workflows/pr-preview.yml', import.meta.url)
const verificationWorkflowUrl = new URL('../.github/workflows/test.yml', import.meta.url)
const retiredWorkflowUrl = new URL(
  '../.github/workflows/build-deploy-and-preview.yml',
  import.meta.url
)
const packageUrl = new URL('../package.json', import.meta.url)
const packageLockUrl = new URL('../package-lock.json', import.meta.url)
const nodeVersionUrl = new URL('../.nvmrc', import.meta.url)
const vitestConfigUrl = new URL('../vitest.config.ts', import.meta.url)

function expectImmutableActions(workflow: string) {
  const actionReferences = [...workflow.matchAll(/uses:\s+[^\s@]+@([^\s#]+)/g)]
  expect(actionReferences.length).toBeGreaterThan(0)
  for (const [, reference] of actionReferences) {
    expect(reference).toMatch(/^[a-f0-9]{40}$/)
  }
}

test('fork preview builds never receive a privileged repository token', async () => {
  const workflow = await readFile(previewWorkflowUrl, 'utf8')

  expect(workflow).toMatch(/\n {2}pull_request:\n/)
  expect(workflow).not.toContain('pull_request_target')
  expect(workflow).toMatch(/permissions:\n {2}contents: read/)
  expect(workflow).not.toMatch(/(?:contents|pull-requests):\s*write/)
  expect(workflow).toMatch(/persist-credentials: false/)
  expect(workflow).toMatch(/if-no-files-found: error/)
  expectImmutableActions(workflow)
})

test('verification uses one read-only, bounded release command', async () => {
  const workflow = await readFile(verificationWorkflowUrl, 'utf8')

  expect(workflow).toMatch(/permissions:\n {2}contents: read/)
  expect(workflow).toMatch(/persist-credentials: false/)
  expect(workflow).toMatch(/cancel-in-progress: true/)
  expect(workflow).toMatch(/timeout-minutes: 25/)
  expect(workflow).toMatch(/npx playwright install --with-deps chromium webkit/)
  expect(workflow).toMatch(/run: npm run verify:release/)
  expect(workflow).not.toMatch(/(?:contents|pull-requests):\s*write/)
  expectImmutableActions(workflow)
})

test('verification covers the full Chromium suite and a WebKit critical path', async () => {
  const packageJson = JSON.parse(await readFile(packageUrl, 'utf8'))
  const vitestConfig = await readFile(vitestConfigUrl, 'utf8')

  expect(packageJson.scripts['verify:quick']).toContain(
    'npm run generated:check'
  )
  expect(packageJson.scripts.verify).toContain('npm run test:browser')
  expect(packageJson.scripts.verify).toContain('npm run test:browser:webkit')
  expect(packageJson.scripts['verify:release']).toBe(
    'node scripts/verify-release.mjs'
  )
  expect(packageJson.scripts.verify).not.toContain('audit')
  expect(packageJson.scripts.verify).not.toContain('git diff')
  expect(packageJson.scripts['test:browser']).toBe('vitest run --project=browser')
  expect(packageJson.scripts['test:browser:webkit']).toBe('vitest run --project=webkit')
  expect(vitestConfig).toContain("from '@vitest/browser-playwright'")
  expect(vitestConfig).toContain('provider: playwright()')
  expect(vitestConfig).not.toContain('defineWorkspace')
  expect(vitestConfig).toMatch(/name: 'browser'[\s\S]*browser: 'chromium'/)
  expect(vitestConfig).toMatch(/name: 'webkit'[\s\S]*browser: 'webkit'/)
  expect(vitestConfig).toContain('app/app-smoke.vitest.ts')
})

test('local, verification, and preview builds share one exact toolchain', async () => {
  const [packageSource, packageLockSource, nodeVersion, verification, preview] =
    await Promise.all([
      readFile(packageUrl, 'utf8'),
      readFile(packageLockUrl, 'utf8'),
      readFile(nodeVersionUrl, 'utf8'),
      readFile(verificationWorkflowUrl, 'utf8'),
      readFile(previewWorkflowUrl, 'utf8'),
    ])
  const packageJson = JSON.parse(packageSource)
  const packageLock = JSON.parse(packageLockSource)
  const rootPackage = packageLock.packages['']

  expect(nodeVersion.trim()).toBe(packageJson.engines.node)
  expect(rootPackage.engines).toEqual(packageJson.engines)
  expect(rootPackage.devDependencies.playwright).toBe(
    packageJson.devDependencies.playwright
  )
  expect(packageJson.devDependencies.playwright).not.toMatch(/[\^~*xX]/)

  for (const workflow of [verification, preview]) {
    expect(workflow).toContain(`node-version: '${packageJson.engines.node}'`)
    expect(workflow).toContain(
      `npm install --global npm@${packageJson.engines.npm}`
    )
  }
})

test('dormant privileged deployment is retired', async () => {
  await expect(readFile(retiredWorkflowUrl, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
})

test('video shutdown targets registry-owned processes only', async () => {
  const packageJson = JSON.parse(await readFile(packageUrl, 'utf8'))
  const shutdown = packageJson.scripts['video:shut-down']
  const status = packageJson.scripts['video:status']

  expect(shutdown).toBe('node scripts/record-aliyah-videos.mjs shutdown')
  expect(shutdown).not.toContain('pkill')
  expect(status).toBe('node scripts/record-aliyah-videos.mjs status')
  expect(status).not.toContain('pkill')
})
