import { expect, test, vi } from 'vitest'
import { publicReadingUrl, shareReadingLink } from './share-reading.ts'

const hash = '#/torah/parsha/beresheet/1-4-19'
const url = `https://tikkunreader.com/reader/${hash}`

test.each([hash, '#/torah/page/12', '#/esther/megillah-esther/6-1-1', '#/run/2026-10-17:shacharis,main/1-6-9'])(
  'shares public reader route %s without deployment or query data', route => {
    expect(publicReadingUrl(`${route}?authoring=private&token=secret`)).toBe(`https://tikkunreader.com/reader/${route}`)
  })

test.each(['', '#/next', '#/cue-analytics', 'capacitor://localhost/reader/', 'https://elsewhere.test/', '#/torah/page/0'])(
  'rejects non-reading target %s', value => { expect(() => publicReadingUrl(value)).toThrow('Open a reading') })

test('uses native sharing without touching browser facilities', async () => {
  const nativeShare = vi.fn().mockResolvedValue({ activityType: 'copy' })
  const share = vi.fn(), writeText = vi.fn()
  expect(await shareReadingLink(hash, { nativeShare, navigator: { share, clipboard: { writeText } } })).toBe('shared')
  expect(nativeShare).toHaveBeenCalledWith({ title: 'Tikkun Reader', url })
  expect(share).not.toHaveBeenCalled()
  expect(writeText).not.toHaveBeenCalled()
})

test('calls Web Share before yielding user activation', async () => {
  const share = vi.fn().mockResolvedValue(undefined)
  const pending = shareReadingLink(hash, { navigator: { share } })
  expect(share).toHaveBeenCalledWith({ title: 'Tikkun Reader', url })
  expect(await pending).toBe('shared')
})

test.each([false, undefined])('copies when Web Share is unsupported (%s)', canShare => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  const navigator = canShare === false ? { share: vi.fn(), canShare: () => false, clipboard: { writeText } } : { clipboard: { writeText } }
  return expect(shareReadingLink(hash, { navigator })).resolves.toBe('copied').then(() => expect(writeText).toHaveBeenCalledWith(url))
})

test('native cancellation and browser dismissal are not errors or clipboard writes', async () => {
  const writeText = vi.fn()
  expect(await shareReadingLink(hash, { navigator: {}, nativeShare: vi.fn().mockRejectedValue(new Error('Share canceled')) })).toBe('cancelled')
  expect(await shareReadingLink(hash, { navigator: { share: vi.fn().mockRejectedValue(new DOMException('dismissed', 'AbortError')), clipboard: { writeText } } })).toBe('cancelled')
  expect(writeText).not.toHaveBeenCalled()
})

test('real failures propagate without claiming success or changing the clipboard', async () => {
  const writeText = vi.fn()
  await expect(shareReadingLink(hash, { navigator: { share: vi.fn().mockRejectedValue(new Error('denied')), clipboard: { writeText } } })).rejects.toThrow('denied')
  await expect(shareReadingLink(hash, { navigator: {} })).rejects.toThrow('unavailable')
  await expect(shareReadingLink(hash, { navigator: { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) } } })).rejects.toThrow('blocked')
  expect(writeText).not.toHaveBeenCalled()
})
