import { expect, test } from 'vitest'
import {
  adjustStartingLineTokens,
  collectTokenKeysForAliyahRange,
} from './aliyah-token-sequence.ts'

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

test('starts from the beginning when the previous line ends with sof pasuk', () => {
  const previousLineWords = [createWord('הארץ׃')]
  const currentLineWords = [createWord('וְהָאָ֗רֶץ'), createWord('הָיְתָ֥ה')]

  expect(
    adjustStartingLineTokens({
      currentLineWords,
      previousLineWords,
    })
  ).toEqual(currentLineWords)
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

test('collects token keys from the starting line onward without an aliyah cutoff', () => {
  const book = document.createElement('div')
  book.innerHTML = `
    <table>
      <tr data-class="line" data-line-index="0">
        <td>
          <span class="fragment mod-annotations-on">
            <span class="word" data-token-key="0:0:0:0">לפני</span>
            <span class="word" data-token-key="0:0:0:1">התחלה</span>
          </span>
        </td>
      </tr>
      <tr data-class="line" data-line-index="1">
        <td>
          <span class="fragment mod-annotations-on">
            <span class="word" data-token-key="0:1:0:0">קודם</span>
            <span class="word" data-token-key="0:1:0:1">פסוק׃</span>
            <span class="word" data-token-key="0:1:0:2">ויקרא</span>
            <span class="word" data-token-key="0:1:0:3">האדם</span>
          </span>
        </td>
      </tr>
      <tr data-class="line" data-line-index="2">
        <td>
          <span class="fragment mod-annotations-on">
            <span class="word" data-token-key="0:2:0:0">שמות</span>
          </span>
        </td>
      </tr>
    </table>
  `

  const lines = [...book.querySelectorAll<HTMLElement>('[data-class="line"]')]
  expect(
    collectTokenKeysForAliyahRange({
      book,
      startLine: lines[1],
    })
  ).toEqual(['0:1:0:2', '0:1:0:3', '0:2:0:0'])
})
