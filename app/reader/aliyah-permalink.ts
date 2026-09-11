import { publicReadingUrl } from './share-reading.ts'

const COPIED_STATE_MS = 1600

type AliyahPermalinkElement = HTMLAnchorElement | HTMLButtonElement

const resetTimers = new WeakMap<AliyahPermalinkElement, number>()
const pendingCopies = new WeakSet<AliyahPermalinkElement>()

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
  const timer = resetTimers.get(link)
  if (timer !== undefined) window.clearTimeout(timer)
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

export async function handleAliyahPermalinkClick(event: MouseEvent, options: {
  nativeWriteText?(value: string): Promise<void>
  onError?(): void
} = {}) {
  const target = event.target instanceof Element ? event.target : null
  const link = target?.closest<AliyahPermalinkElement>('[data-aliyah-link="true"]')
  if (!link) return false

  event.preventDefault()
  if (pendingCopies.has(link)) return true
  pendingCopies.add(link)
  resetAliyahPermalink(link)
  try {
    const copyUrl = getAliyahPermalinkCopyUrl(link)
    if (!copyUrl) throw new Error('Missing permalink URL.')
    if (options.nativeWriteText) {
      await options.nativeWriteText(publicReadingUrl(new URL(copyUrl).hash))
    } else {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API is unavailable.')
      await navigator.clipboard.writeText(copyUrl)
    }
  } catch (error) {
    console.warn('Aliyah permalink copy failed.', error)
    options.onError?.()
    return true
  } finally {
    pendingCopies.delete(link)
  }
  if (link.isConnected) setAliyahPermalinkCopied(link)
  return true
}
