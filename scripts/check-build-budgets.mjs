import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const distRoot = path.resolve('dist')
export const MAX_STATIC_ASSET_BYTES = 24 * 1024 * 1024

export const BUILD_BUDGETS = [
  {
    label: 'JavaScript chunk',
    matches: (filePath) => filePath.endsWith('.js') && filePath !== 'service-worker.js',
    rawBytes: 460_000,
    gzipBytes: 145_000,
  },
  {
    label: 'CSS asset',
    matches: (filePath) => filePath.endsWith('.css'),
    rawBytes: 170_000,
    gzipBytes: 30_000,
  },
  {
    label: 'Service worker',
    matches: (filePath) => filePath === 'service-worker.js',
    rawBytes: 72_000,
    gzipBytes: 14_000,
  },
]

async function listFiles(root, prefix = '') {
  const entries = await readdir(root, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = path.posix.join(prefix, entry.name)
      const absolutePath = path.join(root, entry.name)
      return entry.isDirectory()
        ? listFiles(absolutePath, relativePath)
        : [relativePath]
    })
  )
  return files.flat()
}

export async function checkBuildBudgets(root = distRoot) {
  const files = await listFiles(root)
  const failures = []

  let largestArtifact = null
  for (const relativePath of files) {
    const { size } = await stat(path.join(root, relativePath))
    if (!largestArtifact || size > largestArtifact.rawBytes) {
      largestArtifact = { relativePath, rawBytes: size }
    }
    if (size > MAX_STATIC_ASSET_BYTES) {
      failures.push(
        `Static artifact ${relativePath} is ${size} bytes; ` +
          `Cloudflare safety budget is ${MAX_STATIC_ASSET_BYTES}`
      )
    }
  }
  if (largestArtifact) {
    console.log(
      `Largest static artifact: ${largestArtifact.relativePath} ` +
        `(${largestArtifact.rawBytes} bytes raw)`
    )
  }

  for (const budget of BUILD_BUDGETS) {
    const candidates = files.filter(budget.matches)
    if (!candidates.length) {
      failures.push(`${budget.label}: no matching build output`)
      continue
    }

    let largest = null
    for (const relativePath of candidates) {
      const contents = await readFile(path.join(root, relativePath))
      const measurement = {
        relativePath,
        rawBytes: contents.byteLength,
        gzipBytes: gzipSync(contents, { level: 9 }).byteLength,
      }
      if (!largest || measurement.rawBytes > largest.rawBytes) {
        largest = measurement
      }
      if (measurement.rawBytes > budget.rawBytes) {
        failures.push(
          `${budget.label} ${relativePath} is ${measurement.rawBytes} bytes; budget is ${budget.rawBytes}`
        )
      }
      if (measurement.gzipBytes > budget.gzipBytes) {
        failures.push(
          `${budget.label} ${relativePath} is ${measurement.gzipBytes} bytes gzip; budget is ${budget.gzipBytes}`
        )
      }
    }

    console.log(
      `${budget.label}: ${largest.relativePath} ` +
        `(${largest.rawBytes} bytes raw, ${largest.gzipBytes} bytes gzip)`
    )
  }

  if (failures.length) {
    throw new Error(`Build budgets exceeded:\n- ${failures.join('\n- ')}`)
  }

  return { files, largestArtifact }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await checkBuildBudgets()
}
