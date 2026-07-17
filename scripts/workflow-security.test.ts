import { readFile } from 'node:fs/promises'
import { expect, test } from 'vitest'

const workflowUrl = new URL('../.github/workflows/pr-preview.yml', import.meta.url)

test('fork preview builds never receive a privileged repository token', async () => {
  const workflow = await readFile(workflowUrl, 'utf8')

  expect(workflow).toMatch(/\n {2}pull_request:\n/)
  expect(workflow).not.toContain('pull_request_target')
  expect(workflow).toMatch(/permissions:\n {2}contents: read/)
  expect(workflow).not.toMatch(/(?:contents|pull-requests):\s*write/)
  expect(workflow).toMatch(/persist-credentials: false/)
  expect(workflow).toMatch(/actions\/upload-artifact@v4/)
})
