import { iconMarkup } from '../components/icons.ts'

type RectOrigin = Pick<DOMRectReadOnly, 'left' | 'top'>
type GraphemeRect = Pick<DOMRectReadOnly, 'left' | 'top' | 'width'>

export function getFirstGraphemeRect(word: HTMLElement) {
  const textNode = [...word.childNodes].find(
    (node): node is Text =>
      node.nodeType === Node.TEXT_NODE && Boolean(node.textContent)
  )
  const firstGrapheme = textNode?.data.match(/^.\p{Mark}*/u)?.[0]
  if (!textNode || !firstGrapheme) return null

  const range = word.ownerDocument.createRange()
  range.setStart(textNode, 0)
  range.setEnd(textNode, firstGrapheme.length)
  const rect = range.getBoundingClientRect()
  range.detach()
  return rect.width > 0 && rect.height > 0 ? rect : null
}

export function getAliyahStartMarkerPosition(
  containerRect: RectOrigin,
  graphemeRect: GraphemeRect
) {
  return {
    x: graphemeRect.left - containerRect.left + graphemeRect.width / 2,
    y: graphemeRect.top - containerRect.top,
  }
}

export function createAliyahStartMarker({
  label,
  tokenKey,
}: {
  label: string
  tokenKey: string
}) {
  const marker = document.createElement('button')
  marker.type = 'button'
  marker.className = 'aliyah-start-marker'
  marker.dataset.aliyahStartMarker = 'true'
  marker.dataset.tokenKey = tokenKey
  marker.setAttribute('aria-label', `Aliyah ${label} begins here`)
  marker.setAttribute('aria-haspopup', 'dialog')
  marker.setAttribute('aria-expanded', 'false')
  marker.setAttribute('aria-controls', 'aliyah-start-popup')

  const rule = document.createElement('span')
  rule.className = 'aliyah-start-marker-rule'
  rule.setAttribute('aria-hidden', 'true')

  const capsule = document.createElement('span')
  capsule.className = 'aliyah-start-marker-capsule'
  capsule.textContent = label
  capsule.setAttribute('aria-hidden', 'true')

  const chevron = document.createElement('span')
  chevron.className = 'aliyah-start-chevron'
  chevron.innerHTML = iconMarkup('chevronDown')
  chevron.setAttribute('aria-hidden', 'true')

  marker.append(rule, capsule, chevron)
  return marker
}
