export type OklchColor = {
  lightness: number
  chroma: number
  hue: number
}

export const MAX_EDITOR_CHROMA = 0.4
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))
const wrapHue = (hue: number) => ((hue % 360) + 360) % 360

// OKLab's published sRGB matrices: https://bottosson.github.io/posts/oklab/
export function hexToOklch(hex: string): OklchColor {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid sRGB hex color: ${hex}`)
  const [red, green, blue] = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const chroma = Math.hypot(a, b)
  return {
    lightness: clamp(lightness, 0, 1),
    chroma: chroma < 0.000001 ? 0 : chroma,
    hue: chroma < 0.000001 ? 0 : wrapHue(Math.atan2(b, a) * 180 / Math.PI),
  }
}

function linearRgb({ lightness, chroma, hue }: OklchColor) {
  const radians = hue * Math.PI / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const inSrgb = (rgb: number[]) =>
  rgb.every((channel) => channel >= -0.0000001 && channel <= 1.0000001)

function fittedChroma(color: OklchColor) {
  if (inSrgb(linearRgb(color))) return color.chroma
  let low = 0
  let high = color.chroma
  for (let iteration = 0; iteration < 20; iteration++) {
    const chroma = (low + high) / 2
    if (inSrgb(linearRgb({ ...color, chroma }))) low = chroma
    else high = chroma
  }
  return low
}

export function editorChromaMax(color: OklchColor) {
  // Use the available range, retaining an existing draft above the gamut edge.
  return Math.max(0.001, color.chroma, fittedChroma({ ...color, chroma: MAX_EDITOR_CHROMA }))
}

export function oklchToHex(color: OklchColor): string {
  if (!Object.values(color).every(Number.isFinite)) throw new Error('Invalid OKLCH color')
  const normalized = {
    lightness: clamp(color.lightness, 0, 1),
    chroma: clamp(color.chroma, 0, MAX_EDITOR_CHROMA),
    hue: wrapHue(color.hue),
  }
  if (normalized.lightness === 0) return '#000000'
  if (normalized.lightness === 1) return '#ffffff'
  // Keep hue and lightness fixed; reduce only chroma to fit saved sRGB hex.
  const rgb = linearRgb({ ...normalized, chroma: fittedChroma(normalized) })
  return '#' + rgb.map((channel) => {
    const value = clamp(channel, 0, 1)
    const encoded = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055
    return Math.round(encoded * 255).toString(16).padStart(2, '0')
  }).join('')
}

export function oklchGradient(color: OklchColor, channel: keyof OklchColor) {
  const maximum = channel === 'hue' ? 360 : channel === 'chroma' ? editorChromaMax(color) : 1
  const stops = Array.from({ length: 13 }, (_, index) =>
    oklchToHex({ ...color, [channel]: maximum * index / 12 }),
  )
  return `linear-gradient(to right, ${stops.join(', ')})`
}
