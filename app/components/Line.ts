import type { LeiningAliyah } from '../calendar-model/model-types.ts'
import type { RenderedLineInfo } from '../view-model/scroll-view-model.ts'
import displayRange from '../display-range.ts'
import hebrewNumeralFromInteger from '../hebrew-numeral.ts'
import { createLastReadingHash } from '../reading/last-reading.ts'
import { createSpecialLetterRenderer } from '../special-letters.ts'
import textFilter from '../text-filter.ts'
import { iconMarkup } from './icons.ts'

const petuchaClass = (isPetucha: boolean) => (isPetucha ? 'mod-petucha' : '')
const setumaClass = (column: unknown[]) =>
  column.length > 1 ? 'mod-setuma' : ''
const inlineWordJoiners = new Set(['׀'])

const stripKriMarkers = (word: string) => word.replace(/[{}]/g, '')

const escapeAttribute = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const tokenizeWords = (text: string) =>
  text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .reduce<{ text: string; isKri: boolean }[]>(
      (words, rawWord) => {
        const word = stripKriMarkers(rawWord)

        if (inlineWordJoiners.has(word) && words.length) {
          words[words.length - 1] = {
            ...words[words.length - 1],
            text: `${words[words.length - 1].text} ${word}`,
          }
          return words
        }

        words.push({
          text: word,
          isKri: /[{}]/.test(rawWord),
        })
        return words
      },
      []
    )

const renderWords = ({
  annotatedText,
  unannotatedText,
  annotationsEnabled,
  pageNumber,
  lineIndex,
  fragmentIndex,
  renderAnnotatedSpecialLetters,
  renderUnannotatedSpecialLetters,
}: {
  annotatedText: string
  unannotatedText: string
  annotationsEnabled: boolean
  pageNumber: number
  lineIndex: number
  fragmentIndex: number
  renderAnnotatedSpecialLetters: (text: string) => string
  renderUnannotatedSpecialLetters: (text: string) => string
}) => {
  const annotatedWords = tokenizeWords(annotatedText)
  const unannotatedWords = tokenizeWords(unannotatedText)
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
      return `<span
        class="word ${activeWord?.isKri ? 'ktiv-kri' : ''}"
        data-token-key="${tokenKey}"
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
      >${activeMarkup}</span>`
    })
    .join(' ')
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
  run: RenderedLineInfo['run']
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
  aliyah: LeiningAliyah | undefined
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
}: {
  pageNumber: number
  lineIndex: number
  annotationsEnabled?: boolean
} & RenderedLineInfo) => {
  const startLabel = aliyahStartLabel(aliyahStarts)
  const startTitle = aliyahStartTitle(run)
  const startVerse = aliyahStartVerseRange(aliyahStarts)
  const references = [focalRef, ...verses]
  const renderAnnotatedSpecialLetters = createSpecialLetterRenderer(references)
  const renderUnannotatedSpecialLetters = createSpecialLetterRenderer(references)

  return `
  <tr
    data-class="line"
    data-line-index="${lineIndex}"
    data-page-number="${pageNumber}"
    ${run ? `data-run-id="${run.id}"` : ''}
    ${
      aliyahStarts.length
        ? `data-aliyah-starts="${aliyahStarts
            .map((aliyah) => aliyah.index)
            .join(',')}"`
        : ''
    }
    ${
      aliyahStarts.length && startTitle
        ? `data-aliyah-start-title="${escapeAttribute(startTitle)}"`
        : ''
    }
    ${
      aliyahStarts.length && startLabel
        ? `data-aliyah-start-label="${escapeAttribute(startLabel)}"`
        : ''
    }
    ${
      aliyahStarts.length && startVerse
        ? `data-aliyah-start-verse="${escapeAttribute(startVerse)}"`
        : ''
    }
  >
    <td class="line ${petuchaClass(isPetucha)}">
      <div class="line-content">
        ${text
          .map(
            (column, columnIndex) => `
          <div class="column">
            ${column
              .map(
                (fragment, fragmentIndex) => `
              <span class="fragment ${setumaClass(column)}">${renderWords({
                  annotatedText: textFilter({ text: fragment, annotated: true }),
                  unannotatedText: textFilter({ text: fragment, annotated: false }),
                  annotationsEnabled,
                  pageNumber,
                  lineIndex,
                  fragmentIndex: columnIndex * 100 + fragmentIndex,
                  renderAnnotatedSpecialLetters,
                  renderUnannotatedSpecialLetters,
                })}</span>
            `
              )
              .join('')}
          </div>
        `
          )
          .join('')}
      </div>
      <div class="line-gutter mod-verses">
        <span class="location-indicator mod-verses">${displayRange.asVersesRange(
          verses
        )}</span>
      </div>
      <div class="line-gutter mod-aliyot">
        <span class="location-indicator mod-aliyot" data-target-id="aliyot-range">${labels
          .map((label, idx) => renderLabelBadge(label, run?.id, aliyahStarts[idx], run))
          .join('')}</span>
      </div>
    </td>
  </tr>
`
}

export default Line
