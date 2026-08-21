import { afterEach, expect, test, vi } from 'vitest'

let frame: HTMLIFrameElement | null = null

afterEach(() => {
  frame?.remove()
  frame = null
})

test('keeps the latest reader route authoritative during rapid navigation', async () => {
  frame = document.createElement('iframe')
  frame.title = 'Reader display generation runtime test'
  frame.style.width = '1280px'
  frame.style.height = '900px'
  frame.src = `/reader/?display-session=${Date.now()}#/torah/parsha/beresheet`
  document.body.append(frame)

  await waitForReaderReady(frame)
  const frameWindow = requiredFrameWindow(frame)
  const frameDocument = requiredFrameDocument(frame)

  frameWindow.location.hash = '#/torah/parsha/noach'
  frameWindow.location.hash = '#/torah/parsha/vayetzei/1-29-18'

  await vi.waitFor(
    () => {
      expect(frameWindow.location.hash).toBe(
        '#/torah/parsha/vayetzei/1-29-18'
      )
      expect(
        frameDocument.querySelector('[data-target-id="parsha-title"]')
          ?.textContent
      ).toContain('ויצא')
      const book = requiredBook(frameDocument)
      expect(book.querySelector('[data-page-number]')).not.toBeNull()
      expect(book.style.visibility).toBe('')
      expect(book.hasAttribute('aria-busy')).toBe(false)
    },
    { timeout: 15_000, interval: 50 }
  )
}, 30_000)

test('toggles the focal measure from lazily loaded reader settings', async () => {
  frame = document.createElement('iframe')
  frame.title = 'Reader focal measure runtime test'
  frame.style.width = '1280px'
  frame.style.height = '900px'
  frame.src = `/reader/?focal-measure=${Date.now()}#/torah/parsha/beresheet`
  document.body.append(frame)

  await waitForReaderReady(frame)
  const frameDocument = requiredFrameDocument(frame)
  requiredButton(frameDocument, '[data-target-id="settings-toggle"]').click()

  await vi.waitFor(
    () => {
      expect(
        requiredButton(
          frameDocument,
          '[data-target-id="settings-pane"] [data-target-id="debug-focal-measure-toggle"]'
        ).offsetParent
      ).not.toBeNull()
    },
    { timeout: 15_000, interval: 50 }
  )

  const focalMeasureToggle = requiredButton(
    frameDocument,
    '[data-target-id="settings-pane"] [data-target-id="debug-focal-measure-toggle"]'
  )
  focalMeasureToggle.click()

  await vi.waitFor(() => {
    expect(frameDocument.querySelectorAll('.debug-focal-line')).toHaveLength(2)
    expect(frameDocument.querySelectorAll('.debug-focal-measure')).toHaveLength(
      8
    )
    expect(frameDocument.body.textContent).toContain('Browser center')
    expect(frameDocument.body.textContent).toContain('Reader center')
  })

  focalMeasureToggle.click()
  await vi.waitFor(() => {
    expect(
      frameDocument.querySelector('.debug-focal-line, .debug-focal-measure')
    ).toBeNull()
  })
}, 30_000)

