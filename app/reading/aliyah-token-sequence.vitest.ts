import { expect, test } from 'vitest'
import { adjustStartingLineTokens, collectTokenKeysForExactAliyahRange } from './aliyah-token-sequence.ts'

const createWord = (text: string) => {
  const node = document.createElement('span')
  node.textContent = text
  return node
}

test('starts from the first word when no sof pasuk appears on the line', () => {
  const words = [createWord('א'), createWord('ב'), createWord('ג')]
  expect(
    adjustStartingLineTokens({
      currentLineWords: words,
      previousLineWords: [],
    })
  ).toEqual(words)
})

test('starts from the word after the first sof pasuk when the previous line continues the pasuk', () => {
  const previousLineWords = [createWord('מילה')]
  const currentLineWords = [
    createWord('קודם'),
    createWord('פסוק׃'),
    createWord('התחלה'),
    createWord('המשך'),
  ]

  expect(
    adjustStartingLineTokens({
      currentLineWords,
      previousLineWords,
    }).map((word) => word.textContent)
  ).toEqual(['התחלה', 'המשך'])
})

test('collects seventh and Maftir independently when they share the same range', () => {
  const book = document.createElement('div')
  book.innerHTML = `
    <div data-class="line"><span class="fragment mod-annotations-on"><span class="word" data-token-key="2:0:0:0">שביעי</span><span class="word" data-token-key="2:0:0:1">משותף׃</span></span></div>
  `
  const line = book.querySelector<HTMLElement>('[data-class="line"]')!
  const exactRange = () => collectTokenKeysForExactAliyahRange({
    book,
    startLine: line,
    startVerseOrdinal: 0,
    endLine: line,
    endVerseOrdinal: 0,
  })

  expect(exactRange()).toEqual(['2:0:0:0', '2:0:0:1'])
  expect(exactRange()).toEqual(['2:0:0:0', '2:0:0:1'])
})
