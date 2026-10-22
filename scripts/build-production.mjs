import { cp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export async function prepareProductionRoutes(root, native = false) {
  const source = path.join(root, 'src/routes')
  // Keep the source depth so relative imports work, without editing live dev routes.
  const routes = `src/.routes-${native ? 'native' : 'web'}`
  const destination = path.join(root, routes)
  await rm(destination, { recursive: true, force: true })
  await cp(source, destination, { recursive: true, filter: file => {
    const relative = path.relative(source, file).split(path.sep).join('/')
    return !/^(?:prototypes|\(site\)\/old-v2\.html)(?:\/|$)/.test(relative) &&
      !(native && /^(?:\(home\))(?:\/|$)/.test(relative)) &&
      !/\.(?:test|vitest|phone)\.[^.]+$/.test(relative) && !relative.includes('__screenshots__')
  } })
  if (native) {
    // Keep the root entry for Capacitor and existing Home links, without the marketing page.
    await writeFile(path.join(destination, '+page.svelte'), '')
    await writeFile(path.join(destination, '+page.ts'),
      "import { redirect } from '@sveltejs/kit'\nimport { resolve } from '$app/paths'\n\nexport function load() { redirect(307, resolve('/reader/')) }\n")
  }
  return routes
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const routes = await prepareProductionRoutes(root, process.env.TIKKUN_NATIVE === '1')
  const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', ...process.argv.slice(2)], {
    cwd: root, env: { ...process.env, TIKKUN_PRODUCTION_ROUTES: routes }, stdio: 'inherit',
  })
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}
