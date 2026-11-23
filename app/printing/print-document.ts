import { asset } from '$app/paths'
import Page from '../components/Page.ts'
import { applyReaderPageLayout } from '../components/reader-page-layout.ts'
import type { PrintOptions } from './print-model.ts'
import { loadPrintPassage, passageRangesLabel, paperSize } from './print-model.ts'
import { compareRefs } from '../calendar-model/ref-utils.ts'
import type { ReaderPagePresentation } from '../reader-presentation.ts'
import { findDivineNames, replacePrintDivineNames } from './print-divine-names.ts'
import { joinReadingTitle, printColumnNumbers, printDetailsTitles } from './print-details.ts'

/** Match at 0% Scaling shows only the bare columns and cannot print. */
const hiddenByScaling = (options: PrintOptions) => options.layout === 'match' && options.scaling === 0

function createBook(options: PrintOptions) {
  const book = document.createElement('div')
  book.className = 'tikkun-book print-book'
  book.dataset.readerLayout = options.layout
  book.dataset.readerSides = 'two'
  book.dataset.printSides = options.sides
  book.dataset.printForm = options.form
  book.dataset.printVerseNumbers = String(options.verseNumbers)
  // Fit Match once at the same column width; orientation only changes the paper.
  book.style.width = `${paperSize(options.layout === 'match' ? 'portrait' : options.orientation).width - 96}px`
  book.style.setProperty('--print-font-size', `${options.layout === 'match' ? 21 : options.fontSize}px`)
  book.style.setProperty('--print-pasuk-spacing', `${options.pasukSpacing}px`)
  return book
}

type Bilingual = { he: string; en: string }
/** What page 1's masthead shows; later pages repeat only the name and aliyot. */
type Masthead = { name: Bilingual; aliyot: Bilingual; columnLabel: string; columns: string; range: Bilingual }
/** Later pages' running head keeps the old heading's height, so their text area is unchanged. */
const RUNNING_HEAD_HEIGHT = 45

