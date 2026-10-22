import { expect, test } from 'vitest'
import { nextTestBuild, readProjectBuild, withProjectBuild } from './sqim-test-build.ts'

const pbxproj = [
  '\t\t\t\tCODE_SIGN_STYLE = Automatic;',
  '\t\t\t\tCURRENT_PROJECT_VERSION = 8;',
  '\t\t\t\tMARKETING_VERSION = 1.1;',
  '\t\t\t\tCURRENT_PROJECT_VERSION = 8;',
  '',
].join('\n')

test('test builds count up from the highest of the project, published and previous builds', () => {
  expect(nextTestBuild({ project: 8, published: 8, previous: 0 })).toBe(9)
  expect(nextTestBuild({ project: 8, published: 8, previous: 11 })).toBe(12)
  expect(nextTestBuild({ project: 20, published: 8, previous: 11 })).toBe(21)
})

test('the build number is replaced in every configuration and nothing else changes', () => {
  expect(readProjectBuild(pbxproj)).toBe(8)
  const bumped = withProjectBuild(pbxproj, 9)
  expect(readProjectBuild(bumped)).toBe(9)
  expect(bumped.replaceAll('CURRENT_PROJECT_VERSION = 9;', 'CURRENT_PROJECT_VERSION = 8;')).toBe(pbxproj)
  expect(() => readProjectBuild(pbxproj.replace('= 8;', '= 7;'))).toThrow('one CURRENT_PROJECT_VERSION')
  expect(() => readProjectBuild('MARKETING_VERSION = 1.1;')).toThrow('one CURRENT_PROJECT_VERSION')
})