test('replaces the URL when aliyah starts cross the focal point and restores that aliyah after reload', async () => {
  frame = document.createElement('iframe')
  frame.title = 'Reader scroll route runtime test'
  frame.style.width = '390px'
  frame.style.height = '844px'
  frame.src =
    `/reader/?scroll-route=${Date.now()}` +
    '#/torah/parsha/beresheet/1-1-1'
  document.body.append(frame)
  const targetFrame = frame

  await waitForReaderReady(targetFrame)
  const frameWindow = requiredFrameWindow(targetFrame)
  const frameDocument = requiredFrameDocument(targetFrame)
  const book = requiredBook(frameDocument)
  await waitForAliyahStart(frameDocument, '2')
  requiredAliyahRailButton(frameDocument, '3').click()
  const thirdAliyah = await waitForAliyahStart(frameDocument, '3')
  await new Promise((resolve) => frameWindow.setTimeout(resolve, 1600))
  const secondAliyah = requiredAliyahStart(frameDocument, '2')
  const historyLength = frameWindow.history.length

  const secondAliyahStartCrossing = scrollTopForElementTopAtFocal(
    book,
    secondAliyah
  )
  const thirdAliyahStartCrossing = scrollTopForElementTopAtFocal(
    book,
    thirdAliyah
  )
  book.scrollTop = Math.max(0, secondAliyahStartCrossing - 4)
  await new Promise((resolve) => frameWindow.setTimeout(resolve, 100))

  const touchStart = new frameWindow.Event('touchstart', { bubbles: true })
  Object.defineProperty(touchStart, 'changedTouches', {
    value: [{ screenX: 0 }],
  })
  book.dispatchEvent(touchStart)

  await vi.waitFor(
    () => {
      const focalY = readerFocalPointClientY(book)
      expect(secondAliyah.getBoundingClientRect().top).toBeGreaterThan(focalY)
      expect(frameWindow.location.hash).toBe(
        '#/torah/parsha/beresheet/1-1-1'
      )
    },
    { timeout: 15_000, interval: 50 }
  )

  book.scrollTop = secondAliyahStartCrossing + 4

  await vi.waitFor(
    () => {
      const focalY = readerFocalPointClientY(book)
      expect(secondAliyah.getBoundingClientRect().top).toBeLessThan(focalY)
      expect(frameWindow.location.hash).toBe(
        '#/torah/parsha/beresheet/1-2-4'
      )
      expect(
        frameDocument
          .querySelector('[data-target-id="toolbar-current-aliyah-label"]')
          ?.textContent?.trim()
      ).toBe('שני')
    },
    { timeout: 15_000, interval: 50 }
  )
  expect(frameWindow.history.length).toBe(historyLength)

  book.scrollTop = thirdAliyahStartCrossing - 4
  await vi.waitFor(() => {
    expect(frameWindow.location.hash).toBe(
      '#/torah/parsha/beresheet/1-2-4'
    )
  })

  book.scrollTop = thirdAliyahStartCrossing + 4
  await vi.waitFor(() => {
    expect(frameWindow.location.hash).toBe(
      '#/torah/parsha/beresheet/1-2-20'
    )
  })

  book.scrollTop = thirdAliyahStartCrossing - 4
  await vi.waitFor(() => {
    expect(frameWindow.location.hash).toBe(
      '#/torah/parsha/beresheet/1-2-20'
    )
  })

  book.scrollTop = secondAliyahStartCrossing + 4
  await new Promise((resolve) => frameWindow.setTimeout(resolve, 100))
  expect(frameWindow.location.hash).toBe(
    '#/torah/parsha/beresheet/1-2-20'
  )

  book.scrollTop = secondAliyahStartCrossing - 4
  await vi.waitFor(() => {
    expect(frameWindow.location.hash).toBe(
      '#/torah/parsha/beresheet/1-2-4'
    )
  })

  const aliyahHash = frameWindow.location.hash

  const reloaded = new Promise<void>((resolve) => {
    targetFrame.addEventListener('load', () => resolve(), { once: true })
  })
  frameWindow.location.reload()
  await reloaded
  await waitForReaderReady(targetFrame)

  await vi.waitFor(
    () => {
      const reloadedWindow = requiredFrameWindow(targetFrame)
      const reloadedDocument = requiredFrameDocument(targetFrame)
      const reloadedBook = requiredBook(reloadedDocument)
      const reloadedSecondAliyah = requiredAliyahStart(reloadedDocument, '2')
      const focalY = readerFocalPointClientY(reloadedBook)
      expect(reloadedWindow.location.hash).toBe(aliyahHash)
      expect(reloadedBook.scrollTop).toBeGreaterThan(0)
      expect(
        Math.abs(reloadedSecondAliyah.getBoundingClientRect().top - focalY)
      ).toBeLessThan(160)
    },
    { timeout: 15_000, interval: 50 }
  )
}, 40_000)

test('promotes the URL when scrolling across a parsha boundary', async () => {
  frame = document.createElement('iframe')
  frame.title = 'Reader parsha scroll route runtime test'
  frame.style.width = '1280px'
  frame.style.height = '900px'
  frame.src =
    `/reader/?parsha-scroll-route=${Date.now()}` +
    '#/torah/parsha/beresheet/1-5-25'
  document.body.append(frame)

  await waitForReaderReady(frame)
  const frameWindow = requiredFrameWindow(frame)
  const frameDocument = requiredFrameDocument(frame)
  const book = requiredBook(frameDocument)
  const noachStart = requiredAliyahStartWithLabel(frameDocument, 'נח')
  const historyLength = frameWindow.history.length

  book.dispatchEvent(
    new frameWindow.WheelEvent('wheel', { bubbles: true, deltaY: 1_650 })
  )
  book.scrollTop = scrollTopForFocalElement(book, noachStart)

  await vi.waitFor(
    () => {
      expect(frameWindow.location.hash).toBe(
        '#/torah/parsha/noach/1-6-9'
      )
      expect(
        frameDocument
          .querySelector('[data-target-id="parsha-title"]')
          ?.textContent?.trim()
      ).toBe('נח')
    },
    { timeout: 15_000, interval: 50 }
  )
  expect(frameWindow.history.length).toBe(historyLength)
}, 30_000)

