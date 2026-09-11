import { object } from './content-schema.ts'

export async function verifyReleaseEnvelope(value: unknown, publicKey: string): Promise<unknown> {
  if (!publicKey || !object(value) || typeof value.payload !== 'string' || typeof value.signature !== 'string') throw new Error('Invalid signed update manifest')
  const binary = (base64: string) => Uint8Array.from(atob(base64), char => char.charCodeAt(0))
  const key = await crypto.subtle.importKey('spki', binary(publicKey.replace(/-----[^-]+-----|\s/g, '')),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, binary(value.signature), new TextEncoder().encode(value.payload))) throw new Error('Update manifest signature mismatch')
  return JSON.parse(value.payload)
}
