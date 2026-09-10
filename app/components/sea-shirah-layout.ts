// Physical page 78, rows 5-34: preserve the supplied text and fragment breaks.
// CSS owns both track widths and fragment placement; markup carries only semantics.
export type SeaShirahPattern = (typeof seaShirahRows)[number]
export type SeaShirahMeasurements = Partial<Record<SeaShirahPattern, number[]>>

export function seaShirahGeometry(measured: SeaShirahMeasurements, gap: number) {
  const width = (pattern: SeaShirahPattern, index: number) => measured[pattern]?.[index] ?? 0
  const outer = Math.max(width('fragments-3', 0), width('fragments-3', 2), width('closing', 0))
  const middle = width('fragments-3', 1)
  const half = Math.max(...(measured['fragments-2'] ?? []), width('extended-left', 0), width('penultimate', 1))
  const extendedLeft = width('extended-left', 1)
  const penultimateRight = width('penultimate', 0)
  const required = Math.max(
    width('opening', 0),
    2 * outer + middle + 2 * gap,
    2 * half + gap,
    half + extendedLeft + gap,
    penultimateRight + half + gap,
    outer + width('closing', 1) + gap,
  )
  return { required, outer, middle, half, extendedLeft, penultimateRight }
}

const seaShirahRows = [
  'opening',
  'fragments-3',
  'fragments-2',
  'fragments-3',
  'fragments-2',
  'fragments-3',
  'extended-left',
  'fragments-3',
  'fragments-2',
  'fragments-3',
  'fragments-2',
  'fragments-3',
  'fragments-2',
  'fragments-3',
  'fragments-2',
  'fragments-3',
  'fragments-2',
  'fragments-3',
  'fragments-2',
  'fragments-3',
  'fragments-2',
  'fragments-3',
  'fragments-2',
  'fragments-3',
  'fragments-2',
  'fragments-3',
  'fragments-2',
  'fragments-3',
  'penultimate',
  'closing',
] as const

export function seaShirahLayout(pageNumber: number, lineIndex: number) {
  if (pageNumber !== 78) return null
  const pattern = seaShirahRows[lineIndex - 5]
  return pattern ? { pattern } : null
}
