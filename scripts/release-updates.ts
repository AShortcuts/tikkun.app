import { spawn } from 'node:child_process'
import { createHash, verify } from 'node:crypto'
import { lstat, readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { verifyWebRelease } from '../app/updates/web-update.ts'

const rootDirectory = fileURLToPath(new URL('..', import.meta.url))
const branch = 'develop'

export const releaseHelp = `Usage: npm run updates:release -- --native-build NUMBER [options]

  --target-archive PATH       Default: .asc/artifacts/Tikkun-1.0-NUMBER.xcarchive
  --rollout PERCENT           Eligible devices, 0-100 (default: 100)
  --dry-run                  Read-only preflight and command preview; no builds or signing
  --help                     Show this help

Requires macOS, the pinned Node/npm, a clean develop checkout, and the existing
update signing key (TIKKUN_UPDATE_PRIVATE_KEY_FILE overrides its ignored local path).
Checks/builds can take 10-20 minutes and several GB of temporary output.
Prepares and verifies the signed app update (code and content) under .asc/updates/.
Copies the verified feed into site/updates; reruns replace its latest manifest.
Never stages Git files, commits, pushes, or publishes.
Review and publication remain manual. Native compatibility checks remain mandatory.`

export function parseReleaseOptions(args: string[], root = rootDirectory) {
  const { values } = parseArgs({ args, options: {
    'native-build': { type: 'string' }, 'target-archive': { type: 'string' },
    rollout: { type: 'string', default: '100' },
    'dry-run': { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
  } })
  if (values.help) return null
  const nativeBuild = values['native-build']
  if (!nativeBuild || !/^\d+$/.test(nativeBuild)) throw new Error('Provide --native-build NUMBER.')
  if (!/^\d+$/.test(values.rollout!) || Number(values.rollout) > 100) throw new Error('Rollout must be an integer from 0 to 100.')
  return { nativeBuild, rollout: Number(values.rollout), dryRun: values['dry-run'],
    archive: path.resolve(root, values['target-archive'] ?? `.asc/artifacts/Tikkun-1.0-${nativeBuild}.xcarchive`) }
}

type ReleaseOptions = NonNullable<ReturnType<typeof parseReleaseOptions>>
export type ReleaseCommand = (command: string, args: string[], capture?: boolean) => Promise<string>
interface Services {
  root: string
  run: ReleaseCommand
  log: (message: string) => void
  platform: string
  nodeVersion: string
  keyFile: string
}

async function preparedRelease(options: ReleaseOptions, root: string) {
  const key = await readFile(path.join(root, 'config/update-public-key.pem'), 'utf8')
  const webRoot = `.asc/updates/web/${options.nativeBuild}`
  const web = await verifyWebRelease(JSON.parse(await readFile(path.join(root, webRoot, 'latest.json'), 'utf8')), key)
  if (web.nativeBuild !== options.nativeBuild || web.rollout !== options.rollout) throw new Error('Prepared web release does not match the requested build/rollout.')
  const zip = await readFile(path.join(root, webRoot, `${web.bundleId}.zip`))
  if (zip.length !== web.bytes || createHash('sha256').update(zip).digest('hex') !== web.checksum ||
      !verify('sha256', zip, key, Buffer.from(web.signature, 'base64'))) throw new Error('Prepared web ZIP failed signature/digest verification.')
  return { bundleId: web.bundleId, rollout: web.rollout,
    paths: [`${webRoot}/latest.json`, `${webRoot}/${web.bundleId}.zip`].sort() }
}

export async function releaseUpdates(options: ReleaseOptions, services: Services) {
  const { root, run, log } = services
  const git = async (...args: string[]) => (await run('git', args, true)).trimEnd()
  const head = () => git('rev-parse', 'HEAD')
  if (services.platform !== 'darwin') throw new Error('Native archive validation requires macOS.')
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  if (services.nodeVersion !== pkg.engines.node || (await run('npm', ['--version'], true)).trim() !== pkg.engines.npm) {
    throw new Error(`Use Node ${pkg.engines.node} and npm ${pkg.engines.npm}; no toolchain is installed automatically.`)
  }
  if (await git('branch', '--show-current') !== branch) throw new Error('Run from develop. No branch is switched automatically.')
  const changes = (await git('status', '--porcelain=v1', '-z', '--untracked-files=all')).split('\0').filter(Boolean)
  const generatedFeed = /^site\/updates\/(?:web\/\d+\/(?:latest\.json|[a-f0-9]{64}\.zip)|content\/[a-f0-9]{64}\/(?:latest\.json|[a-f0-9]{64}\.json))$/
  if (changes.some(entry => !['??', ' M'].includes(entry.slice(0, 2)) || !generatedFeed.test(entry.slice(3)))) {
    throw new Error('Working tree/index is not clean. Only unstaged generated update feeds may remain between runs. Review and commit intended source changes first; nothing is stashed, staged, or discarded automatically.')
  }
  const sourceSha = await head()
  const keyInfo = await stat(services.keyFile)
  if (!keyInfo.isFile() || (keyInfo.mode & 0o077)) throw new Error('Update private key must be an owner-only file (chmod 600).')
  for (const keyPath of [services.keyFile, await realpath(services.keyFile)]) {
    const relative = path.relative(await realpath(root), keyPath)
    if (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) && await git('ls-files', '--', relative)) {
      throw new Error('The private signing key must not be tracked in Git.')
    }
  }
  const target = path.join(options.archive, 'Products/Applications/App.app')
  const archiveBuild = (await run('/usr/bin/plutil', ['-extract', 'CFBundleVersion', 'raw', '-o', '-', path.join(target, 'Info.plist')], true)).trim()
  if (archiveBuild !== options.nativeBuild) throw new Error('Target archive does not match the requested native build.')
  await stat(path.join(target, 'public/native-update-contract.json'))
  const commands = [
    ['run', 'verify:release'], ['run', 'build:native'],
    ['run', 'updates:web', '--', '--native-build', options.nativeBuild, '--target-archive', options.archive, '--rollout', String(options.rollout), '--approve-web-only'],
    ['run', 'updates:stage', '--', '--native-build', options.nativeBuild],
    ['run', 'build'],
  ]
  log(`Source ${sourceSha}; build ${options.nativeBuild}; rollout ${options.rollout}%; local preparation only.`)
  if (options.dryRun) {
    for (const args of commands) log(`npm ${args.map(arg => JSON.stringify(arg)).join(' ')}`)
    log('Then verify and list local artifacts. No Git staging, commit, push, or publication. Dry run made no changes.')
    return { status: 'dry-run' }
  }
  for (const args of commands) { log(`Running npm ${args[1]}...`); await run('npm', args) }
  const release = await preparedRelease(options, root)
  if (await head() !== sourceSha || await git('branch', '--show-current') !== branch) {
    throw new Error('Branch/HEAD changed during preparation. Review local artifacts before using them.')
  }
  log('Prepared and verified local update files:')
  for (const file of release.paths) {
    const info = await lstat(path.join(root, file))
    if (!info.isFile() || await realpath(path.join(root, file)) !== path.join(await realpath(root), file)) throw new Error(`Release asset is not a regular file without symlinks: ${file}`)
    log(`  ${file} (${info.size} bytes)`)
  }
  log(`Prepared native build ${options.nativeBuild} at ${release.rollout}% rollout. Nothing Git-staged, committed, pushed, or published.`)
  log('Verified feeds copied into site/updates/. Latest manifests replaced; older immutable bundles retained.')
  log('Review, Git staging, committing, and publishing are manual steps owned by you.')
  log(`After your deployment: npm run updates:verify -- --native-build ${options.nativeBuild}`)
  return { status: 'prepared', ...release }
}

export function releaseCommand(root: string, keyFile: string, signal?: AbortSignal): ReleaseCommand {
  return (command, args, capture = false) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, signal,
      env: { ...process.env, TIKKUN_UPDATE_PRIVATE_KEY_FILE: keyFile },
      stdio: ['inherit', capture ? 'pipe' : 'inherit', 'inherit'], timeout: capture && command !== 'npm' ? 60_000 : 30 * 60_000 })
    let output = ''
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', chunk => { output += chunk })
    child.once('error', reject)
    child.once('close', (code, stopped) => code === 0 ? resolve(output) : reject(new Error(`${command} failed (${stopped ?? code}).`)))
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cancellation = new AbortController()
  const cancel = () => cancellation.abort()
  process.once('SIGINT', cancel)
  process.once('SIGTERM', cancel)
  try {
    const options = parseReleaseOptions(process.argv.slice(2))
    if (!options) console.log(releaseHelp)
    else {
      const keyFile = path.resolve(process.env.TIKKUN_UPDATE_PRIVATE_KEY_FILE ?? path.join(rootDirectory, '.asc/update-signing/private.pem'))
      await releaseUpdates(options, { root: rootDirectory, keyFile, run: releaseCommand(rootDirectory, keyFile, cancellation.signal),
        platform: process.platform, nodeVersion: process.versions.node, log: console.log,
      })
    }
  } catch (error) {
    console.error(`Update release stopped: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  } finally {
    process.removeListener('SIGINT', cancel)
    process.removeListener('SIGTERM', cancel)
  }
}
