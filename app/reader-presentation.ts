export const readerTextLayouts = ['reading', 'match'] as const
export const readerSideModes = ['one', 'two'] as const
export const readerSideOrders = ['tikkun-right', 'torah-right'] as const

export type ReaderTextLayout = (typeof readerTextLayouts)[number]
export type ReaderSideMode = (typeof readerSideModes)[number]
export type ReaderSideOrder = (typeof readerSideOrders)[number]

export interface ReaderPagePresentation {
  layout: ReaderTextLayout
  sides: ReaderSideMode
}

export const defaultReaderPagePresentation: ReaderPagePresentation = {
  layout: 'match',
  sides: 'one',
}

export const isReaderTextLayout = (value: unknown): value is ReaderTextLayout =>
  typeof value === 'string' &&
  readerTextLayouts.some((layout) => layout === value)

export const isReaderSideMode = (value: unknown): value is ReaderSideMode =>
  typeof value === 'string' && readerSideModes.some((mode) => mode === value)

export const isReaderSideOrder = (value: unknown): value is ReaderSideOrder =>
  typeof value === 'string' && readerSideOrders.some((order) => order === value)

export function effectiveReaderSideMode(
  preferred: ReaderSideMode,
  compact: boolean
): ReaderSideMode {
  return preferred === 'two' && !compact ? 'two' : 'one'
}
