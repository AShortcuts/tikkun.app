import { expect, test } from 'vitest'
import { resolveBuildIdentifier } from './build-identifier.ts'

test('prefers an explicit release identifier over provider and Git values', () => {
  expect(
    resolveBuildIdentifier({
      environment: {
        TIKKUN_BUILD_ID: 'release-2026.08.19',
        CF_PAGES_COMMIT_SHA: 'cloudflare-sha',
      },
      readGitRevision: () => 'git-sha',
      readGitDirty: () => false,
    })
  ).toBe('release-2026.08.19')
})

test('rejects unsafe configured identifiers instead of embedding them', () => {
  expect(() =>
    resolveBuildIdentifier({
      environment: { TIKKUN_BUILD_ID: 'release/with spaces' },
      readGitRevision: () => null,
      readGitDirty: () => null,
    })
  ).toThrow(/TIKKUN_BUILD_ID must be 1-80 characters/)
})
