// Physical page 78, rows 5-34: preserve the supplied text and fragment breaks.
// Eight equal layout units form a stable brick pattern. These are display
// proportions, not a claim about a particular handwritten scroll's measurements.
export const SEA_SHIRAH_UNITS = 8

export const seaShirahProfiles = {
  opening: [[1, 8]],
  'fragments-3': [
    [1, 1],
    [3, 4],
    [8, 1],
  ],
  'fragments-2': [
    [1, 3],
    [6, 3],
  ],
  'extended-left': [
    [1, 3],
    [5, 4],
  ],
  penultimate: [
    [1, 4],
    [6, 3],
  ],
  closing: [
    [1, 1],
    [3, 6],
  ],
} as const

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
] as const satisfies readonly (keyof typeof seaShirahProfiles)[]

export function seaShirahLayout(pageNumber: number, lineIndex: number) {
  if (pageNumber !== 78) return null
  const pattern = seaShirahRows[lineIndex - 5]
  return pattern ? { pattern, tracks: seaShirahProfiles[pattern] } : null
}
