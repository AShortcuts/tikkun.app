import { expect, test } from 'vitest'
import {
  LeiningInstanceId,
  LeiningRunType,
} from '../calendar-model/model-types.ts'
import utils from './utils.ts'
import Line from './Line.ts'

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
    })
  )

  const words = [...node.querySelectorAll<HTMLElement>('.word')]
  expect(words.length).toBe(4)
  expect(words[0].dataset.tokenKey).toBe('12:4:0:0')
  expect(
    node.querySelector<HTMLButtonElement>('[data-audio-button="true"]')
      ?.dataset.aliyahIndex
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
    })
  )

  const link = node.querySelector<HTMLButtonElement>('[data-aliyah-link="true"]')
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
    })
  )

  const words = [...node.querySelectorAll<HTMLElement>('.word')]
  expect(words.length).toBe(4)
  expect(words[0].dataset.tokenKey).toBe('12:4:0:0')
  expect(words[0].textContent).toBe('וְכֹ֣ל ׀')
  expect(words[1].dataset.tokenKey).toBe('12:4:0:1')
  expect(words[1].textContent).toBe('רוֹמֵ֣שׂ')
})

test('keeps a small letter inside the same word token in both display modes', () => {
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
    })
  )

  const annotatedWord = node.querySelector<HTMLElement>(
    '.fragment.mod-annotations-on .word[data-word-index="1"]'
  )
  const unannotatedWord = node.querySelector<HTMLElement>(
    '.fragment.mod-annotations-off .word[data-word-index="1"]'
  )
  const annotatedLetter = annotatedWord?.querySelector<HTMLElement>(
    '.special-letter.mod-small'
  )
  const unannotatedLetter = unannotatedWord?.querySelector<HTMLElement>(
    '.special-letter.mod-small'
  )

  expect(node.querySelectorAll('.word')).toHaveLength(4)
  expect(annotatedWord?.dataset.tokenKey).toBe('2:20:0:1')
  expect(unannotatedWord?.dataset.tokenKey).toBe('2:20:0:1')
  expect(annotatedWord?.textContent).toBe('בְּהִבָּֽרְאָ֑ם')
  expect(unannotatedWord?.textContent).toBe('בהבראם')
  expect(annotatedLetter?.textContent).toBe('הִ')
  expect(unannotatedLetter?.textContent).toBe('ה')
  expect(annotatedLetter?.dataset.specialLetterId).toBe(
    'genesis-2-4-small-he'
  )
  expect(annotatedLetter?.dataset.specialLetterPosition).toBe('2')
  expect(unannotatedLetter?.dataset.specialLetterId).toBe(
    'genesis-2-4-small-he'
  )
  expect(unannotatedLetter?.dataset.specialLetterPosition).toBe('2')
})
