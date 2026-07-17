import { afterEach, expect, test } from 'vitest'
import { watchForHighlighting } from './highlight.ts'

afterEach(() => {
  window.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
})

test('highlight watching fails explicitly when the reader book is absent', () => {
  expect(() => watchForHighlighting()).toThrow(/without a tikkun book/)
})

test('highlighting uses text nodes so selected text cannot become markup', () => {
  document.body.innerHTML = `
    <div class="tikkun-book">
      <div class="tikkun-page" data-page-number="1">
        <div data-class="line" data-line-index="0">
          <span class="fragment mod-annotations-on">a&lt;bc</span>
        </div>
      </div>
    </div>
  `
  const book = document.querySelector<HTMLElement>('.tikkun-book')
  const fragment = document.querySelector<HTMLElement>(
    '.fragment.mod-annotations-on',
  )
  const text = fragment?.firstChild
  const selection = window.getSelection()
  if (!book || !fragment || !(text instanceof Text) || !selection) {
    throw new Error('Failed to mount highlighting fixture')
  }

  const range = document.createRange()
  range.setStart(text, 1)
  range.setEnd(text, 3)
  selection.removeAllRanges()
  selection.addRange(range)
  const stop = watchForHighlighting()
  book.dispatchEvent(new Event('selectstart', { bubbles: true }))
  book.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))

  const mark = fragment.querySelector('mark')
  expect(mark?.textContent).toBe('<b')
  expect(fragment.querySelector('b')).toBeNull()
  expect(fragment.textContent).toBe('a<bc')
  stop()
})

test('cross-page selections are ignored instead of partially mutating a page', () => {
  document.body.innerHTML = `
    <div class="tikkun-book">
      <div class="tikkun-page" data-page-number="1">
        <div data-class="line" data-line-index="0">
          <span class="fragment mod-annotations-on">first</span>
        </div>
      </div>
      <div class="tikkun-page" data-page-number="2">
        <div data-class="line" data-line-index="0">
          <span class="fragment mod-annotations-on">second</span>
        </div>
      </div>
    </div>
  `
  const book = document.querySelector<HTMLElement>('.tikkun-book')
  const fragments = document.querySelectorAll<HTMLElement>(
    '.fragment.mod-annotations-on',
  )
  const firstText = fragments[0]?.firstChild
  const secondText = fragments[1]?.firstChild
  const selection = window.getSelection()
  if (
    !book ||
    !(firstText instanceof Text) ||
    !(secondText instanceof Text) ||
    !selection
  ) {
    throw new Error('Failed to mount cross-page selection fixture')
  }

  const range = document.createRange()
  range.setStart(firstText, 1)
  range.setEnd(secondText, 2)
  selection.removeAllRanges()
  selection.addRange(range)
  const stop = watchForHighlighting()
  book.dispatchEvent(new Event('selectstart', { bubbles: true }))
  book.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))

  expect(document.querySelector('mark')).toBeNull()
  expect(fragments[0]?.textContent).toBe('first')
  expect(fragments[1]?.textContent).toBe('second')
  stop()
})
