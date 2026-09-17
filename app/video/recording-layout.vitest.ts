import { afterEach, expect, test } from 'vitest'
import { page } from 'vitest/browser'
import '/css/master.css'

let fixture: HTMLElement | null = null
afterEach(() => fixture?.remove())

test.each([1280, 1920])('recording uses the full reader width at %s px despite later CSS layers', async width => {
  await page.viewport(width, 1080)
  fixture = document.createElement('section')
  fixture.dataset.recordingMode = 'true'
  fixture.style.height = '100vh'
  fixture.innerHTML = `<main class="reader-shell">
    <aside class="reader-side"></aside>
    <div class="reader-main"><div class="reader-text-forehead"></div><div class="tikkun-book"><div style="height:2000px">Reader</div></div></div>
    <aside class="reader-side"></aside>
  </main>`
  document.body.append(fixture)
  const book = fixture.querySelector<HTMLElement>('.tikkun-book')!
  expect(book.getBoundingClientRect().width).toBe(width)
  expect(book.clientHeight).toBeGreaterThan(1000)
  for (const rail of fixture.querySelectorAll('.reader-side')) {
    expect(getComputedStyle(rail).display).toBe('none')
  }
  delete fixture.dataset.recordingMode
  expect(book.getBoundingClientRect().width).toBeLessThan(width)
})
