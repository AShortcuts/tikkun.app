import { expect, test, vi } from 'vitest'
import type { LineType } from '../components/Page.ts'
import { loadScrollPageLines } from '../view-model/scroll-view-model.ts'
import {
  PassageTokenIdentityError,
  createPassageTokenIdentityIndex,
  loadPassageTokenIdentityIndex,
  resolvePassageTokenIdentity,
} from './passage-token-identity.ts'

const line = (text: string, verses: [number, number, number][] = [[1, 1, 1]]): LineType => ({
  text: [[text]], verses: verses.map(([book, chapter, verse]) => ({ book, chapter, verse })), aliyot: [], isPetucha: false,
})
const ref = (b: number, c: number, v: number) => ({ scroll: 'torah', b, c, v })
const resolve = (tokenKey: string, label?: string) => resolvePassageTokenIdentity({ scroll: 'torah', tokenKey, label })

test('restores the plain-only Genesis 1:2 token without changing original coordinates', async () => {
  expect(await resolve('1:1:0:8', 'ורוח')).toEqual({
    canonicalTokenKey: '1:1:0:7', canonicalText: 'וְר֣וּחַ', ref: ref(1, 1, 2), plainTokenKeys: ['1:1:0:8'],
  })
})

test('label evidence distinguishes a shared-row aliyah boundary collision', async () => {
  const index = await loadPassageTokenIdentityIndex({ pageNumber: 5, scroll: 'torah' })
  expect(index.resolve({ tokenKey: '5:0:0:3', label: 'למך' })).toEqual({
    canonicalTokenKey: '5:0:0:2', canonicalText: 'אֶת־לָֽמֶךְ׃', ref: ref(1, 4, 18), plainTokenKeys: ['5:0:0:2', '5:0:0:3'],
  })
  const canonical = index.canonical.get('5:0:0:3')!
  expect(index.resolve({ tokenKey: canonical.canonicalTokenKey, label: canonical.canonicalText })).toBe(canonical)
  expect(canonical.ref).toEqual(ref(1, 4, 19))
  expect(canonical.plainTokenKeys).toEqual(['5:0:0:4', '5:0:0:5'])
})

test('ktiv/kri maps through actual source forms in both activation directions', async () => {
  const index = await loadPassageTokenIdentityIndex({ pageNumber: 8, scroll: 'torah' })
  const kri = index.resolve({ tokenKey: '8:36:0:4', form: 'annotated' })
  expect(kri).toEqual({ canonicalTokenKey: '8:36:0:4', canonicalText: 'הַיְצֵ֣א', ref: ref(1, 8, 17), plainTokenKeys: ['8:36:0:6'] })
  expect(index.resolve({ tokenKey: '8:36:0:4', label: 'הַיְצֵ֣א' })).toBe(kri)
  expect(index.resolve({ tokenKey: '8:36:0:6', label: 'הוצא' })).toBe(kri)
  expect(index.plain.get('8:36:0:6')).toEqual([kri])
  expect(index.resolve({ tokenKey: '8:36:0:4', label: 'על' }).canonicalTokenKey).toBe('8:36:0:3')
})

test('a shared physical row uses the preceding verse, not its first verse marker', async () => {
  const identity = await resolve('5:0:0:0')
  expect(identity.ref).toEqual(ref(1, 4, 18))
  expect(identity.canonicalTokenKey).toBe('5:0:0:0')
  expect((await loadScrollPageLines('torah', 5))[0].verses[0].verse).toBe(19)
})

test('a cross-page final verse remains attached to its original reference', async () => {
  expect((await resolve('37:0:0:0')).ref).toEqual(ref(1, 32, 3))
  const index = await loadPassageTokenIdentityIndex({ pageNumber: 37, scroll: 'torah' })
  expect(index.resolve({ tokenKey: '37:0:0:3', form: 'annotated' }).ref).toEqual(ref(1, 32, 3))
  expect(index.canonical.get('37:1:0:0')?.ref).toEqual(ref(1, 32, 4))
})

