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

test('uses provider commit identity when no explicit identifier exists', () => {
  expect(
    resolveBuildIdentifier({
      environment: { GITHUB_SHA: 'abcdef1234567890' },
      readGitRevision: () => 'git-sha',
      readGitDirty: () => false,
    })
  ).toBe('abcdef1234567890')
})

test('marks local Git builds whose source tree is dirty', () => {
  expect(
    resolveBuildIdentifier({
      environment: {},
      readGitRevision: () => 'fea96a8d29dc',
      readGitDirty: () => true,
    })
  ).toBe('fea96a8d29dc.dirty')
})

test('labels source archives honestly when no stable identity exists', () => {
  expect(
    resolveBuildIdentifier({
      environment: {},
      readGitRevision: () => null,
      readGitDirty: () => null,
    })
  ).toBe('unknown-source')
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
