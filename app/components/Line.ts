import type { LeiningAliyah } from '../calendar-model/model-types.ts'
import type { RenderedLineInfo } from '../view-model/scroll-view-model.ts'
import displayRange from '../display-range.ts'
import hebrewNumeralFromInteger from '../hebrew-numeral.ts'
import { createLastReadingHash } from '../reading/last-reading.ts'
import { isInvertedNun, tokenizeReaderWords } from '../reader/word-tokenization.ts'
import { createSpecialLetterRenderer } from '../special-letters.ts'
import textFilter from '../text-filter.ts'
import { iconMarkup } from './icons.ts'
import { seaShirahLayout } from './sea-shirah-layout.ts'
import {
  defaultReaderPagePresentation,
  type ReaderPagePresentation,
} from '../reader-presentation.ts'

const petuchaClass = (isPetucha: boolean) => (isPetucha ? 'mod-petucha' : '')
const setumaClass = (column: unknown[]) =>
  column.length > 1 ? 'mod-setuma' : ''
const escapeAttribute = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
const stripHebrewMarks = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '')

const renderWords = ({
  annotatedText,
  unannotatedText,
  annotationsEnabled,
  pageNumber,
  lineIndex,
  fragmentIndex,
  renderAnnotatedSpecialLetters,
  renderUnannotatedSpecialLetters,
  readingLayout,
}: {
  annotatedText: string
  unannotatedText: string
  annotationsEnabled: boolean
  pageNumber: number
  lineIndex: number
  fragmentIndex: number
  renderAnnotatedSpecialLetters: (text: string) => string
  renderUnannotatedSpecialLetters: (text: string) => string
  readingLayout: boolean
}) => {
  const annotatedWords = tokenizeReaderWords(annotatedText)
  const unannotatedWords = tokenizeReaderWords(unannotatedText)
  const wordCount = Math.max(annotatedWords.length, unannotatedWords.length)

  return Array.from({ length: wordCount }, (_, wordIndex) => {
    const annotatedWord = annotatedWords[wordIndex]
    const unannotatedWord = unannotatedWords[wordIndex]
    const annotatedMarkup = annotatedWord
      ? renderAnnotatedSpecialLetters(annotatedWord.text)
      : ''
    const unannotatedMarkup = unannotatedWord
      ? renderUnannotatedSpecialLetters(unannotatedWord.text)
      : ''
    const activeWord = annotationsEnabled ? annotatedWord : unannotatedWord
    const activeMarkup = annotationsEnabled
      ? annotatedMarkup
      : unannotatedMarkup
    const alternateMarkup = annotationsEnabled
      ? unannotatedMarkup
      : annotatedMarkup
    const tokenKey = `${pageNumber}:${lineIndex}:${fragmentIndex}:${wordIndex}`
    const endsPasuk = Boolean(annotatedWord?.text.includes('׃'))
    return `<span
        class="word ${activeWord?.isKri ? 'ktiv-kri' : ''}${endsPasuk ? ' mod-sof-pasuk' : ''}"
        ${isInvertedNun(annotatedWord?.text ?? '') ? '' : `data-token-key="${tokenKey}"`}
        data-page-number="${pageNumber}"
        data-line-index="${lineIndex}"
        data-fragment-index="${fragmentIndex}"
        data-word-index="${wordIndex}"
        data-annotations-mode="${annotationsEnabled ? 'on' : 'off'}"
        data-annotations-alternate="${escapeAttribute(alternateMarkup)}"
        data-annotations-on-text="${escapeAttribute(annotatedWord?.text ?? '')}"
        data-annotations-on-present="${Boolean(annotatedWord)}"
        data-annotations-off-present="${Boolean(unannotatedWord)}"
        data-annotations-on-kri="${Boolean(annotatedWord?.isKri)}"
        data-annotations-off-kri="${Boolean(unannotatedWord?.isKri)}"
        ${activeWord ? '' : 'hidden'}
      >${activeMarkup}</span>${
        readingLayout && endsPasuk
          ? '<br class="reader-pasuk-break" aria-hidden="true">'
          : ''
      }`
  }).join(' ')
}

