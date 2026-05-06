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
  t.regex(
    pageCss,
    /--line-side-balance-width:\s*calc\(\s*var\(--verse-column-width\)\s*\+\s*var\(--aliyah-column-width\)\s*\);/
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

test('keeps verse numbers after aliyah labels collapse', (t) => {
  const aliyotCollapseIndex = pageCss.indexOf('@media screen and (max-width: 530px)')
  const versesCollapseIndex = pageCss.indexOf('@media screen and (max-width: 430px)')

  t.not(aliyotCollapseIndex, -1)
  t.not(versesCollapseIndex, -1)
  t.true(versesCollapseIndex > aliyotCollapseIndex)
  t.regex(
    pageCss,
    /@media screen and \(max-width:\s*430px\)\s*{[\s\S]*?\.line-gutter\.mod-verses,[\s\S]*?\.location-indicator\.mod-verses[\s\S]*?display:\s*none;/
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
