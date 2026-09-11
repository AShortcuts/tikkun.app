import { cp, mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { includeNativeAsset } from './native-build-config.mjs'

const source = fileURLToPath(new URL('..', import.meta.url))
const root = await mkdtemp(path.join(tmpdir(), 'tikkun-native-clean-'))
try {
  for (const name of ['app', 'src', 'css', 'text', 'audio-cues', 'generated', 'scripts', 'functions', 'package.json', 'package-lock.json', 'tsconfig.json', 'svelte.config.js', 'vite.config.ts', 'vitest.config.ts', 'capacitor.config.ts']) {
    await cp(path.join(source, name), path.join(root, name), { recursive: true,
      filter: (file) => !file.includes('__screenshots__') })
  }
  const site = path.join(source, 'site')
  await cp(site, path.join(root, 'site'), { recursive: true, filter: (file) => file === site || includeNativeAsset(path.relative(site, file)) })
  await symlink(path.join(source, 'node_modules'), path.join(root, 'node_modules'))
  await assert.rejects(stat(path.join(root, '.svelte-kit')), { code: 'ENOENT' })
  await assert.rejects(stat(path.join(root, '.svelte-kit-native')), { code: 'ENOENT' })
  const result = spawnSync(process.execPath, ['scripts/build-native.mjs'], {
    cwd: root, env: { ...process.env, TIKKUN_BUILD_ID: 'clean-native-check' }, stdio: 'inherit',
  })
  if (result.error) throw result.error
  assert.equal(result.status, 0, 'Native build must work without preexisting web-generated types')
  await stat(path.join(root, '.svelte-kit/tsconfig.json'))
  await stat(path.join(root, '.svelte-kit-native/tsconfig.json'))
  const report = JSON.parse(await readFile(path.join(root, 'native-bundle-report.json'), 'utf8'))
  assert(report.bundledContent.length >= 332, 'Required Torah and cue sources must be packaged')
  assert(!report.files.some((file) => /\.(m4a|mp3|wav)$/.test(file.path)), 'Bulk audio must not be packaged')
  console.log(`Clean native build passed: ${report.files.length} files / ${report.totalBytes} bytes; native types checked.`)
} finally { await rm(root, { recursive: true, force: true }) }
