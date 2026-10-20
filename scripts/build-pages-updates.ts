import { spawn } from 'node:child_process'
import { createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertNativeTarget, readNativeTarget } from './native-update-target.ts'
import { nativeUpdateContract } from './native-update-contract.mjs'
import { inspectUpdateFeeds, restoreUpdateFeeds } from './update-feed-history.ts'

type Environment = NodeJS.ProcessEnv
type Run = (args: string[], environment: Environment) => Promise<void>
interface Services {
  root: string
  environment: Environment
  run: Run
  log: (message: string) => void
  fetcher?: typeof fetch
}

export async function buildPagesUpdates({ root, environment, run, log, fetcher }: Services) {
  const secret = environment.TIKKUN_UPDATE_PRIVATE_KEY
  const clean = { ...environment }
  delete clean.TIKKUN_UPDATE_PRIVATE_KEY
  delete clean.TIKKUN_UPDATE_PRIVATE_KEY_FILE
  // Neither preview builds nor frontend compilers receive the private key.
  if (environment.CF_PAGES !== '1' || environment.CF_PAGES_BRANCH !== 'develop') {
    log('Website build only; native update signing is restricted to Pages production on develop.')
    await run(['run', 'build'], clean)
    return { mode: 'website' }
  }
  const mode = environment.TIKKUN_UPDATE_MODE ?? 'automatic'
  if (!['automatic', 'manual'].includes(mode)) throw new Error('TIKKUN_UPDATE_MODE must be automatic or manual')
  if (!secret) throw new Error('Set the production-only TIKKUN_UPDATE_PRIVATE_KEY secret in Cloudflare Pages')
  const publicKey = (await readFile(path.join(root, 'config/update-public-key.pem'), 'utf8')).trim()
  const key = createPrivateKey(secret)
  if (createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString().trim() !== publicKey) throw new Error('Update signing keys do not match')
  const targetFile = path.join(root, 'config/native-update-target.json')
  const target = mode === 'automatic' ? await readNativeTarget(targetFile, publicKey) : null
  if (target) assertNativeTarget(target, await nativeUpdateContract(root, publicKey), publicKey)
  const rollout = environment.TIKKUN_UPDATE_ROLLOUT ?? '100'
  if (!/^\d+$/.test(rollout) || Number(rollout) > 100) throw new Error('TIKKUN_UPDATE_ROLLOUT must be an integer from 0 to 100')
  const directory = path.join(root, 'site/updates')
  await mkdir(directory, { recursive: true })
  const history = await restoreUpdateFeeds(directory, 'https://tikkunreader.com', publicKey, { fetcher, manual: mode === 'manual' })
  log(history.bootstrap ? 'First automated release: retaining verified update files from Git.' : `Retained ${history.restored} published update files.`)
  if (target) {
    await run(['run', 'verify:quick'], clean)
    await run(['run', 'build:native'], clean)
    // build:native also regenerates native resources, so recheck its final contract.
    assertNativeTarget(target, JSON.parse(await readFile(path.join(root, 'dist-native/native-update-contract.json'), 'utf8')), publicKey)
    const temporary = await mkdtemp(path.join(tmpdir(), 'tikkun-update-signing-'))
    try {
      const keyFile = path.join(temporary, 'private.pem')
      await writeFile(keyFile, secret, { mode: 0o600 })
      const signing = { ...clean, TIKKUN_UPDATE_PRIVATE_KEY_FILE: keyFile }
      await run(['run', 'updates:web', '--', '--native-build', target.nativeBuild, '--target-record', targetFile,
        '--rollout', rollout, '--approve-web-only'], signing)
      await run(['run', 'updates:stage', '--', '--native-build', target.nativeBuild], clean)
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  }
  const index = await inspectUpdateFeeds(directory, publicKey)
  const payload = JSON.stringify(index)
  await writeFile(path.join(directory, 'index.json'), `${JSON.stringify({ payload, signature: sign('sha256', Buffer.from(payload), key).toString('base64') })}\n`)
  await run(['run', 'build'], clean)
  // Verify the deployment output, not just its source files.
  const output = await inspectUpdateFeeds(path.join(root, 'dist/updates'), publicKey)
  if (JSON.stringify(output) !== payload || await readFile(path.join(root, 'dist/updates/index.json'), 'utf8') !== await readFile(path.join(directory, 'index.json'), 'utf8')) {
    throw new Error('Deployment output does not match the verified update feeds')
  }
  log(`Prepared ${mode} update feeds and website together. Publication is handled by the Git-triggered Pages deployment.`)
  return { mode, nativeBuild: target?.nativeBuild, files: index.files.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const run: Run = (args, env) => new Promise((resolve, reject) => {
    const child = spawn('npm', args, { cwd: root, env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`npm ${args[1]} failed (${signal ?? code})`)))
  })
  await buildPagesUpdates({ root, environment: process.env, run, log: console.log })
}
