import { expect, test } from 'vitest'
import { readBoundedResponse } from './content-runtime.ts'
import { ContentSession } from './content-session.ts'
import { contentCompatibility, digestText, parseContentSnapshot } from './content-schema.ts'
import { verifyReleaseEnvelope } from './release-signature.ts'

test('browser cryptography and persisted launch selection work without a service worker', async () => {
  const snapshot = parseContentSnapshot({ schema: 1, pages: { 'torah/1': [{ text: [['\u05d0\u05d1']], verses: [], aliyot: [], isPetucha: false }] },
    recordings: [{ id: 'test-1', narratorId: 'yoni-davidov', reading: { kind: 'parsha', id: 'test', name: 'Test' }, parshaSlug: 'test', parshaName: 'Test',
      aliyah: 1, title: 'Test', format: 'm4a', status: 'missing', playSrc: '/audio/test/1.m4a', downloadSrc: '/audio/test/1.m4a' }], cues: {} })
  let stored: string | null = null
  const store = { read: async () => stored, write: async (value: string) => { stored = value } }
  const compatibility = await contentCompatibility(snapshot)
  const current = new ContentSession(store, compatibility, error => { throw error })
  await current.open()
  const payload = JSON.stringify(snapshot)
  await current.stage({ payload, digest: await digestText(payload) })
  expect(current.snapshot).toBeNull()
  const next = new ContentSession(store, compatibility, error => { throw error })
  await next.open()
  expect(next.snapshot).toEqual(snapshot)
  await next.ready()
})
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
