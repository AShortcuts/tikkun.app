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
