import { existsSync, readFileSync } from 'node:fs'
import { createPublicKey } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

export function updateConfig(environment = process.env) {
  const file = environment.TIKKUN_UPDATE_PUBLIC_KEY_FILE ?? fileURLToPath(new URL('../config/update-public-key.pem', import.meta.url))
  if (!existsSync(file)) {
    if (environment.TIKKUN_UPDATE_PUBLIC_KEY_FILE) throw new Error('Configured update public key is missing')
    return { publicKey: '', enabled: false }
  }
  const publicKey = readFileSync(file, 'utf8').trim()
  if (!publicKey.startsWith('-----BEGIN PUBLIC KEY-----')) throw new Error('Updates require a public PEM key, never a private key')
  const key = createPublicKey(publicKey)
  if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error('Updates require an RSA key of at least 2048 bits')
  return { publicKey, enabled: true }
}
