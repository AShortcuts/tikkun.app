import { expect, test } from 'vitest'
import { iconMarkup } from './icons.ts'

test('keeps every horizontal arrow alias on the historical full-stem icons', () => {
  expect(iconMarkup('arrowRight')).toBe(iconMarkup('previous'))
  expect(iconMarkup('arrowLeft')).toBe(iconMarkup('next'))
  expect(iconMarkup('chevronLeft')).toBe(iconMarkup('arrowLeft'))
  expect(iconMarkup('arrowRight')).toContain('M5 12h14')
  expect(iconMarkup('arrowLeft')).toContain('M19 12H5')
})

test('renders the mobile home icon as a filled house', () => {
  expect(iconMarkup('houseFilled')).toContain('fill="currentColor"')
  expect(iconMarkup('houseFilled')).toContain('stroke="none"')
  expect(iconMarkup('houseFilled')).not.toContain('stroke-width')
  expect(iconMarkup('houseFilled')).toContain('M4.5 10.25 12 3.75l7.5 6.5')
})

test('renders play and pause as solid media controls', () => {
  expect(iconMarkup('play')).toContain('fill="currentColor"')
  expect(iconMarkup('pause')).toContain('x="6.5"')
  expect(iconMarkup('pause')).toContain('x="13.25"')
  expect(iconMarkup('pause')).not.toContain('<path')
})
