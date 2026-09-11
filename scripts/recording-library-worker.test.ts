import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { expect, test, vi } from 'vitest'
import { renderServiceWorkerSource } from './generate-service-worker.mjs'
import { parseRecordingInventory } from '../app/offline/recording-inventory.ts'

test('library protocol reports verified assets and removes corrupt cache entries', async () => {
  const bytes = Uint8Array.from([1, 2, 3, 4])
  const digest = createHash('sha256').update(bytes).digest('hex')
  const url = `https://tikkun.test/audio/valid.m4a?tikkun-media=${digest}`
  const corruptUrl = `https://tikkun.test/audio/corrupt.m4a?tikkun-media=${digest}`
  const response = (body: Uint8Array<ArrayBuffer>, audioId: string) => new Response(body, {
    headers: {
      'Content-Length': String(bytes.length),
      'X-Tikkun-Audio-Id': audioId,
      'X-Tikkun-Media-Digest': digest,
    },
  })
  const stored = new Map([
    [url, response(bytes, 'valid')],
    [corruptUrl, response(Uint8Array.from([0, 0, 0, 0]), 'corrupt')],
  ])
  type MessageEvent = {
    data: { type: string }
    ports: { postMessage(value: unknown): void; close(): void }[]
    waitUntil(promise: Promise<void>): void
  }
  let receive: ((event: MessageEvent) => void) | undefined
  vm.runInNewContext(renderServiceWorkerSource({
    buildHash: 'inventory-test', shellUrls: [], torahPageUrls: [],
  }), {
    URL, Headers, Request, Response, ReadableStream,
    self: {
      location: { origin: 'https://tikkun.test' },
      addEventListener(name: string, handler: (event: MessageEvent) => void) {
        if (name === 'message') receive = handler
      },
    },
    caches: {
      open: async () => ({
        keys: async () => [...stored.keys()].map((key) => new Request(key)),
        match: async (request: Request) => stored.get(request.url)?.clone(),
        delete: async (request: Request) => stored.delete(request.url),
      }),
    },
  })
  const postMessage = vi.fn()
  const close = vi.fn()
  let finished: Promise<void> | undefined
  expect(receive).toBeTypeOf('function')
  receive!({
    data: { type: 'GET_RECORDING_LIBRARY' },
    ports: [{ postMessage, close }],
    waitUntil(promise) { finished = promise },
  })
  await finished
  expect(postMessage).toHaveBeenCalledTimes(1)
  expect(parseRecordingInventory(postMessage.mock.calls[0][0])).toEqual([
    { audioId: 'valid', digest, byteLength: bytes.length, url },
  ])
  expect(stored.has(corruptUrl)).toBe(false)
  expect(close).toHaveBeenCalledOnce()
})
