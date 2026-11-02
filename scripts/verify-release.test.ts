import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'

import { RELEASE_GENERATED_OUTPUTS, verifyRelease } from './verify-release.mjs'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  )
})

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'tikkun-release-verify-'))
  roots.push(root)
  await Promise.all(
    RELEASE_GENERATED_OUTPUTS.map(async (relativePath) => {
      const filePath = path.join(root, relativePath)
      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, `baseline:${relativePath}\n`)
    }),
  )
  return root
}

test('runs deterministic verification before whitespace and live production audit gates', async () => {
  const root = await createFixture()
  const calls: Array<{
    command: string
    args: readonly string[]
    cwd: string
  }> = []

  await verifyRelease({
    root,
    npmCommand: 'npm-for-test',
    run: async (command, args, { cwd }) => {
      calls.push({ command, args, cwd })
    },
  })

  expect(calls).toEqual([
    { command: 'npm-for-test', args: ['run', 'verify'], cwd: root },
    { command: 'git', args: ['diff', '--check', 'HEAD', '--'], cwd: root },
    { command: 'npm-for-test', args: ['audit', '--omit=dev'], cwd: root },
  ])
})

test('rejects generated drift caused by verification before later release gates', async () => {
  const root = await createFixture()
  const calls: string[] = []
  const changedOutput = RELEASE_GENERATED_OUTPUTS[1]

  await expect(
    verifyRelease({
      root,
      run: async (command, args) => {
        calls.push(`${command} ${args.join(' ')}`)
        if (args[0] === 'run') {
          await writeFile(
            path.join(root, changedOutput),
            'regenerated output\n',
          )
        }
      },
    }),
  ).rejects.toThrow(
    `Product verification changed generator-owned outputs:\n- ${changedOutput}`,
  )
  expect(calls).toEqual(['npm run verify'])
})