test.each([{ pageNumber: 84, lineIndex: 12, reference: ref(2, 20, 13) }])('Decalogue clauses retain their indexed verse on page $pageNumber', async ({ pageNumber, lineIndex, reference }) => {
  const index = await loadPassageTokenIdentityIndex({ pageNumber, scroll: 'torah' })
  for (const key of [`${pageNumber}:${lineIndex}:1:0`, `${pageNumber}:${lineIndex}:2:0`, `${pageNumber}:${lineIndex + 1}:1:0`]) {
    expect(index.canonical.get(key)?.ref).toEqual(reference)
  }
})

test('normalized Hebrew is accepted only when one identity matches', async () => {
  expect((await resolve('5:0:0:3', 'לָמֶךְ')).canonicalTokenKey).toBe('5:0:0:2')
  expect((await resolve('8:36:0:4', 'היצא')).canonicalTokenKey).toBe('8:36:0:4')
  const index = createPassageTokenIdentityIndex({ pageNumber: 1, scroll: 'torah', lines: [line('אָב־אָב אָב׃')] })
  expect(index.resolve({ tokenKey: '1:0:0:1', label: 'אב' }).canonicalTokenKey).toBe('1:0:0:0')
  expect(index.resolve({ tokenKey: '1:0:0:1', label: 'אָב׃' }).canonicalTokenKey).toBe('1:0:0:1')
  expect(() => index.resolve({ tokenKey: '1:0:0:1', label: 'אַב' })).toThrow('ambiguous')
  expect(() => index.resolve({ tokenKey: '1:0:0:1', label: 'Practice אב' })).toThrow('ambiguous')
})

test('inverted nuns stay keyless and do not consume the next verse marker', () => {
  const index = createPassageTokenIdentityIndex({ pageNumber: 1, scroll: 'torah', lines: [
    line('(׆)#וַיְהִי בִּנְסֹעַ׃#(׆)#(פ) אַחֲרֵי׃', [[4, 10, 35], [4, 10, 36]]),
  ] })
  expect([...index.canonical.keys()]).toEqual(['1:0:0:1', '1:0:0:2', '1:0:0:4'])
  expect(index.plain.has('1:0:0:0')).toBe(false)
  expect(index.plain.has('1:0:0:3')).toBe(false)
  expect(index.canonical.get('1:0:0:4')?.ref).toEqual(ref(4, 10, 36))
  expect(() => index.resolve({ tokenKey: '1:0:0:0' })).toThrow('could not be found')
})

test('invalid positions and unavailable context report errors without a fallback', async () => {
  const loadPage = vi.fn(async () => [line('אב׃')])
  await expect(resolvePassageTokenIdentity({ tokenKey: '0:0:0:0', scroll: 'torah' }, { loadPage })).rejects.toThrow('Invalid saved word')
  expect(loadPage).not.toHaveBeenCalled()
  await expect(resolvePassageTokenIdentity({ tokenKey: '1:0:0:99', scroll: 'torah' }, { loadPage })).rejects.toThrow('could not be found')
  expect(() => createPassageTokenIdentityIndex({ pageNumber: 2, scroll: 'torah', lines: [line('אב׃')] })).toThrow('Previous page context')
  expect(() => createPassageTokenIdentityIndex({ pageNumber: 2, scroll: 'torah', lines: [line('אב׃')] })).not.toThrow(PassageTokenIdentityError)
  expect(() => createPassageTokenIdentityIndex({ pageNumber: 1, scroll: 'torah', lines: [line('אב׃', [])] })).toThrow('matched to a pasuk')
  expect(() => createPassageTokenIdentityIndex({ pageNumber: 1, scroll: 'torah', lines: [line('אב׃', [])] })).not.toThrow(PassageTokenIdentityError)
  const unavailable = new Error('Source unavailable')
  await expect(resolvePassageTokenIdentity({ tokenKey: '2:0:0:0', scroll: 'torah' }, { loadPage: async () => { throw unavailable } })).rejects.toBe(unavailable)
})

test('Esther retains its scroll identity and source word coordinates', async () => {
  const identity = await resolvePassageTokenIdentity({ scroll: 'esther', tokenKey: '1:0:0:0', form: 'annotated' })
  expect(identity.ref).toEqual({ scroll: 'esther', b: 1, c: 1, v: 1 })
  expect(identity.canonicalTokenKey).toBe('1:0:0:0')
})
