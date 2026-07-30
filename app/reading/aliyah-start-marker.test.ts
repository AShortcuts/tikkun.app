import { expect, test } from 'vitest'
import { getAliyahStartMarkerPosition } from './aliyah-start-marker.ts'

test('centers the aliyah start marker on the measured first grapheme', () => {
  expect(
    getAliyahStartMarkerPosition(
      { left: 24, top: 80 },
      { left: 284, top: 132, width: 18 }
    )
  ).toEqual({ x: 269, y: 52 })
})