const addLabelBreakOpportunities = (label: string) =>
  label.replace(/([־-])/g, '$1<wbr>')

const aliyahStartTitle = (run: RenderedLineInfo['run']) =>
  run?.leining.date.title.he.replace(/^פרשת /, '') ??
  run?.leining.date.title.en.replace(/^Parshat\s+/i, '') ??
  ''

const aliyahIndexLabels = new Map<LeiningAliyah['index'], string>([
  [1, 'ראשון'],
  [2, 'שני'],
  [3, 'שלישי'],
  [4, 'רביעי'],
  [5, 'חמישי'],
  [6, 'ששי'],
  [7, 'שביעי'],
  ['Maftir', 'מפטיר'],
])

const aliyahStartLabel = (aliyahStarts: LeiningAliyah[]) =>
  aliyahStarts
    .map((aliyah) => aliyahIndexLabels.get(aliyah.index))
    .filter(Boolean)
    .join(', ')

const formatRefChapterVerse = ({ c, v }: { c: number; v: number }) =>
  `${hebrewNumeralFromInteger(c)}:${hebrewNumeralFromInteger(v)}`

const aliyahStartVerseRange = (aliyahStarts: LeiningAliyah[]) =>
  aliyahStarts
    .map((aliyah) => {
      const start = formatRefChapterVerse(aliyah.start)
      const end =
        aliyah.start.c === aliyah.end.c
          ? hebrewNumeralFromInteger(aliyah.end.v)
          : formatRefChapterVerse(aliyah.end)
      return start === end ? start : `${start}-${end}`
    })
    .join(', ')

const renderLabelBadge = (
  label: string,
  runId: string | undefined,
  aliyah: LeiningAliyah | undefined,
  run: RenderedLineInfo['run'],
) => `
  <span
    class="aliyah-badge${aliyah?.index ? ' mod-with-audio' : ''}"
    ${aliyah?.index ? `data-aliyah-marker="true"` : ''}
    ${runId ? `data-run-id="${runId}"` : ''}
    ${aliyah?.index ? `data-aliyah-index="${aliyah.index}"` : ''}
  >
    ${
      aliyah?.index
        ? `<button
            type="button"
            class="aliyah-audio-button"
            data-audio-button="true"
            data-run-id="${runId}"
            data-aliyah-index="${aliyah.index}"
            aria-label="Play ${label}"
          >${iconMarkup('play')}</button>`
        : ''
    }
    <span class="aliyah-label-text">${addLabelBreakOpportunities(label)}</span>
    ${renderAliyahLink(label, run, aliyah)}
  </span>
`

const renderAliyahLink = (
  label: string,
  run: RenderedLineInfo['run'],
  aliyah: LeiningAliyah | undefined,
) => {
  if (!run || !aliyah?.start) return ''

  const href = createLastReadingHash(run, aliyah.start)
  return `
    <button
      type="button"
      class="aliyah-link"
      data-aliyah-link="true"
      data-aliyah-url="${escapeAttribute(href)}"
      aria-label="Copy link to ${escapeAttribute(label)}"
      title="Copy link to ${escapeAttribute(label)}"
    ><span data-aliyah-link-icon="link">${iconMarkup('link')}</span><span data-aliyah-link-icon="check" hidden>${iconMarkup('check')}</span></button>
  `
}

type ReaderTextSurface = 'single' | 'tikkun' | 'torah'

type MatchShirahLayout = {
  kind: 'haazinu' | 'sea'
  pattern:
    | 'columns-2'
    | 'fragments-2'
    | 'fragments-3'
    | 'extended-left'
    | 'opening'
    | 'penultimate'
    | 'closing'
}

