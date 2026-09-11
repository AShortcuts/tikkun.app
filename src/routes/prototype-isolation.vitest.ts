import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'

const frames: HTMLIFrameElement[] = []
beforeEach(async () => { await page.viewport(1440, 1000) })

afterEach(() => {
  for (const frame of frames.splice(0)) frame.remove()
})

test('keeps the legacy home separate while the promoted story and prototype share the approved design', async () => {
  const legacyDocument = await loadRoute(
    `/old-v2.html?prototype-isolation=${Date.now()}`,
    '.home-page'
  )
  expect(legacyDocument.querySelector('.prototype-scroll-story')).toBeNull()
  const publicDocument = await loadRoute(
    `/?prototype-isolation=${Date.now()}`,
    '.prototype-scroll-story'
  )
  expect(required(publicDocument, '#scroll-hero-title').textContent).toContain('Read along.')
  expect(
    publicDocument.querySelector('a[href$="/prototypes/scroll-story/"]')
  ).toBeNull()

  const storyDocument = await loadRoute(
    `/prototypes/scroll-story/?prototype-isolation=${Date.now()}`,
    '.prototype-scroll-story'
  )
  const storyRoot = required(storyDocument, '.prototype-scroll-story')
  expect(storyRoot.textContent).toContain('Tikkun Reader')
  expect(storyRoot.textContent).toContain(
    'A Torah-reading companion by Ocean of Torah'
  )
  expect(storyRoot.textContent).toContain('The work behind the reader')
  expect(storyDocument.querySelectorAll('iframe')).toHaveLength(1)
  expect(
    storyDocument.querySelector<HTMLIFrameElement>('iframe')?.title
  ).toBe('Interactive Beresheet Torah reader')
  const storyFilm = required(storyDocument, '.scroll-reader-journey')
  expect(storyFilm.querySelector('.scroll-practice')).not.toBeNull()
  expect(storyFilm.querySelector('.scroll-stage-practice')).not.toBeNull()
  expect(
    storyDocument.querySelector<HTMLButtonElement>(
      '.scroll-theme-footer button[data-theme="light"]'
    )?.getAttribute('aria-pressed')
  ).toBe('true')
  expect(
    storyDocument.querySelector<HTMLAnchorElement>(
      'a[href$="/reader/#/torah/parsha/beresheet/1-1-1"]'
    )
  ).not.toBeNull()
})

test.each(['/', '/prototypes/scroll-story/'])('keeps the reader pinned during the scroll journey at %s', async (path) => {
  const document = await loadRoute(path, '.scroll-reader-stage')
  const view = document.defaultView!
  const stage = required(document, '.scroll-reader-stage')
  const motion = required(document, '.scroll-reader-motion')
  const startTransform = view.getComputedStyle(motion).transform

  view.scrollTo({ top: 1200, behavior: 'instant' })

  await vi.waitFor(() => {
    expect(view.scrollY).toBe(1200)
    expect(stage.getBoundingClientRect().top).toBeCloseTo(
      Number.parseFloat(view.getComputedStyle(stage).top), 0
    )
    expect(view.getComputedStyle(motion).transform).not.toBe(startTransform)
  })
})

async function loadRoute(path: string, readySelector: string) {
  const frame = document.createElement('iframe')
  frame.title = `Prototype isolation: ${path}`
  frame.style.width = '1280px'
  frame.style.height = '900px'
  frame.style.position = 'fixed'
  frame.style.inset = '0'
  frame.src = path
  frames.push(frame)
  document.body.appendChild(frame)

  await vi.waitFor(
    () => {
      expect(frame.contentDocument?.querySelector(readySelector)).toBeTruthy()
      expect(frame.contentDocument?.documentElement.dataset.appHydrated).toBe('true')
      for (const embedded of frame.contentDocument!.querySelectorAll<HTMLIFrameElement>('iframe')) {
        expect(embedded.contentDocument?.querySelector('[data-reader-boot-state="ready"]')).toBeTruthy()
      }
    },
    { timeout: 15_000, interval: 50 }
  )
  if (!frame.contentDocument) throw new Error(`No document for ${path}`)
  return frame.contentDocument
}

function required(document: Document, selector: string) {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`Missing route element: ${selector}`)
  return element
}
