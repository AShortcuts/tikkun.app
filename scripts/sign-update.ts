import { readFile } from 'node:fs/promises'
import { createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { updateConfig } from './update-config.mjs'

export async function signUpdateManifest(value: unknown) {
  const config = updateConfig()
  if (!config.enabled) throw new Error('No pinned update public key is configured')
  const file = process.env.TIKKUN_UPDATE_PRIVATE_KEY_FILE ?? fileURLToPath(new URL('../.asc/update-signing/private.pem', import.meta.url))
  const privateKey = createPrivateKey(await readFile(file))
  if (createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString().trim() !== config.publicKey) throw new Error('Update signing keys do not match')
  const payload = JSON.stringify(value)
  return { payload, signature: sign('sha256', Buffer.from(payload), privateKey).toString('base64') }
}
