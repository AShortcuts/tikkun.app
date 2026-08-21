export interface ReaderProgressPresentationAnchor {
  readonly line: object | null
  readonly label: string
  readonly position: number
}

export interface ReaderProgressPresentationSelection<
  Anchor extends ReaderProgressPresentationAnchor,
> {
  readonly index: number
  readonly current: Anchor | null
}

export interface ReaderProgressPresentationSource<
  Anchor extends ReaderProgressPresentationAnchor,
> {
  readonly anchors: readonly Anchor[]
  at(position: number): ReaderProgressPresentationSelection<Anchor>
}

export interface ReaderProgressNextAnchorRequest {
  readonly afterIndex: number
}

interface ReaderProgressPresentationBase<
  Anchor extends ReaderProgressPresentationAnchor,
> {
  readonly current: Anchor | null
  readonly label: string
  readonly progressIndex: number
}

export interface EmptyReaderProgressPresentation<
  Anchor extends ReaderProgressPresentationAnchor,
> extends ReaderProgressPresentationBase<Anchor> {
  readonly kind: 'empty'
  readonly current: null
  readonly label: 'Loading'
  readonly progressIndex: -1
  readonly percent: 0
  readonly requestNextAnchor: null
}

export interface ReadyReaderProgressPresentation<
  Anchor extends ReaderProgressPresentationAnchor,
> extends ReaderProgressPresentationBase<Anchor> {
  readonly kind: 'ready'
  readonly percent: number
  readonly requestNextAnchor: null
}

export interface PendingReaderProgressPresentation<
  Anchor extends ReaderProgressPresentationAnchor,
> extends ReaderProgressPresentationBase<Anchor> {
  readonly kind: 'request-next-anchor'
  readonly percent: null
  readonly requestNextAnchor: ReaderProgressNextAnchorRequest
}

export type ReaderProgressPresentation<
  Anchor extends ReaderProgressPresentationAnchor,
> =
  | EmptyReaderProgressPresentation<Anchor>
  | ReadyReaderProgressPresentation<Anchor>
  | PendingReaderProgressPresentation<Anchor>

/** Decides Reader progress from injected measurements without runtime mutation. */
export function resolveReaderProgressPresentation<
  Anchor extends ReaderProgressPresentationAnchor,
>({
  source,
  viewportPosition,
  getScrollHeight,
  rangeCurrent,
  isLastAnchor,
}: {
  source: ReaderProgressPresentationSource<Anchor>
  viewportPosition: number
  getScrollHeight(): number
  rangeCurrent: Anchor | null
  isLastAnchor(anchor: Anchor): boolean
}): ReaderProgressPresentation<Anchor> {
  const anchors = source.anchors
  if (anchors.length === 0) {
    return Object.freeze({
      kind: 'empty',
      current: null,
      label: 'Loading',
      progressIndex: -1,
      percent: 0,
      requestNextAnchor: null,
    })
  }

  const { index: currentIndex, current } = source.at(viewportPosition)
  const currentForChrome = rangeCurrent ?? current
  const matchingProgressIndex =
    currentForChrome?.line !== null && currentForChrome?.line !== undefined
      ? anchors.findIndex((anchor) => anchor.line === currentForChrome.line)
      : currentIndex
  const progressIndex =
    matchingProgressIndex >= 0 ? matchingProgressIndex : currentIndex
  const progressCurrent = anchors[progressIndex] ?? current
  const base = {
    current: currentForChrome,
    label: currentForChrome?.label ?? '—',
    progressIndex,
  }

  if (!progressCurrent) {
    return Object.freeze({
      ...base,
      kind: 'ready',
      percent: 0,
      requestNextAnchor: null,
    })
  }

  let nextIndex = progressIndex + 1
  while (anchors[nextIndex]?.position <= progressCurrent.position) {
    nextIndex += 1
  }
  const next = anchors[nextIndex]
  const progressEndPosition = next?.position ??
    (isLastAnchor(progressCurrent)
      ? Math.max(progressCurrent.position + 1, getScrollHeight())
      : null)

  if (progressEndPosition === null) {
    return Object.freeze({
      ...base,
      kind: 'request-next-anchor',
      percent: null,
      requestNextAnchor: Object.freeze({ afterIndex: progressIndex }),
    })
  }

  const progress = Math.max(
    0,
    Math.min(
      1,
      (viewportPosition - progressCurrent.position) /
        (progressEndPosition - progressCurrent.position)
    )
  )
  return Object.freeze({
    ...base,
    kind: 'ready',
    percent: progress * 100,
    requestNextAnchor: null,
  })
}
