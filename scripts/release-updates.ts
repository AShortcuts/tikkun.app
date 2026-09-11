import { spawn } from 'node:child_process'
import { createHash, verify } from 'node:crypto'
import { lstat, readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { object } from '../app/updates/content-schema.ts'
import { verifyReleaseEnvelope } from '../app/updates/release-signature.ts'
import { verifyWebRelease } from '../app/updates/web-update.ts'

const rootDirectory = fileURLToPath(new URL('..', import.meta.url))
const branch = 'develop'
const deploymentApp = 85455 // Cloudflare Workers and Pages GitHub App.
const digestPattern = /^[a-f0-9]{64}$/

export const releaseHelp = `Usage: npm run updates:release -- --native-build NUMBER [options]

  --target-archive PATH       Default: .asc/artifacts/Tikkun-1.0-NUMBER.xcarchive
  --rollout PERCENT           Eligible devices, 0-100 (default: 100)
  --deployment-timeout MIN    GitHub deployment wait, 1-120 (default: 20)
  --dry-run                  Read-only preflight and command preview; no builds or publish
  --help                     Show this help

Requires macOS, the pinned Node/npm, gh authentication, a clean develop checkout,
and the existing update signing key (TIKKUN_UPDATE_PRIVATE_KEY_FILE overrides its
ignored local path). Source commits may be ahead of origin/develop, not behind it.
Checks/builds can take 10-20 minutes and several GB of temporary output.
Publishing requires interactive confirmation of the web-only release and rollout.
No Wrangler deployment, App Store upload, or native compatibility override runs.`

export function parseReleaseOptions(args: string[], root = rootDirectory) {
  const { values } = parseArgs({ args, options: {
    'native-build': { type: 'string' }, 'target-archive': { type: 'string' },
    rollout: { type: 'string', default: '100' },
    'deployment-timeout': { type: 'string', default: '20' },
    'dry-run': { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
  } })
  if (values.help) return null
  const nativeBuild = values['native-build']
  if (!nativeBuild || !/^\d+$/.test(nativeBuild)) throw new Error('Provide --native-build NUMBER.')
  if (!/^\d+$/.test(values.rollout!) || Number(values.rollout) > 100) throw new Error('Rollout must be an integer from 0 to 100.')
  const minutes = Number(values['deployment-timeout'])
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) throw new Error('Deployment timeout must be 1-120 minutes.')
  return { nativeBuild, rollout: Number(values.rollout), dryRun: values['dry-run'], timeoutMs: minutes * 60_000,
    archive: path.resolve(root, values['target-archive'] ?? `.asc/artifacts/Tikkun-1.0-${nativeBuild}.xcarchive`) }
}

type ReleaseOptions = NonNullable<ReturnType<typeof parseReleaseOptions>>
export type ReleaseCommand = (command: string, args: string[], capture?: boolean) => Promise<string>
interface Services {
  root: string
  run: ReleaseCommand
  confirm: (message: string) => Promise<boolean>
  log: (message: string) => void
  sleep: (milliseconds: number) => Promise<void>
  now: () => number
  platform: string
  nodeVersion: string
  keyFile: string
}

export function githubRepository(remote: string) {
  const match = /^(?:git\+)?https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(remote)
    ?? /^git@github\.com:([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remote)
  if (!match) throw new Error('origin must be a GitHub HTTPS/SSH remote without embedded credentials.')
  return match[1]
}

export function deploymentState(value: unknown, sha: string) {
  if (!object(value) || !Array.isArray(value.check_runs)) throw new Error('Invalid GitHub check response.')
  const checks = value.check_runs.filter(object).filter(check => check.head_sha === sha &&
    check.name === 'Cloudflare Pages' && object(check.app) && check.app.id === deploymentApp)
  checks.sort((left, right) => Number(right.id) - Number(left.id))
  const check = checks[0]
  if (!check || check.status !== 'completed') return 'waiting'
  if (check.conclusion !== 'success') throw new Error(`Cloudflare Pages deployment ended with ${String(check.conclusion)}.`)
  return 'success'
}

export async function waitForUpdateDeployment(repository: string, sha: string, timeoutMs: number, services: Pick<Services, 'run' | 'now' | 'sleep' | 'log'>) {
  const deadline = services.now() + timeoutMs
  services.log(`Waiting for the GitHub-triggered Cloudflare Pages deployment of ${sha}...`)
  while (services.now() < deadline) {
    const response = await services.run('gh', ['api', '--hostname', 'github.com',
      `repos/${repository}/commits/${sha}/check-runs?check_name=Cloudflare%20Pages&app_id=${deploymentApp}&filter=latest&per_page=100`], true)
    if (deploymentState(JSON.parse(response), sha) === 'success') return
    await services.sleep(Math.min(30_000, Math.max(0, deadline - services.now())))
  }
  throw new Error('Timed out waiting for deployment. The pushed commit is retained; do not create another release just to retry verification.')
}

function lines(value: string) { return value.split('\0').filter(Boolean).sort() }

async function preparedRelease(options: ReleaseOptions, root: string) {
  const key = await readFile(path.join(root, 'config/update-public-key.pem'), 'utf8')
  const contract = JSON.parse(await readFile(path.join(root, 'generated/native-content-contract.json'), 'utf8'))
  if (!object(contract) || typeof contract.compatibility !== 'string' || !digestPattern.test(contract.compatibility)) throw new Error('Invalid content compatibility contract.')
  const webRoot = `site/updates/web/${options.nativeBuild}`
  const contentRoot = `site/updates/content/${contract.compatibility}`
  const web = await verifyWebRelease(JSON.parse(await readFile(path.join(root, webRoot, 'latest.json'), 'utf8')), key)
  const content = await verifyReleaseEnvelope(JSON.parse(await readFile(path.join(root, contentRoot, 'latest.json'), 'utf8')), key)
  if (web.nativeBuild !== options.nativeBuild || web.rollout !== options.rollout) throw new Error('Prepared web release does not match the requested build/rollout.')
  if (!object(content) || content.schema !== 1 || typeof content.digest !== 'string' || !digestPattern.test(content.digest) ||
      typeof content.bytes !== 'number' || !Number.isSafeInteger(content.bytes) || content.bytes <= 0) throw new Error('Invalid prepared content release.')
  const zip = await readFile(path.join(root, webRoot, `${web.bundleId}.zip`))
  if (zip.length !== web.bytes || createHash('sha256').update(zip).digest('hex') !== web.checksum ||
      !verify('sha256', zip, key, Buffer.from(web.signature, 'base64'))) throw new Error('Prepared web ZIP failed signature/digest verification.')
  const snapshot = await readFile(path.join(root, contentRoot, `${content.digest}.json`))
  if (snapshot.length !== content.bytes || createHash('sha256').update(snapshot).digest('hex') !== content.digest) throw new Error('Prepared content failed digest verification.')
  return { bundleId: web.bundleId, contentDigest: content.digest, rollout: web.rollout,
    paths: [`${webRoot}/latest.json`, `${webRoot}/${web.bundleId}.zip`, `${contentRoot}/latest.json`, `${contentRoot}/${content.digest}.json`].sort() }
}

export function assertPublishedRelease(value: unknown, expected: { bundleId: string; contentDigest: string; rollout: number }, build: string) {
  if (!object(value) || value.verified !== true || value.origin !== 'https://tikkunreader.com' || value.nativeBuild !== build ||
      value.bundleId !== expected.bundleId || value.contentDigest !== expected.contentDigest || value.rollout !== expected.rollout) {
    throw new Error('Live feed does not match this release. An older or different signed update is not publication success.')
  }
}

export async function releaseUpdates(options: ReleaseOptions, services: Services) {
  const { root, run, log } = services
  const git = async (...args: string[]) => (await run('git', args, true)).trimEnd()
  const head = () => git('rev-parse', 'HEAD')
  const remoteHead = async () => {
    const value = await git('ls-remote', '--exit-code', 'origin', `refs/heads/${branch}`)
    const match = /^([a-f0-9]{40})\trefs\/heads\/develop$/.exec(value)
    if (!match) throw new Error('Could not resolve origin/develop.')
    return match[1]
  }
  if (services.platform !== 'darwin') throw new Error('Native archive validation requires macOS.')
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  if (services.nodeVersion !== pkg.engines.node || (await run('npm', ['--version'], true)).trim() !== pkg.engines.npm) {
    throw new Error(`Use Node ${pkg.engines.node} and npm ${pkg.engines.npm}; no toolchain is installed automatically.`)
  }
  if (await git('branch', '--show-current') !== branch) throw new Error('Run from develop. No branch is switched automatically.')
  if (await git('status', '--porcelain=v1', '-z', '--untracked-files=all')) throw new Error('Working tree/index is not clean. Review and commit intended source changes first; nothing is stashed, staged, or discarded automatically.')
  const sourceSha = await head()
  const repository = githubRepository(await git('remote', 'get-url', 'origin'))
  if (repository !== githubRepository(pkg.repository.url)) throw new Error('origin does not match the project repository.')
  const guardRemote = async () => {
    const fetchRepository = githubRepository(await git('remote', 'get-url', 'origin'))
    const pushUrls = (await git('remote', 'get-url', '--push', '--all', 'origin')).split('\n')
    if (fetchRepository !== repository || pushUrls.length !== 1 || githubRepository(pushUrls[0]) !== repository) {
      throw new Error('origin must fetch and push only to the project GitHub repository.')
    }
  }
  await guardRemote()
  const beforeRemote = await remoteHead()
  await git('merge-base', '--is-ancestor', beforeRemote, sourceSha)
  await run('gh', ['api', '--hostname', 'github.com', `repos/${repository}`, '--jq', '.full_name'], true)
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
    ['run', 'verify:release'], ['run', 'build:native'], ['run', 'updates:content'],
    ['run', 'updates:web', '--', '--native-build', options.nativeBuild, '--target-archive', options.archive, '--rollout', String(options.rollout), '--approve-web-only'],
    ['run', 'updates:stage', '--', '--native-build', options.nativeBuild], ['run', 'build'],
  ]
  log(`Source ${sourceSha}; build ${options.nativeBuild}; rollout ${options.rollout}%; destination ${repository}/${branch}.`)
  if (options.dryRun) {
    for (const args of commands) log(`npm ${args.map(arg => JSON.stringify(arg)).join(' ')}`)
    log('Then preview, confirm, commit only verified release files, push through GitHub, wait, and verify exact live digests. Dry run made no changes.')
    return { status: 'dry-run' }
  }
  for (const args of commands) { log(`Running npm ${args[1]}...`); await run('npm', args) }
  const release = await preparedRelease(options, root)
  const guard = async () => {
    await guardRemote()
    if (await head() !== sourceSha || await git('branch', '--show-current') !== branch) throw new Error('Branch/HEAD changed during preparation. Nothing will be pushed.')
    if (await git('diff', '--cached', '--name-only', '-z')) throw new Error('The Git index changed during preparation. Nothing will be committed.')
    const changed = [...lines(await git('diff', '--name-only', '-z', 'HEAD', '--')), ...lines(await git('ls-files', '--others', '--exclude-standard', '-z'))]
    if (changed.some(file => !release.paths.includes(file))) throw new Error('Preparation or concurrent work changed files outside this release. Review/commit those changes, then rerun; no files are discarded.')
    if (await remoteHead() !== beforeRemote) throw new Error('origin/develop advanced during preparation. Review the remote changes before retrying.')
  }
  await guard()
  const approvedBlobs = new Map<string, string>()
  log('Proposed release files:')
  for (const file of release.paths) {
    const info = await lstat(path.join(root, file))
    if (!info.isFile() || await realpath(path.join(root, file)) !== path.join(await realpath(root), file)) throw new Error(`Release asset is not a regular file without symlinks: ${file}`)
    approvedBlobs.set(file, await git('hash-object', '--', file))
    log(`  ${file} (${info.size} bytes)`)
  }
  log(`Unpushed source commits:\n${await git('log', '--oneline', `${beforeRemote}..${sourceSha}`) || '(none)'}`)
  const message = `Publish signed update for native build ${options.nativeBuild} (${options.rollout}% rollout)`
  log(`Proposed commit: ${message}`)
  if (!await services.confirm(`Confirm this is an approved web-only release. Commit these files and push ALL listed source commits to develop at ${options.rollout}% rollout?`)) {
    log('Cancelled. No commit or push. Generated files remain unstaged for inspection; review them before another release run.')
    return { status: 'cancelled' }
  }
  await guard()
  for (const [file, blob] of approvedBlobs) {
    if (await git('hash-object', '--', file) !== blob) throw new Error('Release files changed after the preview. Nothing will be committed.')
  }
  let commit = ''
  try {
    await run('git', ['add', '--', ...release.paths])
    await run('git', ['diff', '--cached', '--check'])
    if (!await git('diff', '--cached', '--name-only')) {
      log('No release changes to commit. Nothing was pushed.')
      return { status: 'unchanged' }
    }
    await run('git', ['commit', '--only', '-m', message, '--', ...release.paths])
    commit = await head()
    if (await git('rev-parse', `${commit}^`) !== sourceSha || await git('branch', '--show-current') !== branch) throw new Error('Unexpected commit history after publication confirmation.')
    for (const [file, blob] of approvedBlobs) {
      if (await git('rev-parse', `${commit}:${file}`) !== blob) throw new Error('Committed release bytes differ from the approved preview.')
    }
    const committedPaths = lines(await git('diff-tree', '--no-commit-id', '--name-only', '-r', '-z', commit))
    if (committedPaths.some(file => !release.paths.includes(file))) throw new Error('Commit contains unexpected paths. Nothing will be pushed.')
    await guardRemote()
    await run('git', ['push', 'origin', `${commit}:refs/heads/${branch}`])
    await waitForUpdateDeployment(repository, commit, options.timeoutMs, services)
    const verified = JSON.parse(await run('npm', ['run', '--silent', 'updates:verify', '--', '--native-build', options.nativeBuild], true))
    assertPublishedRelease(verified, release, options.nativeBuild)
    log(`Published and verified: https://github.com/${repository}/commit/${commit}`)
    return { status: 'published', commit }
  } catch (error) {
    if (commit) log(`Release commit retained: ${commit}. Check origin/develop before retrying a failed push. After deployment, run npm run updates:verify -- --native-build ${options.nativeBuild} and compare bundle ${release.bundleId}, content ${release.contentDigest}, rollout ${release.rollout}. No automatic retry or rollback ran.`)
    throw error
  }
}

export function releaseCommand(root: string, keyFile: string, signal?: AbortSignal): ReleaseCommand {
  return (command, args, capture = false) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, signal,
      env: { ...process.env, TIKKUN_UPDATE_PRIVATE_KEY_FILE: keyFile, GH_PROMPT_DISABLED: '1' },
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
      if (!options.dryRun && (!process.stdin.isTTY || !process.stdout.isTTY)) throw new Error('Run interactively for publication confirmation, or use --dry-run. There is no unattended publish flag.')
      const keyFile = path.resolve(process.env.TIKKUN_UPDATE_PRIVATE_KEY_FILE ?? path.join(rootDirectory, '.asc/update-signing/private.pem'))
      await releaseUpdates(options, { root: rootDirectory, keyFile, run: releaseCommand(rootDirectory, keyFile, cancellation.signal),
        platform: process.platform, nodeVersion: process.versions.node, now: Date.now, log: console.log,
        sleep: milliseconds => delay(milliseconds, undefined, { signal: cancellation.signal }),
        confirm: async message => {
          const terminal = createInterface({ input: process.stdin, output: process.stdout })
          try { return (await terminal.question(`${message}\nType "publish" to continue: `, { signal: cancellation.signal })).trim() === 'publish' }
          finally { terminal.close() }
        },
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
