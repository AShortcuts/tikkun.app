import { expect, test } from 'vitest'
import { hexToOklch, oklchToHex, oklchGradient, editorChromaMax } from './oklch-color.ts'

test.each([
  ['#ff0000', 0.627955, 0.257683, 29.233885],
  ['#00ff00', 0.866440, 0.294827, 142.495339],
  ['#0000ff', 0.452014, 0.313214, 264.052021],
] as const)('converts reference sRGB primary %s to OKLCH', (hex, lightness, chroma, hue) => {
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

test('keeps neutral colors achromatic and lightness endpoints exact', () => {
  for (let value = 0; value <= 255; value++) {
    const hex = '#' + value.toString(16).padStart(2, '0').repeat(3)
    expect(hexToOklch(hex).chroma).toBe(0)
    expect(oklchToHex({ ...hexToOklch(hex), hue: 280 })).toBe(hex)
  }
  expect(oklchToHex({ lightness: 0, chroma: 0.4, hue: 120 })).toBe('#000000')
  expect(oklchToHex({ lightness: 1, chroma: 0.4, hue: 120 })).toBe('#ffffff')
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

test('keeps hue changes at the selected perceptual lightness', () => {
  const original = hexToOklch('#eee6d6')
  for (let hue = 0; hue <= 360; hue += 15) {
    const changed = hexToOklch(oklchToHex({ ...original, hue }))
    expect(changed.lightness).toBeCloseTo(original.lightness, 2)
  }
})

test('gradient stops use the same displayable colors as the sliders', () => {
  const original = { lightness: 0.7, chroma: 0.15, hue: 200 }
  for (const channel of ['lightness', 'chroma', 'hue'] as const) {
    const gradient = oklchGradient(original, channel)
    const stops = gradient.match(/#[0-9a-f]{6}/g)!
    expect(stops).toHaveLength(13)
    expect(stops[0]).toBe(oklchToHex({ ...original, [channel]: 0 }))
  }
  expect(oklchGradient(original, 'lightness')).toContain('#000000')
  expect(oklchGradient(original, 'lightness')).toContain('#ffffff')
})

test('adapts the chroma range for pale colors without discarding draft intent', () => {
  const paper = hexToOklch('#eee6d6')
  const maximum = editorChromaMax(paper)
  expect(maximum).toBeGreaterThan(paper.chroma)
  expect(maximum).toBeLessThan(0.1)
  expect(editorChromaMax({ ...paper, chroma: 0.3 })).toBe(0.3)
  const stops = oklchGradient(paper, 'chroma').match(/#[0-9a-f]{6}/g)!
  expect(new Set(stops).size).toBe(13)
})

test('rejects invalid inputs and wraps the hue seam', () => {
  expect(() => hexToOklch('not-a-color')).toThrow('Invalid sRGB')
  expect(() => oklchToHex({ lightness: NaN, chroma: 0.1, hue: 90 })).toThrow('Invalid OKLCH')
  const color = { lightness: 0.7, chroma: 0.1, hue: 0 }
  expect(oklchToHex({ ...color, hue: 360 })).toBe(oklchToHex(color))
  expect(oklchToHex({ ...color, hue: -30 })).toBe(oklchToHex({ ...color, hue: 330 }))
})
