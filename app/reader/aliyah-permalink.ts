const COPIED_STATE_MS = 1600

type AliyahPermalinkElement = HTMLAnchorElement | HTMLButtonElement

const resetTimers = new WeakMap<AliyahPermalinkElement, number>()

function setAliyahPermalinkCopied(link: AliyahPermalinkElement) {
  link.dataset.copyState = 'copied'
  link.querySelector('[data-aliyah-link-icon="link"]')?.setAttribute('hidden', '')
  link.querySelector('[data-aliyah-link-icon="check"]')?.removeAttribute('hidden')

  const existingTimer = resetTimers.get(link)
  if (existingTimer) window.clearTimeout(existingTimer)
  resetTimers.set(
    link,
    window.setTimeout(() => resetAliyahPermalink(link), COPIED_STATE_MS)
  )
}

function resetAliyahPermalink(link: AliyahPermalinkElement) {
  delete link.dataset.copyState
  link.querySelector('[data-aliyah-link-icon="link"]')?.removeAttribute('hidden')
  link.querySelector('[data-aliyah-link-icon="check"]')?.setAttribute('hidden', '')
  resetTimers.delete(link)
}

function getAliyahPermalinkCopyUrl(link: AliyahPermalinkElement) {
  if (link instanceof HTMLAnchorElement) return link.href

  const permalink = link.dataset.aliyahUrl
  return permalink ? new URL(permalink, window.location.href).href : null
}

export async function handleAliyahPermalinkClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null
  const link = target?.closest<AliyahPermalinkElement>('[data-aliyah-link="true"]')
  if (!link) return false

  event.preventDefault()
  const copyUrl = getAliyahPermalinkCopyUrl(link)
  if (!copyUrl) {
    console.warn('Aliyah permalink copy failed: Missing permalink URL.')
    return true
  }

  if (!navigator.clipboard?.writeText) {
    console.warn('Aliyah permalink copy failed: Clipboard API is unavailable.')
    return true
  }

  try {
    await navigator.clipboard.writeText(copyUrl)
  } catch (error) {
    console.warn('Aliyah permalink copy failed.', error)
    return true
  }
  setAliyahPermalinkCopied(link)
  return true
}
