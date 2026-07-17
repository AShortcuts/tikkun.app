import { expect, test } from 'vitest'
import {
  adjustEndingLineTokens,
  adjustStartingLineTokens,
  collectStartingLineTokenKeys,
  collectTokenKeysForExactAliyahRange,
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

test('keeps words through the first sof pasuk when the next aliyah starts mid-line', () => {
  const previousLineWords = [createWord('מילה')]
  const currentLineWords = [
    createWord('קודם'),
    createWord('פסוק׃'),
    createWord('התחלה'),
    createWord('המשך'),
  ]

  expect(
    adjustEndingLineTokens({
      currentLineWords,
      previousLineWords,
    }).map((word) => word.textContent)
  ).toEqual(['קודם', 'פסוק׃'])
})

test('collects aliyah token keys from line rows only', () => {
  const book = document.createElement('div')
  book.innerHTML = `
    <table>
      <tr data-class="line" data-line-index="0">
        <td>
          <span class="fragment mod-annotations-on">
            <span class="word" data-line-index="0" data-token-key="0:0:0:0">לפני</span>
            <span class="word" data-line-index="0" data-token-key="0:0:0:1">התחלה</span>
          </span>
        </td>
      </tr>
      <tr data-class="line" data-line-index="1">
        <td>
          <span class="fragment mod-annotations-on">
            <span class="word" data-line-index="1" data-token-key="0:1:0:0">קודם</span>
            <span class="word" data-line-index="1" data-token-key="0:1:0:1">פסוק׃</span>
            <span class="word" data-line-index="1" data-token-key="0:1:0:2">ויקרא</span>
            <span class="word" data-line-index="1" data-token-key="0:1:0:3">האדם</span>
          </span>
        </td>
      </tr>
      <tr data-class="line" data-line-index="2">
        <td>
          <span class="fragment mod-annotations-on">
            <span class="word" data-line-index="2" data-token-key="0:2:0:0">שמות</span>
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
      endLine: lines[2],
    })
  ).toEqual(['0:1:0:2', '0:1:0:3'])
})

test('keeps the shared line prefix when the next aliyah begins mid-line', () => {
  const book = document.createElement('div')
  book.innerHTML = `
    <table>
      <tr data-class="line" data-line-index="0">
        <td>
          <span class="fragment mod-annotations-on">
            <span class="word" data-token-key="0:0:0:0">פתיחה</span>
          </span>
        </td>
      </tr>
      <tr data-class="line" data-line-index="1">
        <td>
          <span class="fragment mod-annotations-on">
            <span class="word" data-token-key="0:1:0:0">לפני</span>
            <span class="word" data-token-key="0:1:0:1">סיום׃</span>
            <span class="word" data-token-key="0:1:0:2">תחילת</span>
            <span class="word" data-token-key="0:1:0:3">עלייה</span>
          </span>
        </td>
      </tr>
    </table>
  `

  const lines = [...book.querySelectorAll<HTMLElement>('[data-class="line"]')]
  expect(
    collectTokenKeysForAliyahRange({
      book,
      startLine: lines[0],
      endLine: lines[1],
    })
  ).toEqual(['0:0:0:0', '0:1:0:0', '0:1:0:1'])
})

test('collects through the rendered content when the final aliyah has no next marker', () => {
  const book = document.createElement('div')
  book.innerHTML = `
    <table>
      <tr data-class="line" data-line-index="0">
        <td>
          <span class="fragment mod-annotations-on">
            <span class="word" data-token-key="0:0:0:0">לפני</span>
            <span class="word" data-token-key="0:0:0:1">סיום׃</span>
            <span class="word" data-token-key="0:0:0:2">תחילת</span>
          </span>
        </td>
      </tr>
      <tr data-class="line" data-line-index="1">
        <td>
          <span class="fragment mod-annotations-on">
            <span class="word" data-token-key="0:1:0:0">המשך</span>
          </span>
        </td>
      </tr>
    </table>
  `

  const lines = [...book.querySelectorAll<HTMLElement>('[data-class="line"]')]
  expect(
    collectTokenKeysForAliyahRange({
      book,
      startLine: lines[0],
      endLine: null,
    })
  ).toEqual(['0:0:0:0', '0:0:0:1', '0:0:0:2', '0:1:0:0'])
})

test('collects starting line token keys without walking the final aliyah range', () => {
  const book = document.createElement('div')
  book.innerHTML = `
    <table>
      <tr data-class="line" data-line-index="0">
        <td>
          <span class="fragment mod-annotations-on">
            <span class="word" data-token-key="0:0:0:0">לפני</span>
          </span>
        </td>
      </tr>
      <tr data-class="line" data-line-index="1">
        <td>
          <span class="fragment mod-annotations-on">
            <span class="word" data-token-key="0:1:0:0">קודם</span>
            <span class="word" data-token-key="0:1:0:1">סיום׃</span>
            <span class="word" data-token-key="0:1:0:2">מפטיר</span>
            <span class="word" data-token-key="0:1:0:3">מתחיל</span>
          </span>
        </td>
      </tr>
    </table>
  `

  const lines = [...book.querySelectorAll<HTMLElement>('[data-class="line"]')]
  expect(
    collectStartingLineTokenKeys({
      book,
      startLine: lines[1],
    })
  ).toEqual(['0:1:0:2', '0:1:0:3'])
})

test('collects exact inclusive ranges while retaining shared Rosh Chodesh tokens', () => {
  const book = document.createElement('div')
  book.innerHTML = `
    <div data-class="line"><span class="fragment mod-annotations-on"><span class="word" data-token-key="1:0:0:0">א</span><span class="word" data-token-key="1:0:0:1">א׃</span></span></div>
    <div data-class="line"><span class="fragment mod-annotations-on"><span class="word" data-token-key="1:1:0:0">ב</span><span class="word" data-token-key="1:1:0:1">ב׃</span></span></div>
    <div data-class="line"><span class="fragment mod-annotations-on"><span class="word" data-token-key="1:2:0:0">ג</span><span class="word" data-token-key="1:2:0:1">ג׃</span></span></div>
    <div data-class="line"><span class="fragment mod-annotations-on"><span class="word" data-token-key="1:3:0:0">ד</span><span class="word" data-token-key="1:3:0:1">ד׃</span></span></div>
    <div data-class="line"><span class="fragment mod-annotations-on"><span class="word" data-token-key="1:4:0:0">ה</span><span class="word" data-token-key="1:4:0:1">ה׃</span></span></div>
  `
  const lines = [...book.querySelectorAll<HTMLElement>('[data-class="line"]')]
  const first = collectTokenKeysForExactAliyahRange({
    book,
    startLine: lines[0]!,
    startVerseOrdinal: 0,
    endLine: lines[2]!,
    endVerseOrdinal: 0,
  })
  const second = collectTokenKeysForExactAliyahRange({
    book,
    startLine: lines[2]!,
    startVerseOrdinal: 0,
    endLine: lines[4]!,
    endVerseOrdinal: 0,
  })

  expect(first).toEqual([
    '1:0:0:0', '1:0:0:1',
    '1:1:0:0', '1:1:0:1',
    '1:2:0:0', '1:2:0:1',
  ])
  expect(second).toEqual([
    '1:2:0:0', '1:2:0:1',
    '1:3:0:0', '1:3:0:1',
    '1:4:0:0', '1:4:0:1',
  ])
  expect(first.filter((key) => second.includes(key))).toEqual([
    '1:2:0:0', '1:2:0:1',
  ])
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
