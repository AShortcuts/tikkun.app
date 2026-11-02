import { expect, test, vi } from 'vitest'
import { handleAliyahPermalinkClick } from './aliyah-permalink.ts'

function nativeLink(url = '#/torah/parsha/beresheet/1-4-19') {
  const link = document.createElement('button')
  link.dataset.aliyahLink = 'true'
  link.dataset.aliyahUrl = url
  document.body.replaceChildren(link)
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'target', { value: link })
  return { link, event }
}

test('native copy uses a public reading URL and waits for clipboard success', async () => {
  const { link, event } = nativeLink('capacitor://localhost/reader/#/torah/parsha/beresheet/1-4-19?recording=1')
  let finish!: () => void
  const nativeWriteText = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const browserWrite = vi.fn()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: browserWrite } })
  const result = handleAliyahPermalinkClick(event, { nativeWriteText })
  expect(nativeWriteText).toHaveBeenCalledExactlyOnceWith('https://tikkunreader.com/reader/#/torah/parsha/beresheet/1-4-19')
  expect(event.defaultPrevented).toBe(true)
  expect(link.dataset.copyState).toBeUndefined()
  expect(await handleAliyahPermalinkClick(event, { nativeWriteText })).toBe(true)
  expect(nativeWriteText).toHaveBeenCalledOnce()
  finish()
  expect(await result).toBe(true)
  expect(link.dataset.copyState).toBe('copied')
  expect(browserWrite).not.toHaveBeenCalled()
})

test('copies an aliyah permalink and marks the link as copied after a successful click', async () => {
  document.body.innerHTML = `
    <a data-aliyah-link="true" href="#/torah/parsha/lech-lecha/1-12-14">
      <span data-aliyah-link-icon="link"></span>
      <span data-aliyah-link-icon="check" hidden></span>
    </a>
  `
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })

  const link = document.querySelector<HTMLAnchorElement>('[data-aliyah-link="true"]')
  if (!link) throw new Error('Expected link')
  const event = new MouseEvent('click', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'target', {
    configurable: true,
    value: link,
  })

  await handleAliyahPermalinkClick(event)

  expect(event.defaultPrevented).toBe(true)
  expect(writeText).toHaveBeenCalledWith(link.href)
  expect(link.dataset.copyState).toBe('copied')
  expect(link.querySelector('[data-aliyah-link-icon="link"]')?.hasAttribute('hidden')).toBe(true)
  expect(link.querySelector('[data-aliyah-link-icon="check"]')?.hasAttribute('hidden')).toBe(false)
})
