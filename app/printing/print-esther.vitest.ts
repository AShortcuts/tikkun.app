import { afterEach, expect, test, vi } from 'vitest'

let frame: HTMLIFrameElement | undefined
afterEach(() => { frame?.remove(); frame = undefined })

test('Esther prints the whole Megillah and exact custom ranges with small letters in both layouts', async () => {
  frame = document.createElement('iframe')
  frame.style.cssText = 'width:1280px;height:900px'
  frame.src = '/reader/#/esther'
  document.body.append(frame)
  await vi.waitFor(() => expect(frame?.contentDocument?.querySelector('.tikkun-book .word')).not.toBeNull(), { timeout: 15000 })
  const doc = frame.contentDocument!
  frame.contentWindow!.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true }))
  await vi.waitFor(() => expect(doc.querySelector('.preview-region[aria-busy="false"]')).not.toBeNull(), { timeout: 15000 })
  const prepared = required<HTMLIFrameElement>(doc, 'iframe[title="Live printable Esther preview"]')
  const paper = prepared.contentDocument!
  const button = (text: string) => {
    const button = [...doc.querySelectorAll<HTMLButtonElement>('.print-workspace button')].find(button => button.textContent?.trim() === text)
    if (!button) throw new Error(`Missing print option ${text}`)
    return button
  }
  const canonical = () => [...paper.querySelectorAll<HTMLElement>('[data-reader-canonical="true"] .word')]
  const visibleSmallLetters = () => [...paper.querySelectorAll<HTMLElement>('.special-letter.mod-small')].filter(letter => letter.getClientRects().length)
  expect(button('Whole Megillah').getAttribute('aria-pressed')).toBe('true')
  expect(doc.querySelector('.print-workspace')?.textContent).not.toContain('Current aliyah')
  expect(required(paper, '.paper-heading [lang="en"]').textContent).toBe('Esther 1:1–10:3')
  expect(canonical().filter(word => word.textContent?.includes('׃'))).toHaveLength(167)
  expect(paper.querySelector('[data-page-number="17"]')).toBeNull()
  expect(paper.querySelectorAll('[data-reader-canonical="true"] .special-letter.mod-small')).toHaveLength(3)
  expect(required(paper, '.paper-forms [data-print-form="torah"]').textContent).toBe('Megillah')
  button('Page setup').click()
  await vi.waitFor(() => expect(doc.querySelector('.details-page-option input')).not.toBeNull())
  required<HTMLInputElement>(doc, '.details-page-option input').click()
  await vi.waitFor(() => expect(paper.querySelector('.paper-details-card dd')?.textContent).toBe('1–16'))
  expect(paper.querySelector('.paper-details-hebrew')?.textContent).toBe('אסתר')
  expect(paper.querySelector('.paper-details-card dt')?.textContent).toBe('Megillah columns')
  expect(paper.querySelector('.paper-details-aliyot')).toBeNull()
  expect(paper.querySelector('.paper-details-passage [lang="en"]')?.textContent).toBe('Esther 1:1–10:3')
  expect(paper.querySelector('.paper-sheet:last-child')?.getAttribute('data-page-kind')).toBe('details')
  const nativePrint = vi.spyOn(prepared.contentWindow!, 'print').mockImplementation(() => {})
  await vi.waitFor(() => expect(required<HTMLButtonElement>(doc, '.dialog-footer .primary').disabled).toBe(false))
  required<HTMLButtonElement>(doc, '.dialog-footer .primary').click()
  expect(nativePrint).toHaveBeenCalledOnce()
  nativePrint.mockRestore()
  button('Custom range').click()
  await vi.waitFor(() => expect(doc.querySelector('[aria-label="Starting chapter"]')).not.toBeNull())
  const select = async (label: string, value: string) => {
    const input = required<HTMLSelectElement>(doc, `[aria-label="${label}"]`)
    input.value = value
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  await select('Starting chapter', '9')
  await select('Starting pasuk', '7')
  await select('Ending chapter', '9')
  await select('Ending pasuk', '9')
  button('ReaderNatural').click()
  await vi.waitFor(() => expect(paper.querySelector('.paper-heading [lang="en"]')?.textContent).toBe('Esther 9:7–9'))
  expect(paper.querySelector('.paper-details-passage [lang="en"]')?.textContent).toBe('Esther 9:7–9')
  await vi.waitFor(() => expect(paper.querySelector('.print-book[data-reader-layout="reading"]')).not.toBeNull())
  expect(canonical().filter(word => word.textContent?.includes('׃'))).toHaveLength(3)
  expect(paper.querySelectorAll('.special-letter.mod-small')).toHaveLength(6)
  button('One Sided').click()
  await vi.waitFor(() => expect(paper.querySelector('.print-book[data-print-sides="one"]')).not.toBeNull())
  expect(visibleSmallLetters()).toHaveLength(3)
  button('MegillahWithout marks').click()
  await vi.waitFor(() => expect(paper.querySelector('.print-book[data-print-form="torah"]')).not.toBeNull())
  expect(visibleSmallLetters()).toHaveLength(3)
  expect(required(paper, '.paper-body').textContent?.replace(/\s+/g, ' ')).toContain('פרשנדתא')
})

function required<T extends Element>(root: Document, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`Missing ${selector}`)
  return element
}

