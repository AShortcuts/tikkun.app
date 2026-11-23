import { afterEach, expect, test, vi } from 'vitest'

let frame: HTMLIFrameElement | undefined
afterEach(() => { frame?.remove(); frame = undefined; localStorage.removeItem('tikkun.print-preferences') })

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`Missing ${selector}`)
  return element
}

function masthead(paper: Document) {
  const header = required<HTMLElement>(paper, '.paper-masthead')
  const name = (language: string) => required(header, '.masthead-name[lang="' + language + '"]').textContent
  return { en: name('en'), he: name('he'), details: required(header, '.masthead-details').textContent ?? '' }
}

function expectInvocations(paper: Document, text: string) {
  const sheets = paper.querySelectorAll('.paper-sheet')
  expect(sheets.length).toBeGreaterThan(0)
  for (const sheet of sheets) {
    const invocation = sheet.querySelector<HTMLElement>('.paper-invocation')!
    expect(invocation?.textContent).toBe(text)
    const bounds = invocation.getBoundingClientRect()
    const page = sheet.getBoundingClientRect()
    expect(bounds.right).toBeCloseTo(page.right - 48, 1)
    expect(bounds.top).toBeCloseTo(page.top + 16, 1)
    expect(bounds.bottom).toBeLessThanOrEqual(sheet.querySelector('.paper-heading')!.getBoundingClientRect().top)
  }
}

function expectSacredNotices(paper: Document) {
  const sheets = paper.querySelectorAll('.paper-sheet')
  expect(sheets.length).toBeGreaterThan(0)
  for (const sheet of sheets) {
    const notice = sheet.querySelector<HTMLElement>('.paper-sacred-notice')!
    expect(notice?.textContent).toBe('The text on this page contains sacred literature. Please do not deface or discard.')
    const bounds = notice.getBoundingClientRect()
    const footer = sheet.querySelector('.paper-footer')!.getBoundingClientRect()
    expect(bounds.right).toBeCloseTo(footer.right, 1)
    expect(bounds.bottom).toBeCloseTo(footer.bottom, 1)
    expect(bounds.top).toBeGreaterThanOrEqual(sheet.querySelector('.paper-body')!.getBoundingClientRect().bottom)
    const number = sheet.querySelector('.paper-number')?.getBoundingClientRect()
    if (number) expect(number.right).toBeLessThan(bounds.left)
  }
}

