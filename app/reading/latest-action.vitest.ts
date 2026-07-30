import { describe, expect, it } from 'vitest'

import { LatestAction } from './latest-action.ts'

describe('LatestAction', () => {
  it('marks only the newest action as current', () => {
    const action = new LatestAction()

    const first = action.start()
    const second = action.start()

    expect(action.isCurrent(first)).toBe(false)
    expect(action.isCurrent(second)).toBe(true)
  })

  it('can cancel all pending actions', () => {
    const action = new LatestAction()
    const token = action.start()

    action.cancel()

    expect(action.isCurrent(token)).toBe(false)
  })
})
