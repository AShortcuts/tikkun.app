import { expect, test } from 'vitest'
import { adjustStartingLineTokens } from './aliyah-token-sequence.ts'

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
