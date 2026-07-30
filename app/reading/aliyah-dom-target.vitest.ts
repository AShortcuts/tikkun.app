import { describe, expect, it } from 'vitest'

import type { LeiningRun } from '../calendar-model/model-types.ts'
import {
  AliyahTargetLocationCache,
  findRenderedLineElement,
  getRenderedLineElements,
  getAliyahStartLocation,
  getAliyahStartLocationFromViewModel,
  lineIndexFromLocation,
} from './aliyah-dom-target.ts'

describe('aliyah DOM target helpers', () => {
  it('resolves the start location for a Maftir aliyah independently of the main run', () => {
    const maftirStart = { scroll: 'torah', b: 2, c: 30, v: 11 } as const
    const run = {
      aliyot: [
        {
          index: 'Maftir',
          start: maftirStart,
          end: { scroll: 'torah', b: 2, c: 30, v: 16 },
        },
      ],
    } as unknown as LeiningRun

    const location = getAliyahStartLocation(run, 'Maftir', (ref) => {
      expect(ref).toBe(maftirStart)
      return { pageNumber: 42, lineNumber: 7 }
    })

    expect(location).toEqual({ pageNumber: 42, lineNumber: 7 })
  })

  it('converts one-based physical line numbers into rendered line indexes', () => {
    expect(lineIndexFromLocation({ lineNumber: 7 })).toBe(6)
  })

  it('selects line rows instead of descendant word spans with the same indexes', () => {
    const page = document.createElement('div')
    page.innerHTML = `
      <div data-class="line" data-page-number="1" data-line-index="0">
        <span data-page-number="1" data-line-index="0" data-token-key="1:0:0:0">word</span>
      </div>
    `

    const line = page.firstElementChild
    expect(findRenderedLineElement(page, 0)).toBe(line)
    expect(getRenderedLineElements(page)).toEqual([line])
  })

  it('resolves start locations through a view model resolver', async () => {
    const aliyahStart = { scroll: 'torah', b: 1, c: 8, v: 15 } as const
    const run = {
      aliyot: [
        {
          index: 4,
          start: aliyahStart,
          end: { scroll: 'torah', b: 1, c: 8, v: 19 },
        },
      ],
    } as unknown as LeiningRun
    const viewModel = {
      resolver: Promise.resolve({
        physicalLocationFromRef(ref: typeof aliyahStart) {
          expect(ref).toBe(aliyahStart)
          return { pageNumber: 8, lineNumber: 12 }
        },
      }),
    }

    await expect(
      getAliyahStartLocationFromViewModel(viewModel, run, 4)
    ).resolves.toEqual({ pageNumber: 8, lineNumber: 12 })
  })

  it('caches resolved start locations by run and aliyah', async () => {
    let resolveCount = 0
    const cache = new AliyahTargetLocationCache()
    const run = {
      id: '2026-10-17:shacharis,main',
      aliyot: [
        {
          index: 4,
          start: { scroll: 'torah', b: 1, c: 8, v: 15 },
          end: { scroll: 'torah', b: 1, c: 8, v: 19 },
        },
      ],
    } as unknown as LeiningRun
    const viewModel = {
      resolver: Promise.resolve({
        physicalLocationFromRef() {
          resolveCount += 1
          return { pageNumber: 8, lineNumber: 12 }
        },
      }),
    }

    await expect(cache.get(viewModel, run, 4)).resolves.toEqual({
      pageNumber: 8,
      lineNumber: 12,
    })
    await expect(cache.get(viewModel, run, 4)).resolves.toEqual({
      pageNumber: 8,
      lineNumber: 12,
    })

    expect(resolveCount).toBe(1)
  })
})
