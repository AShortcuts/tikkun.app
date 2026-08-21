import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

export const RELEASE_GENERATED_OUTPUTS = Object.freeze([
  'generated/audio-manifest.ts',
  'generated/public-reading-manifest.ts',
  'generated/torah-index.json',
  'generated/video-manifest.ts',
])

async function readSnapshot(filePath) {
  try {
    return await readFile(filePath)
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT')
      return null
    throw error
  }
}

/**
 * @param {{ root?: string, outputs?: readonly string[] }} [options]
 */
export async function snapshotReleaseGeneratedOutputs({
  root = repoRoot,
  outputs = RELEASE_GENERATED_OUTPUTS,
} = {}) {
  return new Map(
    await Promise.all(
      outputs.map(async (relativePath) => [
        relativePath,
        await readSnapshot(path.join(root, relativePath)),
      ]),
    ),
  )
}

/**
 * @param {Map<string, Buffer | null>} before
 * @param {{ root?: string }} [options]
 */
export async function changedReleaseGeneratedOutputs(
  before,
  { root = repoRoot } = {},
) {
  const changes = await Promise.all(
    [...before].map(async ([relativePath, previousContents]) => {
      const currentContents = await readSnapshot(path.join(root, relativePath))
      const unchanged =
        previousContents === null
          ? currentContents === null
          : currentContents !== null && previousContents.equals(currentContents)
      return unchanged ? null : relativePath
    }),
  )
  return changes.filter((relativePath) => relativePath !== null)
}

/**
 * @param {string} command
 * @param {readonly string[]} args
 * @param {{ cwd: string }} options
 */
export function runReleaseCommand(command, args, { cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      env: process.env,
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      const outcome = signal
        ? `signal ${signal}`
        : `exit code ${code ?? 'unknown'}`
      reject(new Error(`${command} ${args.join(' ')} failed with ${outcome}`))
    })
  })
}

function failureMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * @param {{
 *   root?: string
 *   outputs?: readonly string[]
 *   npmCommand?: string
 *   run?: typeof runReleaseCommand
 * }} [options]
 */
export async function verifyRelease({
  root = repoRoot,
  outputs = RELEASE_GENERATED_OUTPUTS,
  npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm',
  run = runReleaseCommand,
} = {}) {
  const generatedBefore = await snapshotReleaseGeneratedOutputs({
    root,
    outputs,
  })
  let verificationFailure = null

  try {
    await run(npmCommand, ['run', 'verify'], { cwd: root })
  } catch (error) {
    verificationFailure = error
  }

  const generatedChanges = await changedReleaseGeneratedOutputs(
    generatedBefore,
    {
      root,
    },
  )
  if (generatedChanges.length > 0) {
    const verificationContext = verificationFailure
      ? `\nProduct verification also failed: ${failureMessage(verificationFailure)}`
      : ''
    throw new Error(
      `Product verification changed generator-owned outputs:\n- ${generatedChanges.join('\n- ')}\n` +
        'Review and commit those generated diffs, then rerun. ' +
        'Preexisting unrelated working-tree changes are allowed.' +
        verificationContext,
    )
  }

  if (verificationFailure) throw verificationFailure

  await run('git', ['diff', '--check', 'HEAD', '--'], { cwd: root })
  await run(npmCommand, ['audit', '--omit=dev'], { cwd: root })
  console.log(
    `Release verification passed; ${outputs.length} generated outputs remained byte-identical.`,
  )
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await verifyRelease()
}
