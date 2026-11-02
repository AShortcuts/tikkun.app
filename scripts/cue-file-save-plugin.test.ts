import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, expect, test, vi } from 'vitest'
import { createCueFileSaveHandler, isLocalCueSaveRequest } from './cue-file-save-plugin.ts'

const servers: http.Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
})

async function serve(save: (body: string) => Promise<Record<string, unknown>>) {
  const server = http.createServer((request, response) => void createCueFileSaveHandler(save)(request, response))
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return (options: { method?: string; headers?: Record<string, string>; body?: string }) =>
    new Promise<{ status: number; marker: string | undefined; body: Record<string, unknown> }>((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port, path: '/', method: options.method ?? 'POST', headers: options.headers }, (response) => {
        let text = ''
        response.on('data', (chunk: Buffer) => { text += chunk.toString() })
        response.on('end', () => resolve({
          status: response.statusCode ?? 0,
          marker: response.headers['x-tikkun-cue-save'] as string | undefined,
          body: JSON.parse(text),
        }))
      })
      request.on('error', reject)
      request.end(options.body)
    })
}

const saveHeaders = { 'x-tikkun-cue-save': '1', 'content-type': 'application/json' }

test('saves posted cue JSON from a browser on this computer', async () => {
  const save = vi.fn(async (body: string) => ({ path: 'audio-cues/reader/01 test/1.json', received: JSON.parse(body).audioId }))
  const post = await serve(save)
  const response = await post({ headers: { ...saveHeaders, origin: 'http://localhost:5176' }, body: '{"audioId":"test-1"}' })
  expect(response).toEqual({ status: 200, marker: '1', body: { ok: true, path: 'audio-cues/reader/01 test/1.json', received: 'test-1' } })
})

test('reports validation problems and refuses requests the save flow never sends', async () => {
  const save = vi.fn(async () => { throw new Error('Cue Data diverges at cue 3') })
  const post = await serve(save)
  expect(await post({ headers: saveHeaders, body: '{}' })).toMatchObject({ status: 422, body: { ok: false, error: 'Cue Data diverges at cue 3' } })
  expect(await post({ headers: { 'content-type': 'application/json' }, body: '{}' })).toMatchObject({ status: 400 })
  expect(await post({ method: 'GET' })).toMatchObject({ status: 405, marker: '1' })
  expect(await post({ headers: { ...saveHeaders, origin: 'https://example.com' }, body: '{}' })).toMatchObject({ status: 403 })
  expect(await post({ headers: { ...saveHeaders, host: 'tikkun.example:5176' }, body: '{}' })).toMatchObject({ status: 403 })
  expect(save).toHaveBeenCalledTimes(1)
})

test('only loopback connections addressed to localhost may save', () => {
  const request = (remoteAddress: string, host: string, origin?: string) =>
    ({ socket: { remoteAddress }, headers: { host, ...(origin ? { origin } : {}) } }) as unknown as http.IncomingMessage
  expect(isLocalCueSaveRequest(request('127.0.0.1', 'localhost:5176'))).toBe(true)
  expect(isLocalCueSaveRequest(request('::1', '[::1]:5176', 'http://[::1]:5176'))).toBe(true)
  expect(isLocalCueSaveRequest(request('192.168.1.20', '192.168.1.10:5176'))).toBe(false)
  expect(isLocalCueSaveRequest(request('100.64.0.8', 'localhost:5176'))).toBe(false)
})
