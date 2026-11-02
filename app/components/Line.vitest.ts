import { expect, test } from 'vitest'
import utils from './utils.ts'
import { applyAnnotationMode } from './annotation-rendering.ts'
import Line from './Line.ts'
import { collectStartingLineTokenKeys } from '../reading/aliyah-token-sequence.ts'
import { canonicalLineWords } from '../reader/canonical-line-words.ts'
import { HighlightController } from '../reading/highlight-controller.ts'

const { htmlToElement } = utils

test('folds a standalone paseq into the previous word token', () => {
  const node = htmlToElement(
    Line({
      pageNumber: 12,
      lineIndex: 4,
      text: [['וְכֹ֣ל ׀ רוֹמֵ֣שׂ']],
      verses: [{ b: 1, c: 1, v: 1 }],
      isPetucha: false,
      labels: [],
      aliyot: [],
      aliyahStarts: [],
      run: undefined,
    }),
  )

  const words = [...node.querySelectorAll<HTMLElement>('.word')]
  expect(words.length).toBe(2)
  expect(words[0].dataset.tokenKey).toBe('12:4:0:0')
  expect(words[0].textContent).toBe('וְכֹ֣ל ׀')
  expect(words[1].dataset.tokenKey).toBe('12:4:0:1')
  expect(words[1].textContent).toBe('רוֹמֵ֣שׂ')
})

test('keeps inverted nuns visible but skips them without shifting audio word IDs', async () => {
  const text = [['(׆)#וַיְהִ֛י בִּנְסֹ֥עַ הָאָרֹ֖ן׃#(׆)']]
  const node = htmlToElement(Line({
    pageNumber: 165, lineIndex: 26, text,
    verses: [{ b: 4, c: 10, v: 35 }],
    isPetucha: false, labels: [], aliyot: [], aliyahStarts: [],
  }))
  const book = document.createElement('main')
  book.append(node)
  if (!(node instanceof HTMLElement)) throw new Error('Expected an HTML reader line')
  const words = [...node.querySelectorAll<HTMLElement>('.word')]
  const markers = words.filter(word => word.textContent === '׆')
  expect(markers).toHaveLength(2)
  expect(markers.every(word => !word.hasAttribute('data-token-key'))).toBe(true)
  const tokenKeys = collectStartingLineTokenKeys({ book, startLine: node })
  expect(tokenKeys).toEqual(['165:26:0:1', '165:26:0:2', '165:26:0:3'])
  expect(canonicalLineWords(165, 26, { text, verses: [], aliyot: [], isPetucha: false })
    .map(word => word.tokenKey)).toEqual(tokenKeys)
  const highlight = new HighlightController(book)
  highlight.setSequence(tokenKeys)
  await highlight.step(1, { scroll: false })
  expect(node.querySelector('.is-active-word')?.textContent).toBe('וַיְהִ֛י')
  await highlight.activateTokenKey('165:26:0:0', { scroll: false })
  expect(node.querySelector('.is-active-word')).toBeNull()
  applyAnnotationMode(book, false)
  expect(markers.every(word => !word.hidden && word.textContent === '׆')).toBe(true)
})

test('keeps a small letter inside one stable word token in both display modes', () => {
  const node = htmlToElement(
    Line({
      pageNumber: 2,
      lineIndex: 20,
      text: [['אֵ֣לֶּה בְּהִבָּֽרְאָ֑ם']],
      verses: [{ b: 1, c: 2, v: 4 }],
      focalRef: { b: 1, c: 2, v: 4 },
      isPetucha: false,
      labels: [],
      aliyot: [],
      aliyahStarts: [],
      run: undefined,
    }),
  )

  const word = node.querySelector<HTMLElement>('.word[data-word-index="1"]')
  const annotatedLetter = word?.querySelector<HTMLElement>(
    '.special-letter.mod-small',
  )

  expect(node.querySelectorAll('.word')).toHaveLength(2)
  expect(word?.dataset.tokenKey).toBe('2:20:0:1')
  expect(word?.textContent).toBe('בְּהִבָּֽרְאָ֑ם')
  expect(annotatedLetter?.textContent).toBe('הִ')
  expect(annotatedLetter?.dataset.specialLetterId).toBe('genesis-2-4-small-he')
  expect(annotatedLetter?.dataset.specialLetterPosition).toBe('2')
  applyAnnotationMode(node, false)
  const unannotatedLetter = word?.querySelector<HTMLElement>(
    '.special-letter.mod-small',
  )

  expect(node.querySelector<HTMLElement>('.word[data-word-index="1"]')).toBe(
    word,
  )
  expect(word?.textContent).toBe('בהבראם')
  expect(unannotatedLetter?.textContent).toBe('ה')
  expect(unannotatedLetter?.dataset.specialLetterId).toBe(
    'genesis-2-4-small-he',
  )
  expect(unannotatedLetter?.dataset.specialLetterPosition).toBe('2')
})

test('keeps semantic shirah geometry in Match and out of Reading', () => {
  const renderHaazinu = (layout: 'match' | 'reading') =>
    htmlToElement(
      Line({
        pageNumber: 242,
        lineIndex: 7,
        text: [
          ['הַאֲזִ֥ינוּ הַשָּׁמַ֖יִם וַאֲדַבֵּ֑רָה'],
          ['וְתִשְׁמַ֥ע הָאָ֖רֶץ אִמְרֵי־פִֽי׃'],
        ],
        verses: [{ b: 5, c: 32, v: 1 }],
        focalRef: { b: 5, c: 32, v: 1 },
        isPetucha: false,
        labels: [],
        aliyot: [],
        aliyahStarts: [],
        run: undefined,
        presentation: { layout, sides: 'one' },
      }),
    )

  const match = renderHaazinu('match')
  const reading = renderHaazinu('reading')

  expect(match.classList.contains('mod-shirah')).toBe(true)
  expect(match.getAttribute('data-shirah-kind')).toBe('haazinu')
  expect(match.getAttribute('data-shirah-pattern')).toBe('columns-2')
  expect(reading.classList.contains('mod-shirah')).toBe(false)
  expect(reading.hasAttribute('data-shirah-kind')).toBe(false)
})
