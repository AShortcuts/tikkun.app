import { expect, test } from 'vitest'
import {
  LeiningInstanceId,
  LeiningRunType,
} from '../calendar-model/model-types.ts'
import utils from './utils.ts'
import { applyAnnotationMode } from './annotation-rendering.ts'
import Line from './Line.ts'
import { collectStartingLineTokenKeys } from '../reading/aliyah-token-sequence.ts'

const { htmlToElement } = utils

test('renders word metadata and an inline audio button for aliyah starts', () => {
  const node = htmlToElement(
    Line({
      pageNumber: 12,
      lineIndex: 4,
      text: [['בְּרֵאשִׁית בָּרָא']],
      verses: [{ b: 1, c: 1, v: 1 }],
      isPetucha: false,
      labels: ['פרשת בראשית'],
      aliyot: [],
      aliyahStarts: [
        {
          index: 1,
          start: { scroll: 'torah', b: 1, c: 1, v: 1 },
          end: { scroll: 'torah', b: 1, c: 1, v: 5 },
        },
      ],
      run: {
        id: '2024-10-26:shacharis,main',
        type: LeiningRunType.Main,
        scroll: 'torah',
        aliyot: [],
        leining: {
          id: LeiningInstanceId.Shacharis,
          isParsha: true,
          runs: [],
          date: {
            date: new Date('2024-10-26'),
            id: '2024-10-26',
            title: { en: 'Parshat Bereshit', he: 'פרשת בראשית' },
            leinings: [],
          },
        },
      },
    }),
  )

  const words = [...node.querySelectorAll<HTMLElement>('.word')]
  expect(words.length).toBe(2)
  expect(words[0].dataset.tokenKey).toBe('12:4:0:0')
  expect(
    node.querySelector<HTMLButtonElement>('[data-audio-button="true"]')?.dataset
      .aliyahIndex,
  ).toBe('1')
})

test('renders an aliyah permalink beside aliyah start labels', () => {
  const node = htmlToElement(
    Line({
      pageNumber: 12,
      lineIndex: 4,
      text: [['וַיֹּאמֶר יְהוָה']],
      verses: [{ b: 1, c: 12, v: 14 }],
      isPetucha: false,
      labels: ['שני'],
      aliyot: [],
      aliyahStarts: [
        {
          index: 2,
          start: { scroll: 'torah', b: 1, c: 12, v: 14 },
          end: { scroll: 'torah', b: 1, c: 13, v: 4 },
        },
      ],
      run: {
        id: '2024-11-09:shacharis,main',
        type: LeiningRunType.Main,
        scroll: 'torah',
        aliyot: [],
        leining: {
          id: LeiningInstanceId.Shacharis,
          isParsha: true,
          runs: [],
          date: {
            date: new Date('2024-11-09'),
            id: '2024-11-09',
            title: { en: 'Parshat Lech-Lecha', he: 'פרשת לך לך' },
            leinings: [],
          },
        },
      },
    }),
  )

  const link = node.querySelector<HTMLButtonElement>(
    '[data-aliyah-link="true"]',
  )
  expect(link?.type).toBe('button')
  expect(link?.dataset.aliyahUrl).toBe('#/torah/parsha/lech-lecha/1-12-14')
  expect(link?.getAttribute('aria-label')).toBe('Copy link to שני')
  expect(link?.querySelector('.ui-icon')).not.toBeNull()
})

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

test('preserves different annotated and unannotated word counts in one tree', () => {
  const node = htmlToElement(
    Line({
      pageNumber: 12,
      lineIndex: 4,
      text: [['אָב־בֵּן']],
      verses: [{ b: 1, c: 1, v: 1 }],
      isPetucha: false,
      labels: [],
      aliyot: [],
      aliyahStarts: [],
      run: undefined,
    }),
  )
  const words = [...node.querySelectorAll<HTMLElement>('.word')]

  expect(words).toHaveLength(2)
  expect(words[0].textContent).toBe('אָב־בֵּן')
  expect(words[1].hidden).toBe(true)

  applyAnnotationMode(node, false)

  expect(words[0].textContent).toBe('אב')
  expect(words[1].textContent).toBe('בן')
  expect(words[1].hidden).toBe(false)
})

