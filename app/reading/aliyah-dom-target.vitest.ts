import { describe, expect, it } from 'vitest'

import type { LeiningRun } from '../calendar-model/model-types.ts'
import { getAliyahStartLocation } from './aliyah-dom-target.ts'

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
})
