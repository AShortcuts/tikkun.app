import { collectPrintStyles } from './print-styles.ts'
import type { PrintOptions } from './print-model.ts'

const outputClass = 'tikkun-print-output'
const fontStyleId = 'tikkun-print-fonts'
const pageStyleId = 'tikkun-print-page'

// Each sheet is drawn at full Letter size. iOS WebKit prints inside its own
// margins, header and footer and ignores @page margin: 0, so there the sheets
// shrink to fit one per page. Other browsers honor the zero margin.
const sheetStyles = String.raw`
:host { all: initial; display: block; --print-fit: 1; }
.print-page { width: calc(var(--paper-width) * var(--print-fit)); height: calc(var(--paper-height) * var(--print-fit)); overflow: hidden; break-inside: avoid; break-after: page; }
.print-page:last-child { break-after: auto; }
.print-page > .paper-sheet { margin: 0; break-after: auto; transform: scale(var(--print-fit)); transform-origin: top left; }
@supports (-webkit-touch-callout: none) { :host { --print-fit: 0.86; } }
`

/** Declares the prepared pages' fonts in this document and loads them before printing. */
export async function preparePrintFonts(frameDocument: Document) {
  const { fontFaces, families } = collectPrintStyles(frameDocument)
  let style = document.getElementById(fontStyleId)
  if (!style) {
    style = document.createElement('style')
    style.id = fontStyleId
    document.head.append(style)
  }
  const css = fontFaces.join('\n')
  if (style.textContent !== css) style.textContent = css
  await Promise.all(families.map(family => document.fonts.load(`16px "${family}"`, 'אבג abc')))
}

export function removePrintOutput() {
  document.querySelector(`.${outputClass}`)?.remove()
  document.getElementById(pageStyleId)?.remove()
  document.getElementById(fontStyleId)?.remove()
}

/**
 * Prints the prepared pages from this document. Safari only honors print()
 * from the document that received the tap, so the sheets are copied out of the
 * preview frame into an isolated print-only layer and printed synchronously.
 */
export function printPreparedPages(frameDocument: Document, orientation: PrintOptions['orientation']) {
  const sheets = frameDocument.querySelectorAll('.print-document > .paper-sheet')
  if (!sheets.length) throw new Error('The prepared pages are not available. Close Print and try again.')
  document.querySelector(`.${outputClass}`)?.remove()
  const host = document.createElement('div')
  host.className = outputClass
  // Carry the preview's root attributes so its root-scoped rules still apply.
  for (const { name, value } of frameDocument.documentElement.attributes) {
    if (name.startsWith('data-') || name === 'style') host.setAttribute(name, value)
  }
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = [...collectPrintStyles(frameDocument, { scopeToHost: true }).rules, sheetStyles].join('\n')
  const pages = document.createElement('div')
  pages.className = 'print-document'
  for (const sheet of sheets) {
    const page = document.createElement('div')
    page.className = 'print-page'
    page.append(document.importNode(sheet, true))
    pages.append(page)
  }
  shadow.append(style, pages)

  let pageStyle = document.getElementById(pageStyleId)
  if (!pageStyle) {
    pageStyle = document.createElement('style')
    pageStyle.id = pageStyleId
    document.head.append(pageStyle)
  }
  pageStyle.textContent = String.raw`
@page { size: letter ${orientation}; margin: 0; }
@media screen { .${outputClass} { display: none !important; } }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; height: auto !important; min-height: 0 !important; overflow: visible !important; background: white !important; }
  body > :not(.${outputClass}) { display: none !important; }
}
`
  document.body.append(host)
  // iOS lays out the print asynchronously, so the layer stays until the next
  // print or until the dialog closes.
  window.print()
}
