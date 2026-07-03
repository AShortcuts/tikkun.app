import { describe, expect, it } from 'vitest'

import type { LeiningRun } from '../calendar-model/model-types.ts'
import {
  getAliyahStartLocation,
  getAliyahStartLocationFromViewModel,
  lineIndexFromLocation,
} from './aliyah-dom-target.ts'

describe('aliyah DOM target helpers', () => {
  it('resolves the start location for a Maftir aliyah independently of the main run', () => {
    const maftirStart = { scroll: 'torah', book: 'Shemos', chapter: 30, verse: 11 }
    const run = {
      aliyot: [
        {
          index: 'Maftir',
          start: maftirStart,
          end: { scroll: 'torah', book: 'Shemos', chapter: 30, verse: 16 },
        },
      ],
    } as LeiningRun

    const location = getAliyahStartLocation(run, 'Maftir', (ref) => {
      expect(ref).toBe(maftirStart)
      return { pageNumber: 42, lineNumber: 7 }
    })

    expect(location).toEqual({ pageNumber: 42, lineNumber: 7 })
  })

  it('converts one-based physical line numbers into rendered line indexes', () => {
    expect(lineIndexFromLocation({ pageNumber: 42, lineNumber: 7 })).toBe(6)
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
    } as LeiningRun
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
})