test('reader keyboard opens the current passage, prints the prepared frame, and restores focus on close', async () => {
  frame = document.createElement('iframe')
  frame.style.cssText = 'width:1280px;height:900px'
  frame.src = '/reader/#/torah/parsha/noach/1-7-17'
  document.body.append(frame)
  await vi.waitFor(() => expect(frame?.contentDocument?.querySelector('.tikkun-book .word')).not.toBeNull(), { timeout: 15000 })
  const doc = frame.contentDocument!
  const view = frame.contentWindow!
  await vi.waitFor(() => expect(doc.querySelector('.reader-progress-label')?.textContent).toContain('שלישי'), { timeout: 15000 })
  const trigger = required<HTMLButtonElement>(doc, '[data-target-id="settings-toggle"]')
  trigger.focus()
  view.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true }))
  await vi.waitFor(() => expect(doc.querySelector('.preview-region[aria-busy="false"]')).not.toBeNull(), { timeout: 15000 })
  const dialog = required<HTMLDialogElement>(doc, '.print-workspace')
  expect(dialog.open).toBe(true)
  expect(dialog.textContent).toContain('Aliyah 3')
  expect(dialog.textContent).not.toContain('Sample reading')
  const prepared = required<HTMLIFrameElement>(doc, 'iframe[title="Live printable Torah preview"]')
  const paper = prepared.contentDocument!
  const readerText = required(doc, '.tikkun-book').textContent
  expect(required(doc, '.advanced-group .group-title').getAttribute('aria-expanded')).toBe('false')
  expect(doc.querySelector('.credits-option')).toBeNull()
  required<HTMLButtonElement>(doc, '.advanced-group .group-title').click()
  await vi.waitFor(() => expect(doc.querySelector('.divine-names-option input')).not.toBeNull())
  expect(doc.querySelector('#print-advanced-options .credits-option input')).not.toBeNull()
  const replaceNames = required<HTMLInputElement>(doc, '.divine-names-option input')
  expect(replaceNames.checked).toBe(true)
  expectInvocations(paper, 'בס״ד')
  replaceNames.click()
  await vi.waitFor(() => expect([...paper.querySelectorAll('.word')].some(word => /יהוה|אלהים/.test(word.textContent!.replace(/\p{M}/gu, '')))).toBe(true))
  expectInvocations(paper, 'ב״ה')
  expect(required(doc, '.tikkun-book').textContent).toBe(readerText)
  // Page 1's masthead splits the name at the fold; later pages repeat it in a running head.
  expect(masthead(paper)).toMatchObject({ en: 'Noach', he: 'נח' })
  expect(masthead(paper).details).toContain('Torah columns 7–8')
  expect(masthead(paper).details).toContain('Aliyah 3/שלישי')
  expect(required(paper, '.paper-sheet:nth-child(2) .paper-running-head').textContent).toBe('Noach, Aliyah 3נח, שלישי')
  expect(paper.querySelectorAll('.paper-signature').length).toBe(paper.querySelectorAll('.paper-sheet').length)
  const logo = required(paper, '.paper-signature img').getBoundingClientRect()
  const name = required(paper, '.paper-brand').getBoundingClientRect()
  const url = required(paper, '.paper-signature a').getBoundingClientRect()
  expect(logo.right).toBeLessThan(name.left)
  expect(name.left).toBe(url.left)
  expect(logo.left).toBe(required(paper, '.paper-footer').getBoundingClientRect().left)
  // Page numbers are on by default.
  expect(paper.querySelectorAll('.paper-number').length).toBe(paper.querySelectorAll('.paper-sheet').length)
  expectSacredNotices(paper)
  required<HTMLButtonElement>(doc, '.page-group .group-title').click()
  await vi.waitFor(() => expect(doc.querySelector('.page-numbers-option input')).not.toBeNull())
  const pageNumbers = required<HTMLInputElement>(doc, '.page-numbers-option input')
  expect(pageNumbers.checked).toBe(true)
  pageNumbers.click()
  await vi.waitFor(() => expect(paper.querySelectorAll('.paper-number')).toHaveLength(0))
  pageNumbers.click()
  await vi.waitFor(() => expect(paper.querySelectorAll('.paper-number').length).toBe(paper.querySelectorAll('.paper-sheet').length))
  // The masthead replaced the separate details page.
  expect(doc.querySelector('.details-page-option')).toBeNull()
  expect(paper.querySelector('[data-page-kind="details"]')).toBeNull()
  const removeCredits = required<HTMLInputElement>(doc, '.credits-option input')
  expect(removeCredits.checked).toBe(false)
  removeCredits.click()
  await vi.waitFor(() => expect(paper.querySelectorAll('.paper-signature').length).toBe(0))
  expectInvocations(paper, 'ב״ה')
  expect(paper.querySelectorAll('.paper-number').length).toBe(paper.querySelectorAll('.paper-sheet').length)
  expectSacredNotices(paper)
  expect(masthead(paper).en).toBe('Noach')
  // The masthead gives the exact verses.
  expect(masthead(paper).details).toContain('בראשית ז:יז')
  removeCredits.click()
  await vi.waitFor(() => expect(paper.querySelectorAll('.paper-signature').length).toBe(paper.querySelectorAll('.paper-sheet').length))
  // Safari only honors print() from the document that received the tap.
  const pagePrint = vi.spyOn(view, 'print').mockImplementation(() => {})
  const framePrint = vi.spyOn(prepared.contentWindow!, 'print').mockImplementation(() => {})
  await vi.waitFor(() => expect(required<HTMLButtonElement>(doc, '.dialog-footer .primary').disabled).toBe(false))
  required<HTMLButtonElement>(doc, '.dialog-footer .primary').click()
  expect(pagePrint).toHaveBeenCalledOnce()
  expect(framePrint).not.toHaveBeenCalled()
  const printed = required(doc, '.tikkun-print-output').shadowRoot!
  expect(printed.querySelectorAll('.print-page > .paper-sheet')).toHaveLength(paper.querySelectorAll('.paper-sheet').length)
  expect(required(printed, '.paper-heading').textContent).toBe(required(paper, '.paper-heading').textContent)
  // Root-scoped reader rules must still match the copied sheets.
  const tikkunColumn = (root: ParentNode) => required(root, '.reader-text-side.mod-tikkun')
  expect(prepared.contentWindow!.getComputedStyle(tikkunColumn(paper)).gridColumnStart).toBe('3')
  expect(view.getComputedStyle(tikkunColumn(printed)).gridColumnStart).toBe('3')
  required<HTMLButtonElement>(doc, '[aria-label="Close print dialog"]').click()
  await vi.waitFor(() => expect(doc.querySelector('.print-workspace')).toBeNull())
  expect(doc.querySelector('.tikkun-print-output')).toBeNull()
  expect(doc.activeElement).toBe(trigger)
  expect(doc.body.style.overflow).not.toBe('hidden')
  pagePrint.mockRestore()
  framePrint.mockRestore()

  const selectedWord = [...doc.querySelectorAll<HTMLElement>('.tikkun-book .word')].find(word =>
    word.dataset.annotationsOnText?.normalize('NFD').replace(/\p{M}/gu, '').includes('צהר'))!
  expect(selectedWord).toBeDefined()
  const range = doc.createRange()
  range.setStart(selectedWord.firstChild!, 0)
  range.setEnd(selectedWord.firstChild!, 1)
  const selection = view.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  view.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true }))
  await vi.waitFor(() => expect(doc.querySelector('.preview-region[aria-busy="false"]')).not.toBeNull(), { timeout: 15000 })
  expect(required<HTMLSelectElement>(doc, '[aria-label="Starting chapter"]').value).toBe('6')
  expect(required<HTMLSelectElement>(doc, '[aria-label="Starting pasuk"]').value).toBe('16')
  expect(required<HTMLSelectElement>(doc, '[aria-label="Ending pasuk"]').value).toBe('16')
  const previewDetails = () => masthead(required<HTMLIFrameElement>(doc, '.document-wrap iframe').contentDocument!).details
  expect(previewDetails()).toContain('Aliyah 1/ראשון')
  expect(previewDetails()).toContain('Beresheet 6:16/')
  // A range changed by verse prints those verses instead.
  const endingPasuk = required<HTMLSelectElement>(doc, '[aria-label="Ending pasuk"]')
  endingPasuk.value = '18'
  endingPasuk.dispatchEvent(new Event('change', { bubbles: true }))
  await vi.waitFor(() => expect(previewDetails()).toContain('Beresheet 6:16–18'))
  // A range typed in by verse names its parsha but no aliyah.
  expect(previewDetails()).not.toMatch(/Aliyah|ראשון/)
  expect(doc.querySelector('.credits-option')).toBeNull()
  required<HTMLButtonElement>(doc, '.advanced-group .group-title').click()
  await vi.waitFor(() => expect(doc.querySelector('.divine-names-option input')).not.toBeNull())
  expect(required<HTMLInputElement>(doc, '.credits-option input').checked).toBe(false)
  // The first dialog turned substitute spellings off, and the choice is remembered.
  expect(required<HTMLInputElement>(doc, '.divine-names-option input').checked).toBe(false)
  const reopened = required<HTMLIFrameElement>(doc, '.document-wrap iframe').contentDocument!
  expect(reopened.querySelectorAll('.paper-number').length).toBe(reopened.querySelectorAll('.paper-sheet').length)
  required<HTMLButtonElement>(doc, '[aria-label="Close print dialog"]').click()
  await vi.waitFor(() => expect(doc.querySelector('.print-workspace')).toBeNull())
  selection.removeAllRanges()

  selection.addRange(range)
  trigger.click()
  await vi.waitFor(() => expect(doc.querySelector('[data-settings-panel="more"]')).not.toBeNull())
  required<HTMLButtonElement>(doc, '[aria-controls="reader-settings-more-panel"]').click()
  const printEntry = required<HTMLButtonElement>(doc, '.settings-print-button')
  printEntry.click()
  await vi.waitFor(() => expect(doc.querySelector('.preview-region[aria-busy="false"]')).not.toBeNull(), { timeout: 15000 })
  expect(doc.querySelectorAll('.print-workspace')).toHaveLength(1)
  expect(required<HTMLSelectElement>(doc, '[aria-label="Starting pasuk"]').value).toBe('16')
  selection.removeAllRanges()
  const button = (text: string) => [...doc.querySelectorAll<HTMLButtonElement>('.print-workspace button')].find(button => button.textContent?.trim() === text)!
  button('Whole parsha').click()
  // The complete parsha is named where an aliyah would be.
  await vi.waitFor(() => expect(masthead(required<HTMLIFrameElement>(doc, '.document-wrap iframe').contentDocument!).details).toContain('Whole parsha/כל הפרשה'))
  expect(masthead(required<HTMLIFrameElement>(doc, '.document-wrap iframe').contentDocument!).en).toBe('Noach')
  button('ReaderNatural').click()
  button('One Sided').click()
  await vi.waitFor(() => expect(required<HTMLIFrameElement>(doc, '.document-wrap iframe').contentDocument?.querySelector('.print-book[data-reader-layout="reading"][data-print-sides="one"]')).not.toBeNull())
  // Printed Reading pages reserve no room for the hidden verse and aliyah rails.
  const readingPreview = required<HTMLIFrameElement>(doc, '.document-wrap iframe')
  const readingPage = required<HTMLElement>(readingPreview.contentDocument!, '.paper-sheet .reader-reading-page')
  expect(readingPreview.contentWindow!.getComputedStyle(readingPage).paddingLeft).toBe('0px')
  expect(readingPage.getBoundingClientRect().width).toBeCloseTo(required(readingPreview.contentDocument!, '.paper-sheet .paper-body').getBoundingClientRect().width, 0)
  button('Upcoming readings').click()
  await vi.waitFor(() => expect(doc.querySelectorAll('.upcoming-reading')).toHaveLength(10))
  const upcoming = required<HTMLButtonElement>(doc, '.upcoming-reading')
  const upcomingTitle = upcoming.querySelector('span')!.textContent
  const upcomingRange = upcoming.querySelector('small')!.textContent
  expect(upcoming.querySelector('time')?.getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(upcomingRange).toContain(':')
  upcoming.click()
  await vi.waitFor(() => expect(doc.querySelector('.sample-reading')?.textContent).toContain(upcomingTitle))
  // An upcoming reading is named by its own reading title.
  await vi.waitFor(() => expect(required<HTMLIFrameElement>(doc, '.document-wrap iframe').contentDocument?.querySelector('.masthead-name[lang="he"]')?.textContent).toBe(upcomingTitle), { timeout: 15000 })
  expectSacredNotices(required<HTMLIFrameElement>(doc, '.document-wrap iframe').contentDocument!)
  expect(button('ReaderNatural').getAttribute('aria-pressed')).toBe('true')
  expect(button('One Sided').getAttribute('aria-pressed')).toBe('true')
  expect(doc.querySelector('#print-upcoming-readings')).toBeNull()
  expect(doc.activeElement).toBe(button('Upcoming readings'))
  button('Several aliyot').click()
  await vi.waitFor(() => expect(doc.querySelector('.aliyah-choices button')?.textContent).toBe('Aliyah 1'))
  button('Custom range').click()
  await vi.waitFor(() => expect(required<HTMLSelectElement>(doc, '[aria-label="Starting chapter"]').value).not.toBe(''))
  button('Upcoming readings').click()
  await vi.waitFor(() => expect(doc.querySelector('.reading-choice')).not.toBeNull())
  required<HTMLButtonElement>(doc, '.reading-choice').click()
  await vi.waitFor(() => expect(doc.querySelector('.preview-region[aria-busy="false"]')).not.toBeNull(), { timeout: 15000 })
  expect(doc.querySelector('.sample-reading')?.textContent).toContain('נח')
  expect(button('Current aliyah').getAttribute('aria-pressed')).toBe('true')
  required<HTMLButtonElement>(doc, '[aria-label="Close print dialog"]').click()
  await vi.waitFor(() => expect(doc.querySelector('.print-workspace')).toBeNull())
})

