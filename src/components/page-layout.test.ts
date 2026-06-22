import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const pageCss = readFileSync(new URL('../../css/page.css', import.meta.url), 'utf8')
const readerEnhancementsCss = readFileSync(
  new URL('../../css/reader-enhancements.css', import.meta.url),
  'utf8'
)
const lineComponent = readFileSync(new URL('./Line.ts', import.meta.url), 'utf8')

test('centers line content with a structural balance rail instead of nudge offsets', () => {
  expect(pageCss.includes('--line-side-balance-width')).toBe(true)
  expect(pageCss.includes('--verse-gutter-text-gap: 1ch')).toBe(true)
  expect(pageCss).toMatch(/--line-side-balance-width:\s*calc\(\s*var\(--verse-column-width\)\s*\+\s*var\(--verse-gutter-text-gap\)\s*\+\s*var\(--aliyah-column-width\)\s*\);/)
  expect(pageCss.includes('--tikkun-inline-gutter')).toBe(false)
  expect(pageCss.includes('--tikkun-table-max-width')).toBe(false)
  expect(pageCss.includes('--line-content-nudge')).toBe(false)
  expect(pageCss.includes('--line-content-shift')).toBe(false)
  expect(pageCss.includes('line-content-compensation-width')).toBe(false)
})

test('keeps the desktop reader column centered in the app body', () => {
  expect(readerEnhancementsCss.includes('--reader-side-rail-width: 80px')).toBe(true)
  expect(readerEnhancementsCss.includes('@media screen and (max-width: 1250px)')).toBe(true)
  expect(readerEnhancementsCss).toMatch(/grid-template-columns:\s*var\(--reader-side-rail-width\)\s+minmax\(0,\s*1fr\)\s+var\(--reader-side-rail-width\);/)
  expect(readerEnhancementsCss.includes('--reader-side-rail-width: 48px')).toBe(true)
  expect(readerEnhancementsCss.includes('--reader-side-rail-width: 24px')).toBe(true)
})

test('uses the intended tikkun page responsive breakpoints', () => {
  expect(pageCss.includes('@media screen and (max-width: 1180px)')).toBe(true)
  expect(pageCss.includes('@media screen and (max-width: 1120px)')).toBe(true)
  expect(pageCss.includes('@media screen and (max-width: 870px)')).toBe(true)
  expect(pageCss.includes('@media screen and (max-width: 385px)')).toBe(true)
  expect(pageCss.includes('@media screen and (max-width: 1150px)')).toBe(false)
  expect(pageCss.includes('@media screen and (max-width: 1050px)')).toBe(false)
  expect(pageCss.includes('@media screen and (max-width: 850px)')).toBe(false)
})

test('keeps verse numbers offscreen for the mobile pull gutter', () => {
  const aliyotCollapseIndex = pageCss.indexOf('@media screen and (max-width: 550px)')
  const versesCollapseIndex = pageCss.indexOf('@media screen and (max-width: 455px)')

  expect(aliyotCollapseIndex).not.toBe(-1)
  expect(versesCollapseIndex).not.toBe(-1)
  expect(pageCss).toMatch(/@media screen and \(max-width:\s*455px\)\s*{[\s\S]*?grid-template-columns:\s*0\s+minmax\(0,\s*1fr\)\s+0;[\s\S]*?\.line-gutter\.mod-verses\s*{[\s\S]*?grid-column:\s*3;[\s\S]*?overflow:\s*visible;[\s\S]*?\.location-indicator\.mod-verses\s*{[\s\S]*?transform:\s*translateX\(0\.45rem\);/)
  expect(/@media screen and \(max-width:\s*455px\)\s*{[\s\S]*?\.line-gutter\.mod-verses,[\s\S]*?\.location-indicator\.mod-verses[\s\S]*?display:\s*none;/.test(
      pageCss
    )).toBe(false)
  expect(/@media screen and \(max-width:\s*455px\)\s*{[\s\S]*?\.tikkun-page table\s*{[\s\S]*?width:\s*100%;/.test(
      pageCss
    )).toBe(false)
  expect(pageCss.includes('--verse-column-width: 0ch')).toBe(false)
})

test('lets long verse labels overflow toward the side gutter', () => {
  expect(pageCss).toMatch(/\.line-gutter\.mod-verses\s*{[\s\S]*?justify-content:\s*flex-start;[\s\S]*?padding-left:\s*var\(--verse-gutter-text-gap\);/)
  expect(pageCss).toMatch(/\.location-indicator\.mod-verses\s*{[\s\S]*?text-align:\s*right;[\s\S]*?white-space:\s*nowrap;/)
  expect(pageCss.includes('overflow-wrap: anywhere')).toBe(false)
  expect(pageCss.includes('max-width: calc(var(--verse-column-width) - 1ch)')).toBe(false)
  expect(pageCss).toMatch(/@media screen and \(max-width:\s*455px\)\s*{[\s\S]*?--verse-gutter-text-gap:\s*0ch;/)
})

test('keeps aliyah audio buttons out of side-label flow', () => {
  const baseSideButtonIndex = pageCss.indexOf('.aliyah-badge .aliyah-audio-button')
  const constrainedSideButtonIndex = pageCss.indexOf(
    '@media screen and (max-width: 870px)',
    baseSideButtonIndex
  )

  expect(lineComponent.includes("mod-with-audio")).toBe(true)
  expect(pageCss.includes('.aliyah-badge.mod-with-audio')).toBe(true)
  expect(baseSideButtonIndex).not.toBe(-1)
  expect(constrainedSideButtonIndex).not.toBe(-1)
  expect(constrainedSideButtonIndex > baseSideButtonIndex).toBe(true)
  expect(pageCss).toMatch(/\.aliyah-badge \.aliyah-audio-button\s*{[\s\S]*?position:\s*absolute;[\s\S]*?transform:\s*translateY\(-50%\);/)
  expect(pageCss).toMatch(/@media screen and \(max-width:\s*870px\)\s*{[\s\S]*?\.aliyah-badge \.aliyah-audio-button\s*{[\s\S]*?top:\s*calc\(100% \+ 0\.22rem\);[\s\S]*?transform:\s*none;/)
  expect(/(?:^|\n)\.aliyah-audio-button\s*{[^}]*position:\s*absolute;/.test(pageCss)).toBe(false)
  expect(pageCss.includes('grid-row: 2')).toBe(false)
})