test('promotes the URL when entering a combined parsha', async () => {
  frame = document.createElement('iframe')
  frame.title = 'Reader combined parsha scroll route runtime test'
  frame.style.width = '1280px'
  frame.style.height = '900px'
  frame.src =
    `/reader/?combined-parsha-scroll-route=${Date.now()}` +
    '#/run/2026-08-29:shacharis,main/5-29-6'
  document.body.append(frame)

  await waitForReaderReady(frame)
  const frameWindow = requiredFrameWindow(frame)
  const frameDocument = requiredFrameDocument(frame)
  const book = requiredBook(frameDocument)
  const combinedStart = requiredAliyahStartWithLabel(
    frameDocument,
    'נצבים־וילך'
  )
  const historyLength = frameWindow.history.length

  book.dispatchEvent(
    new frameWindow.WheelEvent('wheel', { bubbles: true, deltaY: 1_650 })
  )
  book.scrollTop = scrollTopForFocalElement(book, combinedStart)

  await vi.waitFor(
    () => {
      expect(frameWindow.location.hash).toBe(
        '#/torah/parsha/nitzavim-vayelech/5-29-9'
      )
      expect(
        frameDocument
          .querySelector('[data-target-id="parsha-title"]')
          ?.textContent?.trim()
      ).toBe('נצבים־וילך')
    },
    { timeout: 15_000, interval: 50 }
  )
  expect(frameWindow.history.length).toBe(historyLength)
}, 30_000)

function requiredFrameWindow(target: HTMLIFrameElement) {
  if (!target.contentWindow) throw new Error('Application iframe has no window')
  return target.contentWindow as Window & typeof globalThis
}

function requiredFrameDocument(target: HTMLIFrameElement) {
  if (!target.contentDocument) {
    throw new Error('Application iframe has no document')
  }
  return target.contentDocument
}

function requiredBook(document: Document) {
  const book = document.querySelector<HTMLElement>(
    '[data-target-id="tikkun-book"]'
  )
  if (!book) throw new Error('Reader runtime test requires the book')
  return book
}

function requiredButton(document: Document, selector: string) {
  const button = document.querySelector<HTMLButtonElement>(selector)
  if (!button) throw new Error(`Reader runtime test requires ${selector}`)
  return button
}

function requiredAliyahStart(document: Document, aliyahIndex: string) {
  const line = [
    ...document.querySelectorAll<HTMLElement>('[data-aliyah-starts]'),
  ].find((candidate) =>
    candidate.dataset.aliyahStarts?.split(',').includes(aliyahIndex)
  )
  if (!line) {
    throw new Error(`Reader runtime test requires aliyah ${aliyahIndex}`)
  }
  return line
}

async function waitForAliyahStart(document: Document, aliyahIndex: string) {
  await vi.waitFor(
    () => expect(requiredAliyahStart(document, aliyahIndex)).not.toBeNull(),
    { timeout: 15_000, interval: 50 }
  )
  return requiredAliyahStart(document, aliyahIndex)
}

function requiredAliyahRailButton(document: Document, aliyahIndex: string) {
  const button = document.querySelector<HTMLButtonElement>(
    `.aliyah-rail-button[data-aliyah-index="${aliyahIndex}"]`
  )
  if (!button) {
    throw new Error(`Reader runtime test requires aliyah ${aliyahIndex} navigation`)
  }
  return button
}

function requiredAliyahStartWithLabel(document: Document, label: string) {
  const line = [
    ...document.querySelectorAll<HTMLElement>('[data-aliyah-starts]'),
  ].find(
    (candidate) =>
      candidate.querySelector('.aliyah-label-text')?.textContent?.trim() ===
      label
  )
  if (!line) {
    throw new Error(`Reader runtime test requires aliyah label ${label}`)
  }
  return line
}

function scrollTopForFocalElement(book: HTMLElement, element: HTMLElement) {
  const elementRect = element.getBoundingClientRect()
  return Math.max(
    0,
    book.scrollTop +
      (elementRect.top - readerFocalPointClientY(book)) +
      elementRect.height / 2
  )
}

function scrollTopForElementTopAtFocal(
  book: HTMLElement,
  element: HTMLElement
) {
  const elementRect = element.getBoundingClientRect()
  return Math.max(
    0,
    book.scrollTop +
      (elementRect.top - readerFocalPointClientY(book))
  )
}

function readerFocalPointClientY(book: HTMLElement) {
  const rootRect = book.getBoundingClientRect()
  const ownerDocument = book.ownerDocument
  const rawPreferences = ownerDocument.defaultView?.localStorage.getItem(
    'tikkun.reader-preferences'
  )
  const storedPreferences: unknown = rawPreferences
    ? JSON.parse(rawPreferences)
    : null
  const focalPointMode =
    storedPreferences && typeof storedPreferences === 'object'
      ? (storedPreferences as { focalPointMode?: unknown }).focalPointMode
      : null
  const focalY =
    focalPointMode === 'browser'
      ? ownerDocument.documentElement.clientHeight / 2
      : rootRect.top + book.clientHeight / 2

  return Math.max(rootRect.top, Math.min(rootRect.bottom - 1, focalY))
}

async function waitForReaderReady(target: HTMLIFrameElement) {
  await vi.waitFor(
    () => {
      const document = requiredFrameDocument(target)
      const book = requiredBook(document)
      expect(book.querySelector('[data-page-number]')).not.toBeNull()
      expect(book.style.visibility).toBe('')
      expect(book.hasAttribute('aria-busy')).toBe(false)
    },
    { timeout: 15_000, interval: 50 }
  )
}
