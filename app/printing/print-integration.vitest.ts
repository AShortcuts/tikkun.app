import { afterEach, expect, test, vi } from 'vitest'

let frame: HTMLIFrameElement | undefined
afterEach(() => { frame?.remove(); frame = undefined })

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`Missing ${selector}`)
  return element
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
  expect(required(paper, '.paper-heading').textContent).toContain('ז:יז')
  expect(required(paper, '.paper-heading [lang="en"]').textContent).toContain('Beresheet 7:17')
  expect(paper.querySelectorAll('.paper-signature').length).toBe(paper.querySelectorAll('.paper-sheet').length)
  const logo = required(paper, '.paper-signature img').getBoundingClientRect()
  const name = required(paper, '.paper-brand').getBoundingClientRect()
  const url = required(paper, '.paper-signature a').getBoundingClientRect()
  expect(logo.right).toBeLessThan(name.left)
  expect(name.left).toBe(url.left)
  expect(logo.left).toBe(required(paper, '.paper-footer').getBoundingClientRect().left)
  expect(paper.querySelectorAll('.paper-number')).toHaveLength(0)
  expectSacredNotices(paper)
  required<HTMLButtonElement>(doc, '.page-group .group-title').click()
  await vi.waitFor(() => expect(doc.querySelector('.page-numbers-option input')).not.toBeNull())
  const pageNumbers = required<HTMLInputElement>(doc, '.page-numbers-option input')
  expect(pageNumbers.checked).toBe(false)
  pageNumbers.click()
  await vi.waitFor(() => expect(paper.querySelectorAll('.paper-number').length).toBe(paper.querySelectorAll('.paper-sheet').length))
  const detailsPage = required<HTMLInputElement>(doc, '.details-page-option input')
  expect(detailsPage.checked).toBe(false)
  detailsPage.click()
  await vi.waitFor(() => expect(paper.querySelectorAll('[data-page-kind="details"]')).toHaveLength(1))
  const removeCredits = required<HTMLInputElement>(doc, '.credits-option input')
  expect(removeCredits.checked).toBe(false)
  removeCredits.click()
  await vi.waitFor(() => expect(paper.querySelectorAll('.paper-signature').length).toBe(0))
  expectInvocations(paper, 'ב״ה')
  expect(paper.querySelectorAll('.paper-number').length).toBe(paper.querySelectorAll('.paper-sheet').length)
  expectSacredNotices(paper)
  expect(paper.querySelector('.paper-heading')?.textContent).toContain('ז:יז')
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
  expect(required<HTMLIFrameElement>(doc, '.document-wrap iframe').contentDocument?.querySelector('.paper-heading')?.textContent).toContain('ו:טז')
  expect(doc.querySelector('.credits-option')).toBeNull()
  required<HTMLButtonElement>(doc, '.advanced-group .group-title').click()
  await vi.waitFor(() => expect(doc.querySelector('.divine-names-option input')).not.toBeNull())
  expect(required<HTMLInputElement>(doc, '.credits-option input').checked).toBe(false)
  expect(required<HTMLInputElement>(doc, '.divine-names-option input').checked).toBe(true)
  expect(required<HTMLIFrameElement>(doc, '.document-wrap iframe').contentDocument?.querySelectorAll('.paper-number')).toHaveLength(0)
  expect(required<HTMLIFrameElement>(doc, '.document-wrap iframe').contentDocument?.querySelector('[data-page-kind="details"]')).toBeNull()
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
  await vi.waitFor(() => expect(required<HTMLIFrameElement>(doc, '.document-wrap iframe').contentDocument?.querySelector('.paper-heading')?.textContent).toContain('ו:ט–יא:לב'))
  button('ReaderNatural').click()
  button('One Sided').click()
  await vi.waitFor(() => expect(required<HTMLIFrameElement>(doc, '.document-wrap iframe').contentDocument?.querySelector('.print-book[data-reader-layout="reading"][data-print-sides="one"]')).not.toBeNull())
  button('Upcoming readings').click()
  await vi.waitFor(() => expect(doc.querySelectorAll('.upcoming-reading')).toHaveLength(10))
  const upcoming = required<HTMLButtonElement>(doc, '.upcoming-reading')
  const upcomingTitle = upcoming.querySelector('span')!.textContent
  const upcomingRange = upcoming.querySelector('small')!.textContent
  expect(upcoming.querySelector('time')?.getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(upcomingRange).toContain(':')
  upcoming.click()
  await vi.waitFor(() => expect(doc.querySelector('.sample-reading')?.textContent).toContain(upcomingTitle))
  await vi.waitFor(() => expect(required<HTMLIFrameElement>(doc, '.document-wrap iframe').contentDocument?.querySelector('.paper-heading [lang="he"]')?.textContent).toBe(upcomingRange), { timeout: 15000 })
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
  await vi.waitFor(() => expect(paper.querySelector('.paper-heading [lang="en"]')?.textContent).toBe('Beresheet 2:4–7'))
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
