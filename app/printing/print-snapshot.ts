import { collectPrintStyles, cssUrlPattern } from './print-styles.ts'

async function toDataUrl(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load ${new URL(url).pathname} for printing (${response.status}).`)
  const blob = await response.blob()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${new URL(url).pathname} for printing.`))
    reader.readAsDataURL(blob)
  })
}

/**
 * Copies the prepared print document into one standalone HTML string with its
 * styles, fonts, and images inlined, so a separate native renderer can print it.
 */
export async function createPrintSnapshot(doc: Document) {
  // Capture the DOM and rules synchronously so a re-render cannot interleave.
  const root = doc.documentElement.cloneNode(true) as HTMLElement
  const { fontFaces, rules } = collectPrintStyles(doc)
  root.querySelectorAll('script, link, style, noscript').forEach(node => node.remove())

  const cache = new Map<string, Promise<string>>()
  const inline = (url: string) => {
    let pending = cache.get(url)
    if (!pending) cache.set(url, pending = toDataUrl(url))
    return pending
  }
  const css = [...fontFaces, ...rules].join('\n')
  const resolved = new Map<string, string>()
  await Promise.all([...new Set([...css.matchAll(cssUrlPattern)].map(match => match[2]))]
    .filter(url => !url.startsWith('data:') && !url.startsWith('#'))
    .map(async url => { resolved.set(url, await inline(url)) }))
  await Promise.all([...root.querySelectorAll('img[src]')].map(async image => {
    const source = image.getAttribute('src')!
    if (!source.startsWith('data:')) image.setAttribute('src', await inline(new URL(source, doc.baseURI).href))
  }))

  const head = root.querySelector('head') ?? root.insertBefore(doc.createElement('head'), root.firstChild)
  const style = doc.createElement('style')
  style.textContent = css.replace(cssUrlPattern, (whole, _quote: string, url: string) => resolved.get(url) ? `url("${resolved.get(url)}")` : whole)
  head.append(style)
  return `<!doctype html>\n${root.outerHTML}`
}
