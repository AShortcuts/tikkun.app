import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import process from 'node:process'

function runCommand(command, args, environment, root, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: environment, stdio: ['inherit', capture ? 'pipe' : 'inherit', 'inherit'] })
    let output = ''
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', chunk => { output += chunk })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? resolve(output.trim()) : reject(new Error(`${command} ${args[0]} failed (${signal ?? code})`)))
  })
}

export async function bootstrapPages({ root, environment = process.env, nodeVersion = process.versions.node, run = runCommand }) {
  if (environment.CF_PAGES !== '1') throw new Error('This installer is for Cloudflare Pages. Use npm run build:pages locally with installed dependencies.')
  const { engines } = JSON.parse(await readFile(`${root}/package.json`, 'utf8'))
  if (nodeVersion !== engines.node) throw new Error(`Set Pages NODE_VERSION to ${engines.node}`)
  const clean = { ...environment }
  delete clean.TIKKUN_UPDATE_PRIVATE_KEY
  delete clean.TIKKUN_UPDATE_PRIVATE_KEY_FILE
  if (await run('npm', ['--version'], clean, root, true) !== engines.npm) {
    await run('npm', ['install', '--global', `npm@${engines.npm}`], clean, root)
    if (await run('npm', ['--version'], clean, root, true) !== engines.npm) throw new Error(`Pages could not select npm ${engines.npm}`)
  }
  await run('npm', ['ci', '--include=dev'], clean, root)
  await run(process.execPath, ['--import', 'tsx', 'scripts/build-pages-updates.ts'], environment, root)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await bootstrapPages({ root: fileURLToPath(new URL('..', import.meta.url)) })
}
