import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { includeNativeAsset, nativeBuildConfig, nativeContentFiles } from './native-build-config.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const environment = {
  ...process.env,
  TIKKUN_NATIVE: '1',
  TIKKUN_NATIVE_MEDIA_ORIGIN: process.env.TIKKUN_NATIVE_MEDIA_ORIGIN ?? 'https://tikkunreader.com',
}
const configuration = nativeBuildConfig(environment)
const assets = path.join(root, '.native-site')
const source = path.join(root, 'site')

// Vite's TypeScript transforms read the root config even for native builds.
// Seed its framework types on a clean checkout, never rewrite a running web app.
let needsWebTypes = false
try { await stat(path.join(root, '.svelte-kit/tsconfig.json')) }
catch (error) {
  if (error.code !== 'ENOENT') throw error
  needsWebTypes = true
}
if (needsWebTypes) {
  const result = spawnSync(process.execPath, ['node_modules/@sveltejs/kit/svelte-kit.js', 'sync'], {
    cwd: root, env: { ...environment, TIKKUN_NATIVE: '0' }, stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

// This directory is generated exclusively for the native build.
await rm(assets, { recursive: true, force: true })
await mkdir(assets, { recursive: true })
await cp(source, assets, {
  recursive: true,
  filter: (file) => file === source || includeNativeAsset(path.relative(source, file)),
})

// Derive compiler settings without rewriting the live web project's config.
const typescript = JSON.parse(await readFile(path.join(root, 'tsconfig.json'), 'utf8'))
typescript.extends = './.svelte-kit-native/tsconfig.json'
typescript.include = typescript.include.map((entry) => entry.replace('./.svelte-kit/', './.svelte-kit-native/'))
await writeFile(path.join(root, 'tsconfig.native.json'), `${JSON.stringify(typescript, null, 2)}\n`)

for (const args of [
  ['scripts/build-system-calendar.mjs'],
  ['scripts/generate-torah-index.mjs'],
  ['--import', 'tsx', 'scripts/generate-public-reading-manifest.mjs'],
  ['node_modules/vite/bin/vite.js', 'build', '--logLevel', 'warn'],
  ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.native.json', '--noEmit'],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root, env: environment, stdio: 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const output = path.join(root, 'dist-native')
await stat(path.join(output, 'reader/index.html'))
const files = []
async function inventory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) await inventory(file)
    else if (entry.isFile()) {
      const relativePath = path.relative(output, file)
      if (/\.(?:mp3|m4a|mp4|wav|webm|mov)$/i.test(relativePath)) {
        throw new Error(`Native bundle unexpectedly includes media: ${relativePath}`)
      }
      files.push({ path: relativePath, bytes: (await stat(file)).size })
    }
  }
}
await inventory(output)
files.sort((left, right) => left.path.localeCompare(right.path))
const contentSources = []
async function collectContent(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) await collectContent(file)
    else if (entry.isFile() && entry.name.endsWith('.json')) contentSources.push(path.relative(root, file))
  }
}
await collectContent(path.join(root, 'text/pages'))
await collectContent(path.join(root, 'audio-cues'))
const manifest = JSON.parse(await readFile(path.join(root, '.svelte-kit-native/output/client/.vite/manifest.json'), 'utf8'))
const { modules: sourceChunks } = JSON.parse(await readFile(path.join(root, '.svelte-kit-native/output/client/.vite/content-inventory.json'), 'utf8'))
const content = nativeContentFiles(manifest, contentSources.sort(), files.map((file) => file.path), sourceChunks)
for (const entry of content) {
  entry.sourceDigest = createHash('sha256').update(await readFile(path.join(root, entry.source))).digest('hex')
}
const report = {
  mediaOrigin: configuration.mediaOrigin,
  entry: '/reader/',
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  files,
  bundledContent: content,
}
await writeFile(path.join(root, 'native-bundle-report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(`Native web bundle: ${report.totalBytes} bytes, ${files.length} files; no audio library`)
