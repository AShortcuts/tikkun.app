import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { prepareProductionRoutes } from './build-production.mjs'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

test('web and native builds exclude development routes while preserving source and production layouts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'tikkun-production-routes-'))
  roots.push(root)
  const production = ['+layout.ts', 'reader/+page.svelte', '(site)/tidbits/[slug]/+page.ts']
  const home = ['(home)/+page.svelte', '(home)/+layout.svelte']
  const development = ['prototypes/print/+page.svelte', '(site)/old-v2.html/+page.svelte', 'public-routes-real-url.vitest.ts']
  for (const file of [...production, ...home, ...development]) {
    const source = path.join(root, 'src/routes', file)
    await mkdir(path.dirname(source), { recursive: true })
    await writeFile(source, file)
  }
  for (const native of [false, true]) {
    const destination = path.join(root, await prepareProductionRoutes(root, native))
    for (const file of production) expect(await readFile(path.join(destination, file), 'utf8')).toBe(file)
    for (const file of home) {
      if (native) await expect(stat(path.join(destination, file))).rejects.toMatchObject({ code: 'ENOENT' })
      else expect(await readFile(path.join(destination, file), 'utf8')).toBe(file)
      expect(await readFile(path.join(root, 'src/routes', file), 'utf8')).toBe(file)
    }
    if (native) {
      expect(await readFile(path.join(destination, '+page.ts'), 'utf8')).toContain("redirect(307, resolve('/reader/'))")
    } else {
      await expect(stat(path.join(destination, '+page.ts'))).rejects.toMatchObject({ code: 'ENOENT' })
    }
    for (const file of development) {
      await expect(stat(path.join(destination, file))).rejects.toMatchObject({ code: 'ENOENT' })
      expect(await readFile(path.join(root, 'src/routes', file), 'utf8')).toBe(file)
    }
    await writeFile(path.join(destination, 'stale.js'), 'old build')
    await prepareProductionRoutes(root, native)
    await expect(stat(path.join(destination, 'stale.js'))).rejects.toMatchObject({ code: 'ENOENT' })
  }
})
