import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultRepoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const rootInputs = new Set([
  'index.html',
  'package.json',
  'package-lock.json',
  'scripts/record-aliyah-videos.mjs',
  'scripts/video-provenance.mjs',
  'tsconfig.json',
  'vite.config.ts',
])
const inputDirectories = ['css', 'src', 'static']

export function isAppBuildInput(relativePath) {
  const normalized = relativePath.split(path.sep).join('/').replace(/^\.\//, '')
  if (!normalized || normalized.startsWith('../') || path.isAbsolute(normalized)) {
    return false
  }
  if (rootInputs.has(normalized)) return true
  if (!inputDirectories.some((directory) => normalized.startsWith(`${directory}/`))) {
    return false
  }
  if (
    normalized.includes('/__snapshots__/') ||
    /\.(?:test|vitest)\.[^/]+$/.test(normalized) ||
    /\.(?:md|snap)$/.test(normalized)
  ) {
    return false
  }
  if (normalized === 'src/data/video-manifest.generated.ts') return false
  if (
    normalized.startsWith('src/data/audio-cues/') &&
    normalized !== 'src/data/audio-cues/index.ts'
  ) {
    return false
  }
  if (normalized.startsWith('static/audio/')) return false
  return true
}

function listGitFiles(root) {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      [
        '-C',
        root,
        'ls-files',
        '-z',
        '--cached',
        '--others',
        '--exclude-standard',
        '--',
        ...rootInputs,
        ...inputDirectories,
      ],
      { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`git ls-files failed: ${stderr || error.message}`))
          return
        }
        resolve(
          stdout
            .toString('utf8')
            .split('\0')
            .filter(Boolean)
        )
      }
    )
  })
}

async function walkFiles(root, relativeDirectory) {
  const directory = path.join(root, relativeDirectory)
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return []
    throw error
  }

  const nested = await Promise.all(
    entries.map((entry) => {
      const relativePath = path.join(relativeDirectory, entry.name)
      return entry.isDirectory() ? walkFiles(root, relativePath) : [relativePath]
    })
  )
  return nested.flat()
}

async function listFallbackFiles(root) {
  const nested = await Promise.all(
    inputDirectories.map((directory) => walkFiles(root, directory))
  )
  return [...rootInputs, ...nested.flat()]
}

async function listAppBuildInputs(root) {
  let files
  try {
    files = await listGitFiles(root)
  } catch {
    files = await listFallbackFiles(root)
  }
  return [...new Set(files)]
    .filter(isAppBuildInput)
    .sort((left, right) => left.localeCompare(right))
}

export async function currentAppBuildHash(root = defaultRepoRoot) {
  const hash = createHash('sha256')
  let inputCount = 0

  for (const relativePath of await listAppBuildInputs(root)) {
    const filePath = path.join(root, relativePath)
    let fileStats
    try {
      fileStats = await lstat(filePath)
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') continue
      throw error
    }
    if (!fileStats.isFile() && !fileStats.isSymbolicLink()) continue

    hash.update(relativePath.split(path.sep).join('/'))
    hash.update('\0')
    hash.update(fileStats.isSymbolicLink() ? 'symlink' : 'file')
    hash.update(`:${fileStats.mode & 0o111}`)
    hash.update('\0')
    hash.update(await readFile(filePath))
    hash.update('\0')
    inputCount += 1
  }

  if (!inputCount) throw new Error(`No application build inputs found in ${root}`)
  return hash.digest('hex')
}
