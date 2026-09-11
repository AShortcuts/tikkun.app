import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import process from 'node:process'

export async function nativeUpdateContract(root, publicKey) {
  const files = []
  async function collect(directory) {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ['public', 'build', 'CapApp-SPM'].includes(entry.name)) continue
      const relative = `${directory}/${entry.name}`
      if (entry.isDirectory()) await collect(relative)
      else if (/\.(swift|plist|entitlements|pbxproj|xcprivacy|js|json|png|storyboard)$/.test(entry.name)) files.push(relative)
    }
  }
  await collect('ios')
  const hash = createHash('sha256')
  hash.update(await readFile(path.join(root, 'capacitor.config.ts')))
  hash.update(await readFile(path.join(root, 'scripts/update-config.mjs')))
  hash.update(process.env.TIKKUN_NATIVE_MEDIA_ORIGIN ?? 'https://tikkunreader.com')
  for (const file of files.sort()) { hash.update(file); hash.update(await readFile(path.join(root, file))) }
  const { dependencies } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
  hash.update(JSON.stringify(Object.entries(dependencies).filter(([name]) => /capacitor/.test(name)).sort()))
  return { schema: 1, nativeDigest: hash.digest('hex'), publicKeyDigest: createHash('sha256').update(publicKey.trim()).digest('hex') }
}
