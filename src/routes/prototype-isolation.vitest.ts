import { afterEach, expect, test, vi } from 'vitest'

const frames: HTMLIFrameElement[] = []

afterEach(() => {
  for (const frame of frames.splice(0)) frame.remove()
})

test('renders public and prototype routes in visibly separate worlds', async () => {
  const publicDocument = await loadRoute(
    `/?prototype-isolation=${Date.now()}`,
    '.home-page'
  )
  expect(publicDocument.querySelector('.prototype-scroll-story')).toBeNull()
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

async function loadRoute(path: string, readySelector: string) {
  const frame = document.createElement('iframe')
  frame.title = `Prototype isolation: ${path}`
  frame.style.width = '1280px'
  frame.style.height = '900px'
  frame.src = path
  frames.push(frame)
  document.body.appendChild(frame)

  await vi.waitFor(
    () => expect(frame.contentDocument?.querySelector(readySelector)).not.toBeNull(),
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
