import { expect, test } from 'vitest'
import { verifyReleaseEnvelope } from './release-signature.ts'
import { readBoundedResponse } from './web-runtime.ts'

test('limits decoded response bytes and rejects failed HTTP downloads', async () => {
  expect(await readBoundedResponse(new Response('okay'), 4)).toBe('okay')
  await expect(readBoundedResponse(new Response('too large'), 4)).rejects.toThrow('limit')
  await expect(readBoundedResponse(new Response('', { status: 500 }), 10)).rejects.toThrow('500')
})

test('WebKit and Chromium verify signed release metadata and reject tampering', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const base64 = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)))
  const publicKey = `-----BEGIN PUBLIC KEY-----\n${base64(await crypto.subtle.exportKey('spki', keys.publicKey))}\n-----END PUBLIC KEY-----`
  const payload = JSON.stringify({ schema: 1, digest: 'a'.repeat(64), bytes: 10 })
  const signature = base64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(payload)))
  expect(await verifyReleaseEnvelope({ payload, signature }, publicKey)).toEqual(JSON.parse(payload))
  await expect(verifyReleaseEnvelope({ payload: payload + ' ', signature }, publicKey)).rejects.toThrow('signature mismatch')
})