test('divine-name replacement updates both print forms in Match and Reader without changing passage boundaries', async () => {
  frame = document.createElement('iframe')
  frame.style.cssText = 'width:1280px;height:900px'
  frame.src = '/prototypes/print/'
  document.body.append(frame)
  await vi.waitFor(() => expect(frame?.contentDocument?.querySelector('.preview-region[aria-busy="false"]')).not.toBeNull(), { timeout: 15000 })
  const doc = frame.contentDocument!
  const paper = required<HTMLIFrameElement>(doc, '.document-wrap iframe').contentDocument!
  const button = (text: string) => [...doc.querySelectorAll<HTMLButtonElement>('.print-workspace button')].find(button => button.textContent?.trim() === text)!
  const select = (label: string, value: string) => {
    const input = required<HTMLSelectElement>(doc, `[aria-label="${label}"]`)
    input.value = value
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
  select('Ending chapter', '2')
  select('Ending pasuk', '7')
  select('Starting chapter', '2')
  select('Starting pasuk', '4')
  await vi.waitFor(() => expect(paper.querySelector('.masthead-details')?.textContent).toContain('Beresheet 2:4–7'))
  button('Advanced').click()
  await vi.waitFor(() => expect(doc.querySelector('.divine-names-option input')).not.toBeNull())
  const toggle = required<HTMLInputElement>(doc, '.divine-names-option input')
  const words = (form: string) => [...paper.querySelectorAll<HTMLElement>(`.mod-${form} .word`)]
  const plain = (form: string) => words(form).map(word => word.textContent).join(' ').replace(/\p{M}/gu, '')
  const tokens = (form: string) => words(form).map(word => word.dataset.tokenKey)
  const pointings = () => words('tikkun').map(word => [...word.textContent!.matchAll(/\p{M}/gu)].map(match => match[0]).join(''))
  for (const layout of ['MatchTorah lines', 'ReaderNatural']) {
    button(layout).click()
    await vi.waitFor(() => expect(paper.querySelector(`.print-book[data-reader-layout="${layout.startsWith('Match') ? 'match' : 'reading'}"]`)).not.toBeNull())
    expect(toggle.checked).toBe(true)
    expectInvocations(paper, 'בס״ד')
    for (const form of ['torah', 'tikkun']) {
      expect(plain(form)).toContain('ידוה')
      expect(plain(form)).toContain('אלקים')
      expect(plain(form)).not.toMatch(/יהוה|אלהים/)
    }
    expect(plain('tikkun')).toContain('אלה')
    const selectedTokens = tokens('tikkun')
    const marks = pointings()
    toggle.click()
    await vi.waitFor(() => expect(plain('tikkun')).toContain('יהוה'))
    expectInvocations(paper, 'ב״ה')
    for (const form of ['torah', 'tikkun']) expect(plain(form)).toContain('אלהים')
    expect(tokens('tikkun')).toEqual(selectedTokens)
    expect(pointings()).toEqual(marks)
    toggle.click()
    await vi.waitFor(() => expect(plain('tikkun')).toContain('ידוה'))
    button('One Sided').click()
    await vi.waitFor(() => expect(paper.querySelector('.print-book[data-print-sides="one"]')).not.toBeNull())
    expectInvocations(paper, 'בס״ד')
    expect(plain('tikkun')).toContain('אלקים')
    button('Two Sided').click()
    await vi.waitFor(() => expect(paper.querySelector('.print-book[data-print-sides="two"]')).not.toBeNull())
  }
})

test('substitute spellings split other names with faded dashes in Reader and Match, so pages print בס״ד', async () => {
  frame = document.createElement('iframe')
  frame.style.cssText = 'width:1280px;height:900px'
  frame.src = '/prototypes/print/'
  document.body.append(frame)
  await vi.waitFor(() => expect(frame?.contentDocument?.querySelector('.preview-region[aria-busy="false"]')).not.toBeNull(), { timeout: 15000 })
  const doc = frame.contentDocument!
  const paper = required<HTMLIFrameElement>(doc, '.document-wrap iframe').contentDocument!
  const button = (text: string) => [...doc.querySelectorAll<HTMLButtonElement>('.print-workspace button')].find(button => button.textContent?.trim() === text)!
  const select = (label: string, value: string) => {
    const input = required<HTMLSelectElement>(doc, `[aria-label="${label}"]`)
    input.value = value
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
  select('Ending chapter', '17')
  select('Ending pasuk', '2')
  select('Starting chapter', '17')
  select('Starting pasuk', '1')
  await vi.waitFor(() => expect(paper.querySelector('.masthead-details')?.textContent).toContain('Beresheet 17:1–2'))
  button('Advanced').click()
  button('ReaderNatural').click()
  await vi.waitFor(() => expect(paper.querySelector('.print-book[data-reader-layout="reading"] .print-name-break')).not.toBeNull())
  expectInvocations(paper, 'בס״ד')
  for (const form of ['torah', 'tikkun']) {
    const text = [...paper.querySelectorAll(`.mod-${form} .word`)].map(word => word.textContent).join(' ').replace(/\p{M}/gu, '')
    expect(text).toContain('א-ל ש-ד-י')
  }
  expect(getComputedStyle(required(paper, '.print-name-break')).opacity).toBe('0.35')
  // Dashes are inserted between letters, so removing them gives back the exact pointed word.
  const dashed = [...paper.querySelectorAll<HTMLElement>('.mod-tikkun .word')].filter(word => word.querySelector('.print-name-break'))
  expect(dashed.length).toBeGreaterThan(0)
  for (const word of dashed) {
    const clone = word.cloneNode(true) as HTMLElement
    clone.querySelectorAll('.print-name-break').forEach(dash => dash.remove())
    expect(clone.textContent).toBe(word.dataset.annotationsOnText)
  }
  expect(dashed.map(word => word.textContent!.replace(/\p{M}/gu, ''))).toContain('ש-ד-י')
  const toggle = required<HTMLInputElement>(doc, '.divine-names-option input')
  toggle.click()
  await vi.waitFor(() => expect(paper.querySelector('.print-name-break')).toBeNull())
  expectInvocations(paper, 'ב״ה')
  expect(JSON.parse(localStorage.getItem('tikkun.print-preferences')!)).toEqual({ replaceDivineNames: false, verseNumbers: true })
  toggle.click()
  await vi.waitFor(() => expect(paper.querySelector('.print-name-break')).not.toBeNull())
  button('MatchTorah lines').click()
  await vi.waitFor(() => expect(paper.querySelector('.print-book[data-reader-layout="match"]')).not.toBeNull())
  await vi.waitFor(() => expect(paper.querySelector('.print-book[data-reader-layout="match"] .print-name-break')).not.toBeNull())
  expectInvocations(paper, 'בס״ד')
  for (const form of ['torah', 'tikkun']) {
    const text = [...paper.querySelectorAll(`.mod-${form} .word`)].map(word => word.textContent).join(' ').replace(/\p{M}/gu, '')
    expect(text).toContain('א-ל ש-ד-י')
  }
})

test('pasuk numbers print beside the line where each pasuk starts and can be turned off', async () => {
  frame = document.createElement('iframe')
  frame.style.cssText = 'width:1280px;height:900px'
  frame.src = '/prototypes/print/'
  document.body.append(frame)
  await vi.waitFor(() => expect(frame?.contentDocument?.querySelector('.preview-region[aria-busy="false"]')).not.toBeNull(), { timeout: 15000 })
  const doc = frame.contentDocument!
  const paper = required<HTMLIFrameElement>(doc, '.document-wrap iframe').contentDocument!
  const button = (text: string) => [...doc.querySelectorAll<HTMLButtonElement>('.print-workspace button')].find(button => button.textContent?.trim() === text)!
  const shownNumbers = () => [...paper.querySelectorAll<HTMLElement>('.paper-sheet .line-gutter.mod-verses')]
    .filter(gutter => gutter.textContent?.trim() && getComputedStyle(gutter).display !== 'none')
  const toggle = required<HTMLInputElement>(doc, '.verse-numbers-option input')
  expect(toggle.checked).toBe(true)
  button('ReaderNatural').click()
  await vi.waitFor(() => expect(paper.querySelector('.print-book[data-reader-layout="reading"]')).not.toBeNull())
  await vi.waitFor(() => expect(shownNumbers().length).toBeGreaterThan(0))
  const sheet = required(paper, '.paper-sheet')
  const words = [...sheet.querySelectorAll<HTMLElement>('.reader-reading-page-side.mod-tikkun .word')]
  const starts = words.filter((_, index) => index === 0 || words[index - 1].classList.contains('mod-sof-pasuk'))
  const middle = (element: Element) => { const { top, bottom } = element.getBoundingClientRect(); return (top + bottom) / 2 }
  // Each sheet is a window onto one long measured page, so its copy holds every pasuk of the passage.
  const sheetNumbers = shownNumbers().filter(gutter => sheet.contains(gutter))
  expect(sheetNumbers.map(gutter => gutter.textContent?.trim())).toEqual(['ו', 'ז', 'ח', 'ט', 'י', 'יא', 'יב', 'יג'])
  for (const gutter of sheetNumbers) expect(Math.min(...starts.map(start => Math.abs(middle(gutter) - middle(start))))).toBeLessThan(1)
  // The numbers sit outside the text, beside the Tikkun side.
  const tikkunSide = required(sheet, '.reader-reading-page-side.mod-tikkun').getBoundingClientRect()
  for (const gutter of sheetNumbers) expect(gutter.getBoundingClientRect().left).toBeGreaterThanOrEqual(tikkunSide.right - 1)
  button('MatchTorah lines').click()
  await vi.waitFor(() => expect(paper.querySelector('.print-book[data-reader-layout="match"]')).not.toBeNull())
  await vi.waitFor(() => expect(shownNumbers().length).toBeGreaterThan(0))
  toggle.click()
  await vi.waitFor(() => expect(shownNumbers()).toHaveLength(0))
  expect(JSON.parse(localStorage.getItem('tikkun.print-preferences')!)).toEqual({ replaceDivineNames: true, verseNumbers: false })
})