function mastheadContent(options: PrintOptions, columnNumbers: number[]): Masthead {
  // A reading chosen by name carries its title; a passage chosen by verse is named from what it covers.
  const titles = printDetailsTitles(options.ranges)
  const join = (parts: Bilingual[], separator: string) => ({ he: parts.map(part => part.he).join(separator), en: parts.map(part => part.en).join(separator) })
  const scroll = options.ranges[0].start.scroll === 'esther' ? 'Megillah' : 'Torah'
  return {
    name: options.title?.name ?? join(titles, ' · '),
    aliyot: options.title?.aliyot ?? { he: '', en: '' },
    columnLabel: `${scroll} ${new Set(columnNumbers).size === 1 ? 'column' : 'columns'}`,
    columns: printColumnNumbers(columnNumbers),
    range: { he: passageRangesLabel(options.ranges), en: passageRangesLabel(options.ranges, 'en') },
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, ...children: (Node | string)[]) {
  const node = document.createElement(tag)
  if (className) node.className = className
  node.append(...children)
  return node
}

function bidiText(text: string, language: 'he' | 'en', className = '') {
  const node = element('bdi', className, text)
  node.lang = language
  node.dir = language === 'he' ? 'rtl' : 'ltr'
  return node
}

/** English on the left of the slash and Hebrew on the right, as in "Aliyah 3 / שלישי". */
function bilingualPair(text: Bilingual) {
  const parts = [text.en && bidiText(text.en, 'en'), text.he && bidiText(text.he, 'he')].filter(part => part !== '')
  if (!parts.length) return []
  const pair = element('span', 'masthead-pair', parts[0])
  if (parts[1]) pair.append(element('span', 'masthead-slash', '/'), parts[1])
  return [pair]
}

/**
 * Page 1's masthead. Each half sits on one side of the fold: English to the
 * left of the center line, Hebrew to the right, so nothing is printed on it.
 */
function createMasthead(masthead: Masthead) {
  const header = element('header', 'paper-heading paper-masthead')
  header.dir = 'ltr'
  const rule = () => element('span', 'masthead-rule')
  const names = element('div', 'masthead-names',
    element('div', 'masthead-half', rule(), bidiText(masthead.name.en, 'en', 'masthead-name')),
    element('div', 'masthead-half', bidiText(masthead.name.he, 'he', 'masthead-name'), rule()))
  const columns = element('span', 'masthead-columns', `${masthead.columnLabel} `, element('b', '', masthead.columns))
  const details = element('div', 'masthead-details',
    element('div', 'masthead-half', columns, ...bilingualPair(masthead.aliyot)),
    element('div', 'masthead-half', ...bilingualPair(masthead.range)))
  header.append(names, details)
  return header
}

/** Shrinks both names together until each fits its half beside a short rule. */
function fitMastheadNames(header: HTMLElement) {
  const names = [...header.querySelectorAll<HTMLElement>('.masthead-name')]
  const overflows = () => names.some(name => {
    const half = name.parentElement!
    const rule = half.querySelector<HTMLElement>('.masthead-rule')!
    return rule.getBoundingClientRect().width < 24 || name.scrollWidth > name.clientWidth + 0.5
  })
  for (let scale = 1; scale >= 0.55 && overflows(); scale -= 0.03) {
    header.style.setProperty('--masthead-name-scale', scale.toFixed(2))
  }
  // A name still too long at the smallest size wraps within its half.
  if (overflows()) header.classList.add('mod-wrapped-names')
}

function createRunningHead(masthead: Masthead) {
  const title = joinReadingTitle({ name: masthead.name, aliyot: masthead.aliyot })
  const header = element('header', 'paper-heading paper-running-head',
    element('div', 'masthead-half', bidiText(title.en, 'en')),
    element('div', 'masthead-half', bidiText(title.he, 'he')))
  header.dir = 'ltr'
  return header
}

function newSheet(root: HTMLElement, options: PrintOptions, pageIndex: number, masthead: Masthead) {
  const sheet = document.createElement('article')
  sheet.className = 'paper-sheet'
  sheet.dataset.pageKind = 'reading'
  sheet.setAttribute('aria-label', `Printed page ${pageIndex + 1}`)
  const invocation = document.createElement('div')
  invocation.className = 'paper-invocation'
  invocation.lang = 'he'
  invocation.dir = 'rtl'
  const heading = pageIndex === 0 ? createMasthead(masthead) : createRunningHead(masthead)
  const forms = document.createElement('div')
  forms.className = `paper-forms ${options.sides === 'two' ? 'paired' : ''}`
  for (const form of options.sides === 'two' ? ['torah', 'tikkun'] : [options.form]) {
    const label = document.createElement('span')
    label.dataset.printForm = form
    label.textContent = form === 'torah' ? options.ranges[0].start.scroll === 'esther' ? 'Megillah' : 'Torah' : 'Tikkun'
    forms.append(label)
  }
  const body = document.createElement('div')
  body.className = 'paper-body'
  const footer = document.createElement('footer')
  footer.className = 'paper-footer'
  const signature = document.createElement('div')
  signature.className = 'paper-signature'
  signature.dir = 'ltr'
  const signatureText = document.createElement('div')
  signatureText.className = 'paper-signature-text'
  const brand = document.createElement('div')
  brand.className = 'paper-brand'
  const logo = document.createElement('img')
  logo.src = asset('/favicon.svg')
  logo.alt = ''
  logo.width = 26
  logo.height = 26
  brand.textContent = 'Tikkun Reader'
  const website = document.createElement('a')
  website.href = 'https://tikkunreader.com'
  website.target = '_blank'
  website.rel = 'noopener noreferrer'
  website.textContent = 'tikkunreader.com'
  signatureText.append(brand, website)
  signature.append(logo, signatureText)
  const pageNumber = document.createElement('span')
  pageNumber.className = 'paper-number'
  const sacredNotice = document.createElement('p')
  sacredNotice.className = 'paper-sacred-notice'
  sacredNotice.lang = 'en'
  sacredNotice.dir = 'ltr'
  sacredNotice.textContent = 'The text on this page contains sacred literature. Please do not deface or discard.'
  if (!options.removeCredits) footer.append(signature)
  if (options.pageNumbers) footer.append(pageNumber)
  footer.append(sacredNotice)
  if (hiddenByScaling(options)) sheet.append(body)
  else {
    sheet.append(invocation, heading, forms, body, footer)
  }
  root.append(sheet)
  if (heading.classList.contains('paper-masthead') && !hiddenByScaling(options)) fitMastheadNames(heading)
  return body
}

/** How much taller page 1's masthead is than later pages' running head. */
function mastheadExtraHeight(root: HTMLElement, options: PrintOptions, masthead: Masthead) {
  if (hiddenByScaling(options)) return 0
  newSheet(root, options, 0, masthead)
  const sheet = root.lastElementChild as HTMLElement
  const height = sheet.querySelector<HTMLElement>('.paper-masthead')!.getBoundingClientRect().height
  sheet.remove()
  return Math.max(0, height - RUNNING_HEAD_HEIGHT)
}

function alignColumnHeadings(body: HTMLElement, book: HTMLElement, options: PrintOptions) {
  const forms = body.parentElement!.querySelector<HTMLElement>('.paper-forms')
  if (!forms) return
  const left = forms.getBoundingClientRect().left
  const columnSelector = options.layout === 'reading' ? '.reader-reading-page-side' : '.reader-text-side'
  for (const label of forms.querySelectorAll<HTMLElement>('[data-print-form]')) {
    const column = book.querySelector<HTMLElement>(`${columnSelector}.mod-${label.dataset.printForm}`)!.getBoundingClientRect()
    label.style.left = `${column.left + column.width / 2 - left}px`
  }
}

function alignFooter(body: HTMLElement, book: HTMLElement, options: PrintOptions) {
  const sheet = body.parentElement!
  const footer = sheet.querySelector<HTMLElement>('.paper-footer')
  if (!footer) return
  const content = options.layout === 'match' && options.sides === 'one'
    ? book.querySelector<HTMLElement>(`.reader-text-side.mod-${options.form}`)!
    : book
  const bounds = content.getBoundingClientRect()
  const sheetBounds = sheet.getBoundingClientRect()
  // Preserve the footer's proportions when a narrow column leaves less room.
  const scale = Math.min(1, bounds.width / 520)
  footer.style.left = `${bounds.left - sheetBounds.left}px`
  footer.style.width = `${bounds.width / scale}px`
  footer.style.transform = `scale(${scale})`
}

export async function renderPrintDocument(root: HTMLElement, options: PrintOptions, isCurrent: () => boolean) {
  const { pages, selected, selectedUnannotated, words } = await loadPrintPassage(options.ranges)
  await Promise.all(['21px ShlomosemiStam', 'italic 16px "Crimson Pro"', '16px "Crimson Pro"', 'bold 16px "Frank Ruhl Libre"']
    .map(font => document.fonts.load(font, font.includes('Frank') ? 'אב' : undefined)))
  await document.fonts.ready
  if (!isCurrent()) return null
  const paper = paperSize(options.orientation)
  document.documentElement.dataset.readerSideOrder = 'tikkun-right'
  document.documentElement.style.setProperty('--paper-width', `${paper.width}px`)
  document.documentElement.style.setProperty('--paper-height', `${paper.height}px`)
  root.replaceChildren()
  const stage = createBook(options)
  stage.classList.add('measurement-stage')
  root.append(stage)
  const presentation: ReaderPagePresentation = { layout: options.layout, sides: 'two' }
  for (const page of pages) {
    const section = document.createElement('section')
    section.className = 'tikkun-page'
    const visiblePage = options.layout === 'reading' ? {
      ...page,
      lines: page.lines.map(line => ({ ...line, verses: line.verses.filter(ref => options.ranges.some(({ start, end }) => compareRefs(start, ref) <= 0 && compareRefs(ref, end) <= 0)) })),
    } : page
    const printablePage = options.replaceDivineNames ? {
      ...visiblePage,
      lines: visiblePage.lines.map(line => ({ ...line, text: line.text.map(column => column.map(replacePrintDivineNames)) })),
    } : visiblePage
    section.innerHTML = Page(printablePage, { presentation, annotationsEnabled: options.form === 'tikkun' })
    stage.append(section)
  }
  // Match with surrounding text prints whole columns; otherwise only the passage's words print.
  const printedNames = findDivineNames(words).filter(name => (options.layout === 'match' && options.surrounding) || selected.has(name.tokenKey))
  // Names without a substitute spelling are split with faded dashes. Match's Torah side
  // numbers words in scroll form, where maqaf groups are separate words.
  const unsplit = options.replaceDivineNames ? printedNames.filter(name => !name.respelled && options.layout === 'match' && !name.scrollTarget) : []
  if (options.replaceDivineNames) {
    const wordsByKey = Map.groupBy(stage.querySelectorAll<HTMLElement>('.word'), word => `${word.dataset.annotationsMode}|${word.dataset.tokenKey ?? word.dataset.contextKey}`)
    for (const name of printedNames.filter(name => !name.respelled)) {
      wordsByKey.get(`on|${name.tokenKey}`)?.forEach(word => insertNameBreaks(word, name.breakBeforeLetters))
      const scroll = options.layout === 'reading' ? name : name.scrollTarget
      if (scroll) wordsByKey.get(`off|${scroll.tokenKey}`)?.forEach(word => insertNameBreaks(word, scroll.breakBeforeLetters))
    }
  }
  const printsName = options.replaceDivineNames ? unsplit.length > 0 : printedNames.length > 0
  if (unsplit.length) console.error('Print could not split these divine names', unsplit.map(name => name.word))
  for (const word of stage.querySelectorAll<HTMLElement>('.word')) {
    const wordSelection = word.dataset.annotationsMode === 'off' && options.layout === 'match' ? selectedUnannotated : selected
    const inRange = wordSelection.has(word.dataset.tokenKey ?? '')
    word.dataset.printSelected = String(inRange)
    if (!inRange && options.layout === 'reading') {
      if (word.nextElementSibling?.classList.contains('reader-pasuk-break')) word.nextElementSibling.remove()
      word.remove()
    } else if (!inRange) {
      word.classList.add(options.surrounding ? 'print-context' : 'print-omitted')
    }
  }
  if (options.layout === 'reading') {
    stage.querySelectorAll('.line').forEach(line => {
      if (!line.querySelector('.word')) line.remove()
    })
    // Join the shared renderer's physical loading containers so a pasuk can
    // flow across Torah-column boundaries exactly as in Reading Layout.
    const first = stage.querySelector<HTMLElement>('.tikkun-page')!
    const others = [...stage.querySelectorAll<HTMLElement>('.tikkun-page')].slice(1)
    for (const other of others) {
      for (const side of other.querySelectorAll<HTMLElement>('.reader-reading-page-side')) {
        const surface = side.classList.contains('mod-torah') ? 'mod-torah' : 'mod-tikkun'
        first.querySelector(`.reader-reading-page-side.${surface}`)!.append(...side.childNodes)
      }
      other.remove()
    }
    // A line break cannot take margin in every browser, so a block after each shown pasuk
    // break carries the space. None follows a side's last word, which would add an empty page.
    if (options.pasukSpacing !== 0) {
      for (const side of first.querySelectorAll<HTMLElement>('.reader-reading-page-side')) {
        const lastWord = [...side.querySelectorAll('.word')].at(-1)
        for (const pasukBreak of side.querySelectorAll<HTMLElement>('.reader-pasuk-break')) {
          if (pasukBreak.style.display === 'none' || !lastWord || !(pasukBreak.compareDocumentPosition(lastWord) & Node.DOCUMENT_POSITION_FOLLOWING)) continue
          const gap = document.createElement('span')
          gap.className = 'print-pasuk-gap'
          gap.setAttribute('aria-hidden', 'true')
          pasukBreak.after(gap)
        }
      }
    }
  }
  let pageCount = 0
  let exceedsWidth = false
  const masthead = mastheadContent(options, pages.map(page => page.pageNumber))
  const firstPageExtra = mastheadExtraHeight(root, options, masthead)
  // Page 1 gives the masthead's extra height back from its text area.
  const textHeight = () => paper.height - 164 - (pageCount === 0 ? firstPageExtra : 0)
  for (const section of stage.querySelectorAll<HTMLElement>('.tikkun-page')) {
    applyReaderPageLayout(section, presentation)
    if (options.sides === 'one') {
      section.querySelectorAll(`.reader-text-side.mod-${options.form}, .reader-reading-page-side.mod-${options.form}`).forEach(side => side.removeAttribute('aria-hidden'))
      if (options.layout === 'match') {
        // Center the selected, already-fitted column without changing its width.
        const column = section.querySelector<HTMLElement>(`.reader-text-side.mod-${options.form}`)!.getBoundingClientRect()
        const page = section.getBoundingClientRect()
        const offset = page.left + page.width / 2 - column.left - column.width / 2
        section.style.setProperty('--print-single-offset', `${offset}px`)
        // Pasuk numbers hang past the line's edge; move them to the centered column's edge.
        section.style.setProperty('--print-single-number-offset', `${column.right + offset - page.right}px`)
      }
    }
    if (options.layout === 'match' && !options.surrounding) {
      section.querySelectorAll('tr').forEach(row => {
        if (!row.querySelector('[data-print-selected="true"]')) row.remove()
      })
    }
    const sectionTop = section.getBoundingClientRect().top
    const height = section.getBoundingClientRect().height
    const baselineScale = options.layout === 'match' && options.overflow === 'shrink' ? Math.min(1, textHeight() / height) : 1
    const scale = options.layout === 'match' ? baselineScale * options.scaling / 100 : 1
    if (options.layout === 'match') {
      const contentWidth = options.sides === 'one'
        ? section.querySelector<HTMLElement>(`.reader-text-side.mod-${options.form}`)!.getBoundingClientRect().width
        : section.getBoundingClientRect().width
      exceedsWidth ||= contentWidth * scale > paper.width - 96 + 0.5
    }
    const breakPoints = options.layout === 'match'
      ? [...section.querySelectorAll('tr')].map(row => row.getBoundingClientRect().bottom - sectionTop)
      : [...new Set([...section.querySelectorAll<HTMLElement>(`${options.sides === 'one' ? `.reader-text-side.mod-${options.form}` : '[data-reader-canonical="true"]'} .word`)].map(word => word.getBoundingClientRect().bottom - sectionTop))]
    let offset = 0
    while (offset < height - 1) {
      const availableHeight = textHeight()
      const capacity = scale === 0 ? height : availableHeight / scale
      const end = height - offset <= capacity ? height : Math.max(offset, ...breakPoints.filter(point => point > offset && point <= offset + capacity))
      if (end <= offset) throw new Error('This content is too large for a page. Reduce Scaling or use Shrink to fit.')
      const body = newSheet(root, options, pageCount++, masthead)
      const copyBook = createBook(options)
      const copy = section.cloneNode(true) as HTMLElement
      copyBook.append(copy)
      copyBook.style.marginLeft = `${(paper.width - 96 - stage.getBoundingClientRect().width * scale) / 2}px`
      copyBook.style.transform = `scale(${scale}) translateY(${-offset}px)`
      body.style.height = `${Math.min(availableHeight, (end - offset) * scale)}px`
      body.append(copyBook)
      alignColumnHeadings(body, copyBook, options)
      alignFooter(body, copyBook, options)
      offset = end
    }
  }
  stage.remove()
  root.querySelectorAll<HTMLElement>('.paper-invocation').forEach(invocation => {
    invocation.textContent = printsName ? 'ב״ה' : 'בס״ד'
  })
  root.querySelectorAll<HTMLElement>('.paper-number').forEach((number, index) => {
    number.textContent = `${index + 1}/${pageCount}`
    number.setAttribute('aria-label', `Page ${index + 1} of ${pageCount}`)
  })
  root.dataset.ready = 'true'
  return { pageCount, exceedsWidth, width: paper.width, height: pageCount * (paper.height + 28) - 28, selectedTokens: selected.size }
}

/** Puts a faded dash before each given letter of a word, after the previous letter's pointing. */
function insertNameBreaks(word: HTMLElement, letterIndexes: number[]) {
  const walker = document.createTreeWalker(word, NodeFilter.SHOW_TEXT)
  const targets: { text: Text, index: number }[] = []
  let seen = 0
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text
    for (const { index } of text.data.matchAll(/[א-ת]/gu)) {
      if (letterIndexes.includes(seen++)) targets.push({ text, index })
    }
  }
  if (targets.length !== letterIndexes.length) throw new Error(`Could not split the divine name in ${word.textContent}.`)
  // Split from the end so earlier offsets in the same text node stay valid.
  for (const { text, index } of targets.reverse()) {
    const dash = document.createElement('span')
    dash.className = 'print-name-break'
    dash.setAttribute('aria-hidden', 'true')
    dash.textContent = '-'
    text.splitText(index).before(dash)
  }
}
