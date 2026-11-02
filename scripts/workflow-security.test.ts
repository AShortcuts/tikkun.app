import { readFile } from 'node:fs/promises'
import { expect, test } from 'vitest'

const previewWorkflowUrl = new URL('../.github/workflows/pr-preview.yml', import.meta.url)
const retiredWorkflowUrl = new URL(
  '../.github/workflows/build-deploy-and-preview.yml',
  import.meta.url
)

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

test('dormant privileged deployment is retired', async () => {
  await expect(readFile(retiredWorkflowUrl, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
})
