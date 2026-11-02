export const cssUrlPattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g

const unquote = (family: string) => family.trim().replace(/^(['"])(.*)\1$/, '$2')

// Matches a root selector (html or :root) with any attribute or :not() qualifiers.
const rootSelector = /(^|[\s,>+~(])(?:html|:root)((?:\[[^\]]*\]|:not\([^()]*\))*)(?![\w-])/g

/** Rewrites document-root selectors so they match a shadow root's host element. */
export function scopeRootSelectors(selector: string) {
  return selector.replace(rootSelector, (_whole, lead: string, qualifiers: string) => `${lead}${qualifiers ? `:host(${qualifiers})` : ':host'}`)
}

function absoluteUrls(css: string, base: string) {
  return css.replace(cssUrlPattern, (whole, _quote: string, url: string) =>
    url.startsWith('data:') || url.startsWith('#') ? whole : `url("${new URL(url, base).href}")`)
}

/**
 * Reads every stylesheet of the prepared print document. Font faces the pages
 * loaded are split out because they must be declared at document level, and
 * url() references become absolute so the CSS works in another document.
 */
export function collectPrintStyles(doc: Document, { scopeToHost = false } = {}) {
  const view = doc.defaultView
  if (!view) throw new Error('The prepared pages are not available. Close Print and try again.')
  const loadedFamilies = new Set<string>()
  doc.fonts.forEach(font => { if (font.status === 'loaded') loadedFamilies.add(unquote(font.family)) })
  const fontFaces: string[] = []
  const families = new Set<string>()
  const serialize = (rule: CSSRule): string => {
    if (scopeToHost && rule instanceof view.CSSStyleRule) {
      return rule.cssText.replace(rule.selectorText, scopeRootSelectors(rule.selectorText))
    }
    if (scopeToHost && rule instanceof view.CSSGroupingRule) {
      return `${rule.cssText.slice(0, rule.cssText.indexOf('{'))}{\n${[...rule.cssRules].map(serialize).join('\n')}\n}`
    }
    return rule.cssText
  }
  const rules = [...doc.styleSheets].map(sheet => {
    const base = sheet.href ?? doc.baseURI
    const text = [...sheet.cssRules].flatMap(rule => {
      if (!(rule instanceof view.CSSFontFaceRule)) return [serialize(rule)]
      const family = unquote(rule.style.getPropertyValue('font-family'))
      if (loadedFamilies.has(family)) {
        families.add(family)
        fontFaces.push(absoluteUrls(rule.cssText, base))
      }
      return []
    }).join('\n')
    const css = absoluteUrls(text, base)
    return sheet.media.mediaText ? `@media ${sheet.media.mediaText} {\n${css}\n}` : css
  })
  return { fontFaces, families: [...families], rules }
}
