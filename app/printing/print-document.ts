import { asset } from '$app/paths'
import Page from '../components/Page.ts'
import { applyReaderPageLayout } from '../components/reader-page-layout.ts'
import type { PrintOptions } from './print-model.ts'
import { loadPrintPassage, passageTitle, paperSize } from './print-model.ts'
import { compareRefs } from '../calendar-model/ref-utils.ts'
import type { ReaderPagePresentation } from '../reader-presentation.ts'
import { replacePrintDivineNames } from './print-divine-names.ts'
import { printColumnNumbers, printDetailsTitles } from './print-details.ts'

function createBook(options: PrintOptions) {
  const book = document.createElement('div')
  book.className = 'tikkun-book print-book'
  book.dataset.readerLayout = options.layout
  book.dataset.readerSides = 'two'
  book.dataset.printSides = options.sides
  book.dataset.printForm = options.form
  // Fit Match once at the same column width; orientation only changes the paper.
  book.style.width = `${paperSize(options.layout === 'match' ? 'portrait' : options.orientation).width - 96}px`
  const fontScale = options.layout === 'reading' && options.scaling > 0 ? options.scaling / 100 : 1
  book.style.setProperty('--print-font-size', `${(options.layout === 'match' ? 21 : 25) * fontScale}px`)
  return book
}

function newSheet(root: HTMLElement, options: PrintOptions, pageIndex: number, kind: 'reading' | 'details' = 'reading') {
  const sheet = document.createElement('article')
  sheet.className = 'paper-sheet'
  sheet.dataset.pageKind = kind
  sheet.setAttribute('aria-label', `Printed page ${pageIndex + 1}`)
  const invocation = document.createElement('div')
  invocation.className = 'paper-invocation'
  invocation.lang = 'he'
  invocation.dir = 'rtl'
  invocation.textContent = options.replaceDivineNames ? 'בס״ד' : 'ב״ה'
  const heading = document.createElement('header')
  heading.className = 'paper-heading'
  heading.dir = 'ltr'
  const english = document.createElement('bdi')
  english.lang = 'en'
  english.dir = 'ltr'
  english.textContent = passageTitle(options.ranges, 'en')
  const separator = document.createElement('span')
  separator.setAttribute('aria-hidden', 'true')
  separator.textContent = '|'
  const hebrew = document.createElement('bdi')
  hebrew.lang = 'he'
  hebrew.dir = 'rtl'
  hebrew.textContent = passageTitle(options.ranges)
  heading.append(english, separator, hebrew)
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
  if (options.scaling === 0) sheet.append(body)
  else {
    sheet.append(invocation, heading)
    if (kind === 'reading') sheet.append(forms)
    sheet.append(body, footer)
  }
  root.append(sheet)
  return body
}

function appendDetailsPage(root: HTMLElement, options: PrintOptions, pageIndex: number, columns: number[]) {
  const body = newSheet(root, options, pageIndex, 'details')
  const titles = printDetailsTitles(options.ranges)
  const card = document.createElement('aside')
  card.className = 'paper-details-card'
  card.classList.toggle('multiple-parshiot', titles.length > 1)
  card.setAttribute('aria-label', 'Reading details')
  const hebrew = document.createElement('div')
  hebrew.className = 'paper-details-hebrew'
  hebrew.lang = 'he'
  hebrew.dir = 'rtl'
  hebrew.textContent = titles.map(title => title.he).join(' · ')
  const english = document.createElement('div')
  english.className = 'paper-details-english'
  english.lang = 'en'
  english.dir = 'ltr'
  english.textContent = titles.map(title => title.en).join(' · ')
  const columnDetails = document.createElement('dl')
  const label = document.createElement('dt')
  const scroll = options.ranges[0].start.scroll === 'esther' ? 'Megillah' : 'Torah'
  label.textContent = `${scroll} ${columns.length === 1 ? 'column' : 'columns'}`
  const numbers = document.createElement('dd')
  numbers.textContent = printColumnNumbers(columns)
  columnDetails.append(label, numbers)
  card.append(hebrew, english, columnDetails)
  if (options.aliyahLabels.length) {
    const aliyot = document.createElement('div')
    aliyot.className = 'paper-details-aliyot paper-details-section'
    for (const name of options.aliyahLabels) {
      const entry = document.createElement('div')
      appendBilingualDetail(entry, name)
      aliyot.append(entry)
    }
    card.append(aliyot)
  }
  const passage = document.createElement('dl')
  passage.className = 'paper-details-passage'
  const passageLabel = document.createElement('dt')
  passageLabel.textContent = 'Verse range'
  const passageValue = document.createElement('dd')
  appendBilingualDetail(passageValue, { he: passageTitle(options.ranges), en: passageTitle(options.ranges, 'en') })
  passage.append(passageLabel, passageValue)
  card.append(passage)
  body.append(card)
}

function appendBilingualDetail(parent: HTMLElement, text: { he: string; en: string }) {
  for (const language of ['he', 'en'] as const) {
    const line = document.createElement('div')
    line.lang = language
    line.dir = language === 'he' ? 'rtl' : 'ltr'
    line.textContent = text[language]
    parent.append(line)
  }
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
  const { pages, selected, selectedUnannotated } = await loadPrintPassage(options.ranges)
  await document.fonts.load('21px ShlomosemiStam')
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
  }
  let pageCount = 0
  let exceedsWidth = false
  for (const section of stage.querySelectorAll<HTMLElement>('.tikkun-page')) {
    applyReaderPageLayout(section, presentation)
    if (options.sides === 'one') {
      section.querySelectorAll(`.reader-text-side.mod-${options.form}, .reader-reading-page-side.mod-${options.form}`).forEach(side => side.removeAttribute('aria-hidden'))
      if (options.layout === 'match') {
        // Center the selected, already-fitted column without changing its width.
        const column = section.querySelector<HTMLElement>(`.reader-text-side.mod-${options.form}`)!.getBoundingClientRect()
        const page = section.getBoundingClientRect()
        section.style.setProperty('--print-single-offset', `${page.left + page.width / 2 - column.left - column.width / 2}px`)
      }
    }
    if (options.layout === 'match' && !options.surrounding) {
      section.querySelectorAll('tr').forEach(row => {
        if (!row.querySelector('[data-print-selected="true"]')) row.remove()
      })
    }
    const sectionTop = section.getBoundingClientRect().top
    const height = section.getBoundingClientRect().height
    const availableHeight = paper.height - 164
    const baselineScale = options.layout === 'match' && options.overflow === 'shrink' ? Math.min(1, availableHeight / height) : 1
    const scale = options.layout === 'match' ? baselineScale * options.scaling / 100 : options.scaling === 0 ? 0 : 1
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
      const capacity = scale === 0 ? height : availableHeight / scale
      const end = height - offset <= capacity ? height : Math.max(offset, ...breakPoints.filter(point => point > offset && point <= offset + capacity))
      if (end <= offset) throw new Error('This content is too large for a page. Reduce Scaling or use Shrink to fit.')
      const body = newSheet(root, options, pageCount++)
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
  if (options.detailsPage && options.scaling > 0) {
    appendDetailsPage(root, options, pageCount++, pages.map(page => page.pageNumber))
  }
  root.querySelectorAll<HTMLElement>('.paper-number').forEach((number, index) => {
    number.textContent = `${index + 1}/${pageCount}`
    number.setAttribute('aria-label', `Page ${index + 1} of ${pageCount}`)
  })
  root.dataset.ready = 'true'
  return { pageCount, exceedsWidth, width: paper.width, height: pageCount * (paper.height + 28) - 28, selectedTokens: selected.size }
}
