import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { allocateReleaseBuild, withProjectRelease, writeReleaseBuildState } from './release-build.ts'

type Run = (command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) => Promise<number>

const run: Run = (command, args, cwd, env) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' })
    const forward = (signal: NodeJS.Signals) => child.kill(signal)
    process.on('SIGINT', forward)
    process.on('SIGTERM', forward)
    const cleanup = () => { process.off('SIGINT', forward); process.off('SIGTERM', forward) }
    child.once('error', error => { cleanup(); reject(error) })
    child.once('exit', (code, signal) => {
      cleanup()
      resolve(code ?? (signal ? 1 : 0))
    })
  })
}

export async function shareTestBuild(root: string, args: string[], execute: Run = run, fetcher?: typeof fetch) {
  const pbxproj = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj')
  const original = await readFile(pbxproj, 'utf8')
  const state = await allocateReleaseBuild(root, 'test', { fetcher })
  console.log(`Sqim test version ${state.version}, build ${state.build}`)
  // Record attempts with the source so Pages can advance past tests, including
  // failed uploads. No Git operation is performed by this command.
  await writeReleaseBuildState(root, state)
  const environment = { ...process.env, TIKKUN_TEST_BUILD: '1',
    TIKKUN_RELEASE_IDENTITY: JSON.stringify({ version: state.version, build: state.build }) }
  const sync = await execute('npm', ['run', 'native:sync'], root, environment)
  if (sync !== 0) return sync
  if (await readFile(pbxproj, 'utf8') !== original) throw new Error('Native project changed during sync; review it before sharing')
  await writeFile(pbxproj, withProjectRelease(original, state))
  try {
    return await execute('sqim', ['upload', '--device', 'ios/App', '--build', '--project', 'App.xcodeproj',
      '--scheme', 'App', '--allow-provisioning-updates', ...args], root, environment)
  } finally {
    await writeFile(pbxproj, original)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await shareTestBuild(fileURLToPath(new URL('..', import.meta.url)), process.argv.slice(2))
}
