export const APP_BANNER_CONTENT = 'app-id=6810923824'
export const READER_APP_BANNER_CONTENT = `${APP_BANNER_CONTENT}, app-argument=https://tikkunreader.com/reader/#/next`

export function updateReaderAppBanner(document: Document, location: Pick<Location, 'search' | 'hash'>) {
  const banner = document.querySelector<HTMLMetaElement>('meta[name="apple-itunes-app"]')
  if (!banner) return
  const url = new URL('https://tikkunreader.com/reader/')
  url.search = location.search
  url.hash = location.hash || '#/next'
  banner.content = `${APP_BANNER_CONTENT}, app-argument=${url.href}`
}
