import { afterEach, expect, test, vi } from 'vitest'

let frame: HTMLIFrameElement | undefined
afterEach(() => { frame?.remove(); frame = undefined })

function required<T extends Element>(root: Document, selector: string): T {
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
  const nativePrint = vi.spyOn(prepared.contentWindow!, 'print').mockImplementation(() => {})
  await vi.waitFor(() => expect(required<HTMLButtonElement>(doc, '.dialog-footer .primary').disabled).toBe(false))
  required<HTMLButtonElement>(doc, '.dialog-footer .primary').click()
  expect(nativePrint).toHaveBeenCalledOnce()
  required<HTMLButtonElement>(doc, '[aria-label="Close print dialog"]').click()
  await vi.waitFor(() => expect(doc.querySelector('.print-workspace')).toBeNull())
  expect(doc.activeElement).toBe(trigger)
  expect(doc.body.style.overflow).not.toBe('hidden')
  nativePrint.mockRestore()

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

test('optional details append after the reading and page totals update without moving the text', async () => {
  frame = document.createElement('iframe')
  frame.style.cssText = 'width:1280px;height:900px'
  frame.src = '/prototypes/print/'
  document.body.append(frame)
  await vi.waitFor(() => expect(frame?.contentDocument?.querySelector('.preview-region[aria-busy="false"]')).not.toBeNull(), { timeout: 15000 })
  const doc = frame.contentDocument!
  const paper = required<HTMLIFrameElement>(doc, '.document-wrap iframe').contentDocument!
  const button = (text: string) => [...doc.querySelectorAll<HTMLButtonElement>('.print-workspace button')].find(button => button.textContent?.trim() === text)!
  const numbers = () => [...paper.querySelectorAll('.paper-number')].map(number => number.textContent)
  const selected = () => [...paper.querySelectorAll<HTMLElement>('[data-page-kind="reading"] [data-print-selected="true"]')].map(word => {
    const bounds = word.getBoundingClientRect()
    return { key: word.dataset.tokenKey, text: word.textContent, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
  })
  const original = selected()
  button('Page setup').click()
  await vi.waitFor(() => expect(doc.querySelector('.details-page-option input')).not.toBeNull())
  const details = required<HTMLInputElement>(doc, '.details-page-option input')
  const pageNumbers = required<HTMLInputElement>(doc, '.page-numbers-option input')
  expect(details.checked).toBe(false)
  expect(pageNumbers.checked).toBe(false)
  expect(paper.querySelectorAll('.paper-sheet')).toHaveLength(1)
  pageNumbers.click()
  await vi.waitFor(() => expect(numbers()).toEqual(['1/1']))
  details.click()
  await vi.waitFor(() => expect(numbers()).toEqual(['1/2', '2/2']))
  expect(selected()).toEqual(original)
  const info = required<HTMLElement>(paper, '[data-page-kind="details"]')
  expect(info).toBe(paper.querySelector('.paper-sheet:last-child'))
  expect(info.querySelector('.word')).toBeNull()
  expect(info.querySelector('.paper-forms')).toBeNull()
  expect(info.querySelector('.paper-details-hebrew')?.textContent).toBe('בראשית')
  expect(info.querySelector('.paper-details-english')?.textContent).toBe('Beresheet')
  expect(info.querySelector('.paper-details-aliyot [lang="he"]')?.textContent).toBe('ראשון')
  expect(info.querySelector('.paper-details-aliyot [lang="en"]')?.textContent).toBe('Aliyah 1')
  expect(info.querySelector('.paper-details-passage [lang="he"]')?.textContent).toBe('בראשית א:ו–יג')
  expect(info.querySelector('.paper-details-passage [lang="en"]')?.textContent).toBe('Beresheet 1:6–13')
  expect(info.querySelector('dt')?.textContent).toBe('Torah column')
  expect(info.querySelector('dd')?.textContent).toBe('1')
  expect(paper.querySelector('[data-page-kind="reading"] .paper-details-card')).toBeNull()
  const card = info.querySelector('.paper-details-card')!.getBoundingClientRect()
  expect(card.right).toBeCloseTo(info.getBoundingClientRect().right - 48, 1)
  expectSacredNotices(paper)
  expectInvocations(paper, 'בס״ד')

  const select = (label: string, value: string) => {
    const input = required<HTMLSelectElement>(doc, `[aria-label="${label}"]`)
    input.value = value
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
  select('Ending chapter', '2')
  select('Ending pasuk', '3')
  select('Starting pasuk', '24')
  await vi.waitFor(() => expect(paper.querySelector('.paper-details-card dd')?.textContent).toBe('1–2'))
  expect(paper.querySelector('.paper-details-passage [lang="en"]')?.textContent).toBe('Beresheet 1:24–2:3')
  expect(numbers()).toEqual(['1/3', '2/3', '3/3'])
  button('ReaderNatural').click()
  button('One Sided').click()
  button('Landscape').click()
  await vi.waitFor(() => expect(paper.querySelector('.print-book[data-reader-layout="reading"][data-print-sides="one"]')).not.toBeNull())
  await vi.waitFor(() => expect(required(paper, '.paper-sheet').getBoundingClientRect().width).toBe(1056))
  expect(paper.querySelector('.paper-details-card dd')?.textContent).toBe('1–2')
  const count = paper.querySelectorAll('.paper-sheet').length
  expect(numbers()).toEqual(Array.from({ length: count }, (_, index) => `${index + 1}/${count}`))
  expectSacredNotices(paper)
  pageNumbers.click()
  button('Whole parsha').click()
  await vi.waitFor(() => expect(paper.querySelector('.paper-details-aliyot')).toBeNull())
  expect(paper.querySelector('.paper-details-passage [lang="en"]')?.textContent).toBe('Beresheet 1:1–6:8')
  button('Current aliyah').click()
  await vi.waitFor(() => expect(paper.querySelector('.paper-details-aliyot [lang="en"]')?.textContent).toBe('Aliyah 1'))
  await vi.waitFor(() => expect(numbers()).toEqual([]))
  expect(paper.querySelectorAll('[data-page-kind="details"]')).toHaveLength(1)
  details.click()
  await vi.waitFor(() => expect(paper.querySelector('[data-page-kind="details"]')).toBeNull())
})

test('Match preserves column typography across paper orientations and side counts', async () => {
  frame = document.createElement('iframe')
  frame.style.cssText = 'width:1280px;height:900px'
  frame.src = '/prototypes/print/'
  document.body.append(frame)
  await vi.waitFor(() => expect(frame?.contentDocument?.querySelector('.preview-region[aria-busy="false"]')).not.toBeNull(), { timeout: 15000 })
  const doc = frame.contentDocument!
  const paper = required<HTMLIFrameElement>(doc, 'iframe[title="Live printable Torah preview"]').contentDocument!
  const button = (text: string) => [...doc.querySelectorAll<HTMLButtonElement>('.print-workspace button')].find(button => button.textContent?.trim() === text)!
  const metrics = () => {
    const word = required<HTMLElement>(paper, '.reader-text-side.mod-tikkun .word')
    const row = word.closest('tr')!
    const style = paper.defaultView!.getComputedStyle(word)
    return { font: style.fontSize, line: style.lineHeight, ratio: row.getBoundingClientRect().height / word.getBoundingClientRect().height }
  }
  const portrait = metrics()
  expectInvocations(paper, 'בס״ד')
  button('Page setup').click()
  await vi.waitFor(() => expect(button('Landscape')).toBeDefined())
  button('Landscape').click()
  await vi.waitFor(() => expect(required(paper, '.paper-sheet').getBoundingClientRect().width).toBe(1056))
  expect(metrics().font).toBe(portrait.font)
  expect(metrics().line).toBe(portrait.line)
  expect(metrics().ratio).toBeCloseTo(portrait.ratio, 3)
  expectSacredNotices(paper)
  expectInvocations(paper, 'בס״ד')
  button('One Sided').click()
  await vi.waitFor(() => expect(paper.querySelector('.print-book[data-print-sides="one"]')).not.toBeNull())
  expect(metrics().font).toBe(portrait.font)
  expect(metrics().ratio).toBeCloseTo(portrait.ratio, 3)
  const english = required(paper, '.paper-heading [lang="en"]').getBoundingClientRect()
  const hebrew = required(paper, '.paper-heading [lang="he"]').getBoundingClientRect()
  expect(english.right).toBeLessThan(hebrew.left)
  expect(required(paper, '.paper-heading > span').textContent).toBe('|')
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
      expect(plain(form)).toContain('ידוד')
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
    await vi.waitFor(() => expect(plain('tikkun')).toContain('ידוד'))
    button('One Sided').click()
    await vi.waitFor(() => expect(paper.querySelector('.print-book[data-print-sides="one"]')).not.toBeNull())
    expectInvocations(paper, 'בס״ד')
    expect(plain('tikkun')).toContain('אלקים')
    button('Two Sided').click()
    await vi.waitFor(() => expect(paper.querySelector('.print-book[data-print-sides="two"]')).not.toBeNull())
  }
})