export const getMatchShirahLayout = (
  text: string[][],
  reference: RenderedLineInfo['focalRef'],
  pageNumber: number,
  lineIndex: number,
): MatchShirahLayout | null => {
  const seaLayout =
    reference?.b === 2 &&
    seaShirahLayout(pageNumber, lineIndex)
  if (seaLayout) return { kind: 'sea', pattern: seaLayout.pattern }
  if (!reference) return null

  if (
    reference.b === 5 &&
    reference.c === 32 &&
    reference.v >= 1 &&
    reference.v <= 43 &&
    text.length === 2
  ) {
    return { kind: 'haazinu', pattern: 'columns-2' }
  }

  return null
}

export const renderTextFlow = ({
  text,
  references,
  annotationsEnabled,
  pageNumber,
  lineIndex,
  presentation,
  surface,
}: {
  text: string[][]
  references: (
    | RenderedLineInfo['focalRef']
    | RenderedLineInfo['verses'][number]
  )[]
  annotationsEnabled: boolean
  pageNumber: number
  lineIndex: number
  presentation: ReaderPagePresentation
  surface: ReaderTextSurface
}) => {
  const fixedAnnotations =
    surface === 'tikkun' ? true : surface === 'torah' ? false : null
  const enabled = fixedAnnotations ?? annotationsEnabled
  const renderAnnotatedSpecialLetters = createSpecialLetterRenderer(references)
  const renderUnannotatedSpecialLetters =
    createSpecialLetterRenderer(references)

  return `<div
    class="reader-text-side mod-${surface}"
    data-reader-canonical="${surface !== 'torah'}"
    ${fixedAnnotations === null ? '' : `data-reader-annotations="${enabled ? 'on' : 'off'}"`}
    ${surface === 'torah' ? 'aria-hidden="true"' : ''}
  >
    <div class="reader-text-flow">
      ${text
        .map(
          (column, columnIndex) => `
        <div class="column">
          ${column
            .map((fragment, fragmentIndex) => {
              const annotatedText = textFilter({
                text: fragment,
                annotated: true,
              })
              const unannotatedText =
                presentation.layout === 'reading' && presentation.sides === 'two'
                  ? stripHebrewMarks(annotatedText)
                  : textFilter({ text: fragment, annotated: false })

              return `
            <span class="fragment ${setumaClass(column)}">${renderWords(
              {
                annotatedText,
                unannotatedText,
                annotationsEnabled: enabled,
                pageNumber,
                lineIndex,
                fragmentIndex: columnIndex * 100 + fragmentIndex,
                renderAnnotatedSpecialLetters,
                renderUnannotatedSpecialLetters,
                readingLayout: presentation.layout === 'reading',
              },
            )}</span>
          `
            })
            .join('')}
        </div>
      `,
        )
        .join('')}
    </div>
  </div>`
}

