import { generateKeyPairSync } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const privatePath = path.join(root, '.asc/update-signing/private.pem')
const publicPath = path.join(root, 'config/update-public-key.pem')
const pair = generateKeyPairSync('rsa', { modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } })
await mkdir(path.dirname(privatePath), { recursive: true, mode: 0o700 })
await mkdir(path.dirname(publicPath), { recursive: true })
// Never replace an existing key: installed binaries pin its public half.
await writeFile(privatePath, pair.privateKey, { mode: 0o600, flag: 'wx' })
await writeFile(publicPath, pair.publicKey, { flag: 'wx' })
console.log('Created local update signing key. Back up .asc/update-signing/private.pem securely; never publish it.')
