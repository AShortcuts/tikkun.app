import { readFileSync } from 'node:fs'
import test from 'ava'

const pageCss = readFileSync(new URL('../../css/page.css', import.meta.url), 'utf8')
const readerEnhancementsCss = readFileSync(
  new URL('../../css/reader-enhancements.css', import.meta.url),
  'utf8'
)
const lineComponent = readFileSync(new URL('./Line.ts', import.meta.url), 'utf8')

test('centers line content with a structural balance rail instead of nudge offsets', (t) => {
  t.true(pageCss.includes('--line-side-balance-width'))
  t.true(pageCss.includes('--verse-gutter-text-gap: 1ch'))
  t.regex(
    pageCss,
    /--line-side-balance-width:\s*calc\(\s*var\(--verse-column-width\)\s*\+\s*var\(--verse-gutter-text-gap\)\s*\+\s*var\(--aliyah-column-width\)\s*\);/
  )
  t.false(pageCss.includes('--tikkun-inline-gutter'))
  t.false(pageCss.includes('--tikkun-table-max-width'))
  t.false(pageCss.includes('--line-content-nudge'))
  t.false(pageCss.includes('--line-content-shift'))
  t.false(pageCss.includes('line-content-compensation-width'))
})

test('keeps the desktop reader column centered in the app body', (t) => {
  t.true(readerEnhancementsCss.includes('--reader-side-rail-width: 80px'))
  t.true(readerEnhancementsCss.includes('@media screen and (max-width: 1200px)'))
  t.regex(
    readerEnhancementsCss,
    /grid-template-columns:\s*var\(--reader-side-rail-width\)\s+minmax\(0,\s*1fr\)\s+var\(--reader-side-rail-width\);/
  )
  t.true(readerEnhancementsCss.includes('--reader-side-rail-width: 48px'))
  t.true(readerEnhancementsCss.includes('--reader-side-rail-width: 24px'))
})

test('uses the intended tikkun page responsive breakpoints', (t) => {
  t.true(pageCss.includes('@media screen and (max-width: 1150px)'))
  t.true(pageCss.includes('@media screen and (max-width: 1050px)'))
  t.true(pageCss.includes('@media screen and (max-width: 850px)'))
  t.false(pageCss.includes('@media screen and (max-width: 1100px)'))
  t.false(pageCss.includes('@media screen and (max-width: 950px)'))
  t.false(pageCss.includes('@media screen and (max-width: 800px)'))
})

test('keeps verse numbers offscreen for the mobile pull gutter', (t) => {
  const aliyotCollapseIndex = pageCss.indexOf('@media screen and (max-width: 530px)')
  const versesCollapseIndex = pageCss.indexOf('@media screen and (max-width: 430px)')

  t.not(aliyotCollapseIndex, -1)
  t.not(versesCollapseIndex, -1)
  t.regex(
    pageCss,
    /@media screen and \(max-width:\s*430px\)\s*{[\s\S]*?grid-template-columns:\s*0\s+minmax\(0,\s*1fr\)\s+0;[\s\S]*?\.line-gutter\.mod-verses\s*{[\s\S]*?grid-column:\s*3;[\s\S]*?overflow:\s*visible;[\s\S]*?\.location-indicator\.mod-verses\s*{[\s\S]*?transform:\s*translateX\(0\.45rem\);/
  )
  t.false(
    /@media screen and \(max-width:\s*430px\)\s*{[\s\S]*?\.line-gutter\.mod-verses,[\s\S]*?\.location-indicator\.mod-verses[\s\S]*?display:\s*none;/.test(
      pageCss
    )
  )
  t.false(
    /@media screen and \(max-width:\s*430px\)\s*{[\s\S]*?\.tikkun-page table\s*{[\s\S]*?width:\s*100%;/.test(
      pageCss
    )
  )
  t.false(pageCss.includes('--verse-column-width: 0ch'))
})

test('lets long verse labels overflow toward the side gutter', (t) => {
  t.regex(
    pageCss,
    /\.line-gutter\.mod-verses\s*{[\s\S]*?justify-content:\s*flex-start;[\s\S]*?padding-left:\s*var\(--verse-gutter-text-gap\);/
  )
  t.regex(
    pageCss,
    /\.location-indicator\.mod-verses\s*{[\s\S]*?text-align:\s*right;[\s\S]*?white-space:\s*nowrap;/
  )
  t.false(pageCss.includes('overflow-wrap: anywhere'))
  t.false(pageCss.includes('max-width: calc(var(--verse-column-width) - 1ch)'))
  t.regex(
    pageCss,
    /@media screen and \(max-width:\s*430px\)\s*{[\s\S]*?--verse-gutter-text-gap:\s*0ch;/
  )
})

test('keeps aliyah audio buttons out of side-label flow', (t) => {
  const baseSideButtonIndex = pageCss.indexOf('.aliyah-badge .aliyah-audio-button')
  const constrainedSideButtonIndex = pageCss.indexOf(
    '@media screen and (max-width: 850px)',
    baseSideButtonIndex
  )

  t.true(lineComponent.includes("mod-with-audio"))
  t.true(pageCss.includes('.aliyah-badge.mod-with-audio'))
  t.not(baseSideButtonIndex, -1)
  t.not(constrainedSideButtonIndex, -1)
  t.true(constrainedSideButtonIndex > baseSideButtonIndex)
  t.regex(
    pageCss,
    /\.aliyah-badge \.aliyah-audio-button\s*{[\s\S]*?position:\s*absolute;[\s\S]*?transform:\s*translateY\(-50%\);/
  )
  t.regex(
    pageCss,
    /@media screen and \(max-width:\s*850px\)\s*{[\s\S]*?\.aliyah-badge \.aliyah-audio-button\s*{[\s\S]*?top:\s*calc\(100% \+ 0\.22rem\);[\s\S]*?transform:\s*none;/
  )
  t.false(/(?:^|\n)\.aliyah-audio-button\s*{[^}]*position:\s*absolute;/.test(pageCss))
  t.false(pageCss.includes('grid-row: 2'))
})
