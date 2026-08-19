import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

type ManifestIcon = {
  src: string
  sizes: string
  type: string
  purpose?: string
}

const manifest = JSON.parse(
  readFileSync(new URL('../site/manifest.webmanifest', import.meta.url), 'utf8')
) as {
  name?: string
  background_color?: string
  theme_color?: string
  icons?: ManifestIcon[]
}

function iconForSize(size: number) {
  return manifest.icons?.find((icon) => icon.sizes === `${size}x${size}`)
}

test('ships the required installable PNG icon sizes', () => {
  for (const size of [192, 512]) {
    const icon = iconForSize(size)
    expect(icon).toMatchObject({ type: 'image/png' })

    const png = readFileSync(new URL(`../site/${icon?.src}`, import.meta.url))
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(size)
    expect(png.readUInt32BE(20)).toBe(size)
  }

  expect(iconForSize(512)?.purpose?.split(/\s+/)).toContain('maskable')
})

test('aligns installed-app branding and launch colors with Home', () => {
  expect(manifest).toMatchObject({
    name: 'Tikkun Korim',
    background_color: '#06080b',
    theme_color: '#06080b',
  })
})
