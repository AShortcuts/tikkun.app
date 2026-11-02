import { expect, test } from 'vitest'
import { hexToOklch, oklchToHex } from './oklch-color.ts'

test.each([['#ff0000', 0.627955, 0.257683, 29.233885]] as const)('converts reference sRGB primary %s to OKLCH', (hex, lightness, chroma, hue) => {
  const color = hexToOklch(hex)
  expect(color.lightness).toBeCloseTo(lightness, 5)
  expect(color.chroma).toBeCloseTo(chroma, 5)
  expect(color.hue).toBeCloseTo(hue, 4)
})

test('round-trips saved colors without changing any hex channel', () => {
  const colors = ['#eee6d6', '#3b3026', '#fcfcfd', '#191c22', '#f8f7f3', '#e6ede5', '#233a2c', '#233344', '#e5edf4', '#f2e5e2', '#563a3e', '#ABCDEF']
  for (let r = 0; r <= 255; r += 17) {
    for (let g = 0; g <= 255; g += 17) {
      for (let b = 0; b <= 255; b += 17) {
        colors.push('#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''))
      }
    }
  }
  for (const hex of colors) expect(oklchToHex(hexToOklch(hex)), hex).toBe(hex.toLowerCase())
})

test('reduces out-of-gamut chroma without shifting hue or lightness', () => {
  for (const lightness of [0.25, 0.5, 0.8]) {
    for (let hue = 0; hue < 360; hue += 30) {
      const fitted = hexToOklch(oklchToHex({ lightness, chroma: 0.4, hue }))
      expect(fitted.lightness).toBeCloseTo(lightness, 2)
      expect(fitted.chroma).toBeLessThan(0.4)
      const hueDistance = Math.abs(((fitted.hue - hue + 540) % 360) - 180)
      expect(hueDistance).toBeLessThan(2)
    }
  }
})

test('rejects invalid inputs and wraps the hue seam', () => {
  expect(() => hexToOklch('not-a-color')).toThrow('Invalid sRGB')
  expect(() => oklchToHex({ lightness: NaN, chroma: 0.1, hue: 90 })).toThrow('Invalid OKLCH')
  const color = { lightness: 0.7, chroma: 0.1, hue: 0 }
  expect(oklchToHex({ ...color, hue: 360 })).toBe(oklchToHex(color))
  expect(oklchToHex({ ...color, hue: -30 })).toBe(oklchToHex({ ...color, hue: 330 }))
})
