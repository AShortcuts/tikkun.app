import type { MountScope } from '../lifecycle/mount.ts'

/** Debug overlay that measures the browser and Reader focal centers; the debug control toggles it. */
export function setupDebugFocalMeasure(scope: MountScope, document: Document, view: Window) {
  const requestAnimationFrame = view.requestAnimationFrame.bind(view)
  const cancelAnimationFrame = view.cancelAnimationFrame.bind(view)

  let debugFocalMeasureFrame = 0

  function removeDebugFocalMeasure() {
    if (debugFocalMeasureFrame) {
      cancelAnimationFrame(debugFocalMeasureFrame)
      debugFocalMeasureFrame = 0
    }

    document
      .querySelectorAll('.debug-focal-line, .debug-focal-measure')
      .forEach((el) => el.remove())
  }

  function toggleDebugFocalMeasure() {
    if (document.querySelector('.debug-focal-line, .debug-focal-measure')) {
      removeDebugFocalMeasure()
      return
    }

    const makeLine = (color: string, label: string) => {
      const line = document.createElement('div')
      line.className = 'debug-focal-line'
      line.style.cssText = `
        position: fixed;
        left: 0;
        right: 0;
        height: 0;
        border-top: 2px solid ${color};
        z-index: 999999;
        pointer-events: none;
        font: 13px sans-serif;
        color: white;
        text-shadow: 0 1px 2px black;
      `
      line.textContent = label
      document.body.appendChild(line)
      return line
    }

    const makeMeasure = (color: string, x: number, labelPrefix: string) => {
      const line = document.createElement('div')
      const label = document.createElement('div')
      line.className = 'debug-focal-measure'
      label.className = 'debug-focal-measure'

      line.style.cssText = `
        position: fixed;
        left: ${x}px;
        width: 0;
        border-left: 2px dashed ${color};
        z-index: 999999;
        pointer-events: none;
      `

      label.style.cssText = `
        position: fixed;
        left: ${x + 8}px;
        z-index: 999999;
        pointer-events: none;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.72);
        color: white;
        font: 13px sans-serif;
        white-space: nowrap;
      `

      document.body.append(line, label)

      return {
        update(startY: number, endY: number) {
          const top = Math.min(startY, endY)
          const height = Math.abs(endY - startY)
          line.style.top = `${top}px`
          line.style.height = `${height}px`
          label.style.top = `${top + height / 2 - 12}px`
          label.textContent = `${labelPrefix}: ${Math.round(height)}px`
        },
      }
    }

    const readerBlue = 'lightskyblue'
    const browser = makeLine('red', 'Browser center')
    const reader = makeLine(readerBlue, 'Reader center')
    const browserTop = makeMeasure('red', 24, 'Browser top')
    const browserBottom = makeMeasure('red', 104, 'Browser bottom')
    const readerTop = makeMeasure(readerBlue, 220, 'Reader top')
    const readerBottom = makeMeasure(readerBlue, 300, 'Reader bottom')

    const update = () => {
      const book = document.querySelector<HTMLElement>('[data-target-id="tikkun-book"]')
      if (!book || !browser.isConnected) {
        removeDebugFocalMeasure()
        return
      }

      const rect = book.getBoundingClientRect()
      const browserTopY = 0
      const browserBottomY = document.documentElement.clientHeight
      const browserCenterY = browserBottomY / 2
      const readerTopY = rect.top
      const readerBottomY = rect.top + book.clientHeight
      const readerCenterY = readerTopY + book.clientHeight / 2

      browser.style.top = `${browserCenterY}px`
      reader.style.top = `${readerCenterY}px`
      browserTop.update(browserTopY, browserCenterY)
      browserBottom.update(browserCenterY, browserBottomY)
      readerTop.update(readerTopY, readerCenterY)
      readerBottom.update(readerCenterY, readerBottomY)

      debugFocalMeasureFrame = requestAnimationFrame(update)
    }

    update()
  }

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (!target.closest('[data-target-id="debug-focal-measure-toggle"]')) {
        return
      }
      toggleDebugFocalMeasure()
    },
    { signal: scope.signal }
  )
  scope.own(removeDebugFocalMeasure)
}
