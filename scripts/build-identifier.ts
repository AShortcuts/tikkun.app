import { execFileSync } from 'node:child_process'
import process from 'node:process'

const BUILD_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/

export interface BuildIdentifierSources {
  environment?: NodeJS.ProcessEnv
  readGitRevision?: () => string | null
  readGitDirty?: () => boolean | null
}

function readGitRevision() {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

function readGitDirty() {
  try {
    return Boolean(
      execFileSync(
        'git',
        ['status', '--porcelain', '--untracked-files=normal'],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }
      ).trim()
    )
  } catch {
    return null
  }
}

function validateBuildIdentifier(value: string, source: string) {
  const identifier = value.trim()
  if (!BUILD_IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(
      `${source} must be 1-80 characters using letters, numbers, dot, underscore, plus, or hyphen`
    )
  }
  return identifier
}

export function resolveBuildIdentifier({
  environment = process.env,
  readGitRevision: resolveGitRevision = readGitRevision,
  readGitDirty: resolveGitDirty = readGitDirty,
}: BuildIdentifierSources = {}) {
  const configuredSources = [
    'TIKKUN_BUILD_ID',
    'CF_PAGES_COMMIT_SHA',
    'GITHUB_SHA',
  ] as const

  for (const source of configuredSources) {
    const configured = environment[source]
    if (configured) return validateBuildIdentifier(configured, source)
  }

  const gitRevision = resolveGitRevision()
  if (!gitRevision) return 'unknown-source'

  const identifier = validateBuildIdentifier(gitRevision, 'Git revision')
  return resolveGitDirty() ? `${identifier}.dirty` : identifier
}
