import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readNativeTarget } from './native-update-target.ts'
import { updateConfig } from './update-config.mjs'

// Every target and configuration in project.pbxproj carries the same build number.
const BUILD_SETTING = /^(\s*CURRENT_PROJECT_VERSION = )(\d+)(;)$/gm

export function readProjectBuild(pbxproj: string): number {
  const values = new Set([...pbxproj.matchAll(BUILD_SETTING)].map(match => Number(match[2])))
  if (values.size !== 1) throw new Error('Expected one CURRENT_PROJECT_VERSION value in project.pbxproj')
  return [...values][0]
}

export function withProjectBuild(pbxproj: string, build: number): string {
  readProjectBuild(pbxproj)
  return pbxproj.replace(BUILD_SETTING, `$1${build}$3`)
}

/**
 * Releases change the version; Sqim test builds only count up. A test build
 * stays above the released build, the published web update target and every
 * earlier test build, so the phone never sees the released bundle as an update.
 */
export function nextTestBuild(builds: { project: number; published: number; previous: number }): number {
  return Math.max(builds.project, builds.published, builds.previous) + 1
}

async function publishedWebTarget(root: string) {
  const updates = updateConfig()
  if (!updates.enabled) return 0
  try {
    return Number((await readNativeTarget(path.join(root, 'config/native-update-target.json'), updates.publicKey)).nativeBuild)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
    throw error
  }
}

function run(command: string, args: string[], cwd: string) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' })
    const forward = (signal: NodeJS.Signals) => child.kill(signal)
    process.on('SIGINT', forward)
    process.on('SIGTERM', forward)
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      process.off('SIGINT', forward)
      process.off('SIGTERM', forward)
      resolve(code ?? (signal ? 1 : 0))
    })
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const pbxproj = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj')
  const counter = path.join(root, '.sqim/test-build')
  const original = await readFile(pbxproj, 'utf8')
  const previous = Number(await readFile(counter, 'utf8').catch(() => '0'))
  if (!Number.isInteger(previous) || previous < 0) throw new Error(`Invalid test build counter in ${counter}`)
  const builds = { project: readProjectBuild(original), published: await publishedWebTarget(root), previous }
  const build = nextTestBuild(builds)
  console.log(`Sqim test build ${build} (project build ${builds.project}, published web update target ${builds.published || 'none'})`)
  await mkdir(path.dirname(counter), { recursive: true })
  await writeFile(counter, `${build}\n`)
  // The bumped number lives only in the archive; the project file is restored
  // afterwards so the committed build number keeps matching the published target.
  await writeFile(pbxproj, withProjectBuild(original, build))
  try {
    process.exitCode = await run('sqim', ['upload', '--device', 'ios/App', '--build', '--project', 'App.xcodeproj',
      '--scheme', 'App', '--allow-provisioning-updates', ...process.argv.slice(2)], root)
  } finally {
    await writeFile(pbxproj, original)
  }
}