const renderLineAttributes = ({
  pageNumber,
  lineIndex,
  run,
  aliyahStarts,
  startTitle,
  startLabel,
  startVerse,
  mirror,
}: {
  pageNumber: number
  lineIndex: number
  run: RenderedLineInfo['run']
  aliyahStarts: LeiningAliyah[]
  startTitle: string
  startLabel: string
  startVerse: string
  mirror: boolean
}) => `
    data-line-index="${lineIndex}"
    data-page-number="${pageNumber}"
    ${mirror ? 'data-reader-mirror="true"' : 'data-class="line"'}
    ${run ? `data-run-id="${run.id}"` : ''}
    ${
      !mirror && aliyahStarts.length
        ? `data-aliyah-starts="${aliyahStarts
            .map((aliyah) => aliyah.index)
            .join(',')}"`
        : ''
    }
    ${
      !mirror && aliyahStarts.length && startTitle
        ? `data-aliyah-start-title="${escapeAttribute(startTitle)}"`
        : ''
    }
    ${
      !mirror && aliyahStarts.length && startLabel
        ? `data-aliyah-start-label="${escapeAttribute(startLabel)}"`
        : ''
    }
    ${
      !mirror && aliyahStarts.length && startVerse
        ? `data-aliyah-start-verse="${escapeAttribute(startVerse)}"`
        : ''
    }
  `

const Line = ({
  pageNumber,
  text,
  verses,
  focalRef,
  isPetucha,
  labels,
  aliyahStarts,
  run,
  lineIndex,
  annotationsEnabled = true,
  presentation = defaultReaderPagePresentation,
  surface = 'single',
  mirror = false,
  renderVerseGutter = true,
  pageReference,
}: {
  pageNumber: number
  lineIndex: number
  annotationsEnabled?: boolean
  presentation?: ReaderPagePresentation
  surface?: ReaderTextSurface
  mirror?: boolean
  renderVerseGutter?: boolean
  pageReference?: RenderedLineInfo['focalRef']
} & RenderedLineInfo) => {
  const startLabel = aliyahStartLabel(aliyahStarts)
  const startTitle = aliyahStartTitle(run)
  const startVerse = aliyahStartVerseRange(aliyahStarts)
  const references = [focalRef, ...verses]
  const shirahReference = verses[0] ?? focalRef ?? pageReference
  const matchShirahLayout =
    presentation.layout === 'match'
      ? getMatchShirahLayout(
          text,
          shirahReference,
          pageNumber,
          lineIndex,
        )
      : null
  const isShirah =
    presentation.layout === 'match'
      ? text.length > 1 || matchShirahLayout !== null
      : false
  const lineAttributes = renderLineAttributes({
    pageNumber,
    lineIndex,
    run,
    aliyahStarts,
    startTitle,
    startLabel,
    startVerse,
    mirror,
  })
  const textSurfaces =
    presentation.sides === 'two' && surface === 'single'
      ? (['tikkun', 'torah'] as const)
          .map((side) =>
            renderTextFlow({
              text,
              references,
              annotationsEnabled,
              pageNumber,
              lineIndex,
              presentation,
              surface: side,
            }),
          )
          .join('')
      : renderTextFlow({
          text,
          references,
          annotationsEnabled,
          pageNumber,
          lineIndex,
          presentation,
          surface,
        })

  if (presentation.layout === 'reading') {
    return `
      <div
        class="${mirror ? 'reader-mirror-line' : 'line'} mod-reading-line${
          isShirah ? ' mod-shirah' : ''
        }"
        ${lineAttributes}
      >
        <div class="line-content">${textSurfaces}</div>
        ${
          renderVerseGutter
            ? `<div class="line-gutter mod-verses">
                <span class="location-indicator mod-verses">${displayRange.asVersesRange(
                  verses,
                )}</span>
              </div>`
            : ''
        }
        ${
          mirror
            ? ''
            : `<div class="line-gutter mod-aliyot">
                <span class="location-indicator mod-aliyot" data-target-id="aliyot-range">${labels
                  .map((label, idx) =>
                    renderLabelBadge(label, run?.id, aliyahStarts[idx], run),
                  )
                  .join('')}</span>
              </div>`
        }
      </div>
    `
  }

  return `
  <tr
    class="${isShirah ? 'mod-shirah' : ''}"
    ${lineAttributes}
    ${
      matchShirahLayout
        ? `data-shirah-kind="${matchShirahLayout.kind}" data-shirah-pattern="${matchShirahLayout.pattern}"`
        : ''
    }
  >
    <td class="line ${petuchaClass(isPetucha)}">
      <div class="line-content">${textSurfaces}</div>
      <div class="line-gutter mod-verses">
        <span class="location-indicator mod-verses">${displayRange.asVersesRange(
          verses,
        )}</span>
      </div>
      <div class="line-gutter mod-aliyot">
        <span class="location-indicator mod-aliyot" data-target-id="aliyot-range">${labels
          .map((label, idx) =>
            renderLabelBadge(label, run?.id, aliyahStarts[idx], run),
          )
          .join('')}</span>
      </div>
    </td>
  </tr>
`
}

export default Line
