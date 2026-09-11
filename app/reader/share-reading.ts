import { isReaderHash } from '../view-model/navigation/reader-hash.ts'

export function publicReadingUrl(hash: string) {
  const route = hash.split('?')[0]
  if (!isReaderHash(route)) throw new Error('Open a reading before sharing it.')
  return `https://tikkunreader.com/reader/${route}`
}

type ShareNavigator = {
  share?: Navigator['share']
  canShare?: Navigator['canShare']
  clipboard?: Pick<Clipboard, 'writeText'>
}
export type ReadingShareOutcome = 'shared' | 'copied' | 'cancelled'

export async function shareReadingLink(hash: string, options: {
  navigator: ShareNavigator
  nativeShare?: (data: { title: string; url: string }) => Promise<unknown>
}): Promise<ReadingShareOutcome> {
  const data = { title: 'Tikkun Reader', url: publicReadingUrl(hash) }
  try {
    if (options.nativeShare) {
      await options.nativeShare(data)
      return 'shared'
    }
    const navigator = options.navigator
    if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
      // Keep this call synchronous with the click's user activation.
      await navigator.share(data)
      return 'shared'
    }
    if (!navigator.clipboard?.writeText) throw new Error('Sharing and clipboard access are unavailable.')
    await navigator.clipboard.writeText(data.url)
    return 'copied'
  } catch (error) {
    if (error instanceof Error && (options.nativeShare
      ? error.message === 'Share canceled'
      : error.name === 'AbortError')) return 'cancelled'
    throw error
  }
}
