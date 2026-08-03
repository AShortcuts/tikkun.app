import { afterEach, expect, test } from 'vitest'
import { alignSmallSpecialLetters } from './special-letter-layout.ts'

afterEach(() => document.body.replaceChildren())

const measuredAscent = (text: string, style: CSSStyleDeclaration) => {
  const context = document.createElement('canvas').getContext('2d')
  if (!context) throw new Error('Canvas 2D is required for this test')
  context.direction = style.direction === 'rtl' ? 'rtl' : 'ltr'
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  context.textBaseline = 'alphabetic'
  return context.measureText(text).actualBoundingBoxAscent
}

test('aligns a small letter body with its immediate normal-size neighbor', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = `
    <span class="word" style="direction: rtl; font: 40px serif; line-height: 1;">
      ר<span
        class="special-letter mod-small"
        data-special-letter-position="2"
        style="font-size: 50%; line-height: 1; vertical-align: var(--special-letter-baseline-shift, baseline);"
      >א</span>
    </span>
  `
  document.body.appendChild(fixture)

  const word = fixture.querySelector<HTMLElement>('.word')!
  const letter = fixture.querySelector<HTMLElement>('.special-letter')!
  const neighborAscent = measuredAscent('ר', getComputedStyle(word))
  const smallSizeAscent = measuredAscent('א', getComputedStyle(letter))

  expect(alignSmallSpecialLetters(fixture)).toBe(1)

  const appliedShift = Number.parseFloat(
    letter.style.getPropertyValue('--special-letter-baseline-shift')
  )
  expect(appliedShift).toBeCloseTo(neighborAscent - smallSizeAscent, 5)
  expect(appliedShift + smallSizeAscent).toBeCloseTo(neighborAscent, 5)
})

test('uses the lower body top when a small letter has two neighbors', () => {
  const fixture = document.createElement('div')
  fixture.innerHTML = `
    <span class="word" style="direction: rtl; font: 40px serif; line-height: 1;">
      ב<span
        class="special-letter mod-small"
        data-special-letter-position="2"
        style="font-size: 50%; line-height: 1; vertical-align: var(--special-letter-baseline-shift, baseline);"
      >כֹּ</span>ל
    </span>
  `
  document.body.appendChild(fixture)

  const word = fixture.querySelector<HTMLElement>('.word')!
  const letter = fixture.querySelector<HTMLElement>('.special-letter')!
  const neighborAscent = Math.min(
    measuredAscent('ב', getComputedStyle(word)),
    measuredAscent('ל', getComputedStyle(word))
  )
  const smallSizeAscent = measuredAscent('כ', getComputedStyle(letter))

  expect(alignSmallSpecialLetters(fixture)).toBe(1)

  const appliedShift = Number.parseFloat(
    letter.style.getPropertyValue('--special-letter-baseline-shift')
  )
  expect(appliedShift + smallSizeAscent).toBeCloseTo(neighborAscent, 5)
})