test('renders Reading as measurable RTL flow with pasuk breaks', () => {
  const node = htmlToElement(
    Line({
      pageNumber: 242,
      lineIndex: 7,
      text: [['הַאֲזִ֥ינוּ הַשָּׁמַ֖יִם וַאֲדַבֵּ֑רָה׃']],
      verses: [{ b: 5, c: 32, v: 1 }],
      focalRef: { b: 5, c: 32, v: 1 },
      isPetucha: false,
      labels: ['ראשון'],
      aliyot: [],
      aliyahStarts: [],
      run: undefined,
      presentation: { layout: 'reading', sides: 'one' },
    }),
  )

  expect(node.matches('[data-class="line"]')).toBe(true)
  expect(node.classList.contains('mod-reading-line')).toBe(true)
  expect(node.querySelectorAll('.reader-pasuk-break')).toHaveLength(1)
  expect(node.querySelector('.reader-text-side')?.getAttribute('dir')).not.toBe(
    'ltr',
  )
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

test('duplicates only the visual occurrence in Two Sided mode', () => {
  const book = document.createElement('section')
  const node = htmlToElement(
    Line({
      pageNumber: 12,
      lineIndex: 4,
      text: [['בְּרֵאשִׁית בָּרָא']],
      verses: [{ b: 1, c: 1, v: 1 }],
      isPetucha: false,
      labels: [],
      aliyot: [],
      aliyahStarts: [],
      run: undefined,
      presentation: { layout: 'match', sides: 'two' },
    }),
  )
  if (!(node instanceof HTMLElement)) {
    throw new Error('Expected Two Sided line to render as an HTML element')
  }
  book.append(node)

  expect(node.querySelectorAll('.reader-text-side')).toHaveLength(2)
  expect(node.querySelectorAll('[data-reader-canonical="true"]')).toHaveLength(
    1,
  )
  expect(node.querySelectorAll('[data-token-key="12:4:0:0"]')).toHaveLength(2)
  expect(collectStartingLineTokenKeys({ book, startLine: node })).toEqual([
    '12:4:0:0',
    '12:4:0:1',
  ])

  applyAnnotationMode(node, false)
  const tikkunWord = node.querySelector<HTMLElement>('.mod-tikkun .word')
  const torahWord = node.querySelector<HTMLElement>('.mod-torah .word')
  expect(tikkunWord?.dataset.annotationsMode).toBe('on')
  expect(torahWord?.dataset.annotationsMode).toBe('off')
  expect(tikkunWord?.textContent?.normalize('NFD')).toMatch(/\p{M}/u)
  expect(torahWord?.textContent?.normalize('NFD')).not.toMatch(/\p{M}/u)
})

test('does not apply the sea template to another book with the same page number', () => {
  const node = htmlToElement(
    Line({
      pageNumber: 78,
      lineIndex: 6,
      text: [['first', 'middle', 'last']],
      verses: [{ b: 1, c: 1, v: 1 }],
      focalRef: { b: 1, c: 1, v: 1 },
      isPetucha: false,
      labels: [],
      aliyot: [],
      aliyahStarts: [],
      run: undefined,
      presentation: { layout: 'match', sides: 'one' },
    }),
  )
  expect(node.hasAttribute('data-shirah-kind')).toBe(false)
  expect(node.querySelector('[style*="--match-shirah-track"]')).toBeNull()
})

test('uses one token and sof-pasuk structure for both Reading sides', () => {
  const node = htmlToElement(
    Line({
      pageNumber: 36,
      lineIndex: 22,
      text: [['מָֽה־אֶעֱשֶׂה לָאֵלֶּה הַיּוֹם׃ וְעַתָּה']],
      verses: [{ b: 1, c: 31, v: 43 }],
      isPetucha: false,
      labels: [],
      aliyot: [],
      aliyahStarts: [],
      run: undefined,
      presentation: { layout: 'reading', sides: 'two' },
    }),
  )
  const tikkunWords = [
    ...node.querySelectorAll<HTMLElement>('.mod-tikkun .word'),
  ]
  const torahWords = [...node.querySelectorAll<HTMLElement>('.mod-torah .word')]

  expect(torahWords.map((word) => word.dataset.tokenKey)).toEqual(
    tikkunWords.map((word) => word.dataset.tokenKey),
  )
  expect(torahWords.map((word) => word.textContent)).toEqual(
    tikkunWords.map((word) =>
      word.textContent?.normalize('NFD').replace(/\p{M}/gu, ''),
    ),
  )
  expect(torahWords[0]?.textContent).toContain('־')
  expect(torahWords[2]?.textContent).toContain('׃')
  expect(
    [...node.querySelectorAll<HTMLElement>('.reader-pasuk-break')].map(
      (breakElement) =>
        (breakElement.previousElementSibling as HTMLElement | null)?.dataset
          .wordIndex,
    ),
  ).toEqual(['2', '2'])
})
