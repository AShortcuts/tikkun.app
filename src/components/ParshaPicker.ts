import fuzzy from '../fuzzy.ts'
import utils from './utils.ts'
import ParshaResult, { NoResults } from './ParshaResult.ts'
import Search from './Search.ts'
import type { SearchEmitter } from './Search.ts'
import EventEmitter from '../event-emitter.ts'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import { HDate } from '@hebcal/hdate'
import {
  LeiningRunType,
  LeiningInstanceId,
} from '../calendar-model/model-types.ts'
import type {
  LeiningAliyah,
  LeiningInstance,
} from '../calendar-model/model-types.ts'
import { generateUrl } from '../view-model/navigation/url-parser.ts'
import { isVezosHabracha } from '../view-model/scroll-view-model.ts'
import renderLeiningTitle from './render-leining-title.ts'
import {
  generateTorahReferenceHash,
  listTorahBooks,
  listTorahChapters,
  listTorahVerses,
} from './torah-reference.ts'
import { semanticParshaUrlForLeining } from '../view-model/navigation/parsha-routes.ts'

const { htmlToElement, whenKey } = utils

const dateFormat = Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const AVAILABLE_SCROLLS = new Set(['torah', 'esther'])
const aliyahLabels = new Map<LeiningAliyah['index'], string>([
  [1, '1st - ראשון'],
  [2, '2nd - שני'],
  [3, '3rd - שלישי'],
  [4, '4th - רביעי'],
  [5, '5th - חמישי'],
  [6, '6th - ששי'],
  [7, '7th - שביעי'],
  ['Maftir', 'Maftir - מפטיר'],
])

export type ParshaAliyahChoice = {
  label: string
  href: string
}

export type ParshaAliyahChoiceGroup = {
  label: string
  choices: ParshaAliyahChoice[]
}

const doubleParshaPartsByTitle = new Map<string, [string, string]>([
  ['ויקהל־פקודי', ['ויקהל', 'פקודי']],
  ['תזריע־מצרע', ['תזריע', 'מצרע']],
  ['אחרי מות־קדשים', ['אחרי מות', 'קדשים']],
  ['בהר־בחקתי', ['בהר', 'בחקתי']],
  ['חקת־בלק', ['חקת', 'בלק']],
  ['מטות־מסעי', ['מטות', 'מסעי']],
  ['נצבים־וילך', ['נצבים', 'וילך']],
])

type PopupRect = {
  width: number
  height: number
}

type AnchorRect = {
  left: number
  top: number
  right: number
  bottom: number
}

type ViewportRect = {
  width: number
  height: number
}

export function calculateAnchoredPopupPosition({
  anchorX,
  triggerRect,
  popupRect,
  viewport,
}: {
  anchorX: number
  triggerRect: AnchorRect
  popupRect: PopupRect
  viewport: ViewportRect
}) {
  const margin = 12
  const gap = 8
  const fitsBelow = triggerRect.bottom + gap + popupRect.height <= viewport.height - margin
  const preferredTop = fitsBelow
    ? triggerRect.bottom + gap
    : triggerRect.top - popupRect.height - gap

  return {
    left: Math.min(
      Math.max(anchorX, margin),
      viewport.width - popupRect.width - margin
    ),
    top: Math.min(
      Math.max(preferredTop, margin),
      viewport.height - popupRect.height - margin
    ),
  }
}

const navigationHrefForLeining = (leining: LeiningInstance) =>
  semanticParshaUrlForLeining(leining) ?? generateUrl(leining.runs[0])

function parshaTitle(leining: LeiningInstance) {
  return renderLeiningTitle(leining)
}

export function parshaListTitleForLeining(leining: LeiningInstance) {
  if (isVezosHabracha(leining.runs[0])) return 'וזאת הברכה'
  return renderLeiningTitle(leining)
}

export function buildParshaAliyahChoices(
  leining: LeiningInstance
): ParshaAliyahChoice[] {
  return leining.runs
    .filter(
      (run) =>
        run.scroll === 'torah' &&
        (run.type === LeiningRunType.Main || run.type === LeiningRunType.Maftir)
    )
    .flatMap((run) =>
      run.aliyot
        .filter((aliyah) => aliyah.index)
        .map((aliyah) => ({
          label: aliyahLabels.get(aliyah.index) ?? String(aliyah.index),
          href:
            semanticParshaUrlForLeining(leining, aliyah.start) ??
            generateUrl(run, aliyah.start),
        }))
    )
}

export function buildParshaAliyahChoiceGroups(
  leining: LeiningInstance,
  sourceLeinings: LeiningInstance[]
): ParshaAliyahChoiceGroup[] {
  const label = parshaTitle(leining)
  const choices = buildParshaAliyahChoices(leining)
  const doubleParts = doubleParshaPartsByTitle.get(label)

  if (!doubleParts) return [{ label, choices }]

  const singleParshaGroups = doubleParts.flatMap((part) => {
    const match = sourceLeinings.find(
      (candidate) => candidate !== leining && parshaTitle(candidate) === part
    )
    if (!match) return []

    return [{ label: part, choices: buildParshaAliyahChoices(match) }]
  })

  return [{ label, choices }, ...singleParshaGroups]
}

const renderAliyahChoices = (choices: ParshaAliyahChoice[]) =>
  choices
    .map(
      (choice) => `
          <a class="aliyah-selection-option" role="menuitem" href="${choice.href}">
            ${choice.label}
          </a>
        `
    )
    .join('')

const renderAliyahGroups = (groups: ParshaAliyahChoiceGroup[]) =>
  groups
    .map(
      (group, index) => `
          <button class="aliyah-selection-option mod-group" type="button" role="menuitem" data-choice-group-index="${index}">
            ${group.label}
          </button>
        `
    )
    .join('')

export function renderAliyahPopupContent(groups: ParshaAliyahChoiceGroup[]) {
  if (groups.length !== 1) return renderAliyahGroups(groups)

  const [group] = groups
  return `
    <div class="aliyah-selection-heading">${group.label}</div>
    ${renderAliyahChoices(group.choices)}
  `
}

function collectParshaChoiceSourceLeinings(
  generator: LeiningGenerator,
  baseLeinings: LeiningInstance[]
) {
  const currentYear = new HDate().getFullYear()
  const extraLeinings = []

  for (let year = currentYear - 3; year <= currentYear + 8; year += 1) {
    extraLeinings.push(
      ...generator
        .forHebrewYear(year)
        .flatMap((date) => date.leinings)
        .filter((leining) => leining.isParsha)
    )
  }

  return [...baseLeinings, ...extraLeinings]
}

const Parsha = (
  leining: LeiningInstance,
  options: { aliyahChoiceId?: string; title?: string } = {}
) => `
  <li><a
    class="parsha"
    href="${navigationHrefForLeining(leining)}"
    ${options.aliyahChoiceId ? `data-aliyah-choice-id="${options.aliyahChoiceId}"` : ''}
  >
    ${options.title ?? renderLeiningTitle(leining)}
  </a></li>
  `
const Book = (
  book: LeiningInstance[],
  aliyahChoiceIdFor: (leining: LeiningInstance) => string | null
) => `
  <li class="parsha-book">
    <ol class="parsha-list">
      ${book
        .map((leining) =>
          Parsha(leining, {
            aliyahChoiceId: aliyahChoiceIdFor(leining) ?? undefined,
            title: parshaListTitleForLeining(leining),
          })
        )
        .join('')}
    </ol>
  </li>
`

const ComingUpReading = (obj: LeiningInstance, index: number) => {
  return `
  <li style="display: table-cell; width: calc(100% / 3); padding: 0 0.5em;">
    <div class="stack small" style="display: flex; flex-direction: column; align-items: center;">
      <a
        href="${index === 0 ? '#/next' : navigationHrefForLeining(obj)}"
        class="coming-up-button"
      >${renderLeiningTitle(obj, { forCalendar: true })}</a>
      <time class="coming-up-date">${dateFormat.format(obj.date.date)}</time>
    </div>
  </li>
  `
}

const ComingUp = (comingUpReadings: LeiningInstance[]) => `
  <section dir="ltr" id="coming-up" class="section mod-alternate mod-padding">
    <div class="stack medium">
      <label class="section-label">Coming up</label>
      <div style="overflow-x: auto;">
        <ol id="coming-up-readings-list" class="cluster" style="list-style: none; display: table; margin-left: auto; margin-right: auto; white-space: nowrap;">
          ${comingUpReadings
            .map((reading, index) => ({ reading, index }))
            .reverse()
            .map(({ reading, index }) => ComingUpReading(reading, index))
            .join('')}
        </ol>
      </div>
    </div>
  </section>
`

const holidayColumnOrder = ['rosh-hashanah', 'sukkot', 'pesach', 'chanukah'] as const

function holidayColumnFor(leining: LeiningInstance) {
  const title = leining.date.title.he

  if (
    title.startsWith('סוכות') ||
    title.startsWith('הושענא רבה') ||
    title.startsWith('שמיני עצרת') ||
    title.startsWith('שמחת תורה')
  ) {
    return 'sukkot'
  }

  if (
    title.startsWith('פסח') ||
    title.startsWith('שביעי של פסח') ||
    title.startsWith('פורים') ||
    title.startsWith('שושן פורים') ||
    title.startsWith('שבועות') ||
    title.startsWith('עשרה בטבת') ||
    title.startsWith('שבעה עשר בתמוז') ||
    title.startsWith('צום תמוז') ||
    title.startsWith('תשעה באב')
  ) {
    return 'pesach'
  }

  if (title.startsWith('חנוכה') || title.startsWith('ראש חודש')) {
    return 'chanukah'
  }

  return 'rosh-hashanah'
}

const groupHolidays = (leinings: LeiningInstance[]) => {
  const groups = Object.fromEntries(
    holidayColumnOrder.map((key) => [key, [] as LeiningInstance[]])
  ) as Record<(typeof holidayColumnOrder)[number], LeiningInstance[]>

  for (const leining of leinings) {
    if (leining.isParsha) continue
    if (leining.id === LeiningInstanceId.Megillah) continue
    if (leining.runs[0].scroll !== 'torah') continue
    // Only include the first ראש חודש
    if (
      leining.date.title.he.startsWith('ראש חודש') &&
      groups.chanukah.some((existing) =>
        existing.date.title.he.startsWith('ראש חודש')
      )
    ) {
      continue
    }
    if (leining.date.title.he.startsWith('תענית אסתר')) continue

    groups[holidayColumnFor(leining)].push(leining)
  }

  return holidayColumnOrder.map((column) => groups[column]).filter((group) => group.length)
}

const Browse = (
  leinings: LeiningInstance[],
  aliyahChoiceIdFor: (leining: LeiningInstance) => string | null
) => `
  <div class="browse">
    <h2 class="section-heading">פרשת השבוע</h2>
    <ol class="parsha-books mod-emphasize-first-in-group">
      ${leinings
        .filter((o) => o.isParsha || isVezosHabracha(o.runs[0]))
        .reduce((books, leining, idx) => {
          // TODO: Change to groupBy()
          const book = leining.runs[0].aliyot[0].start.b
          books[book] = books[book] || []
          books[book].push({ ...leining, idx })
          return books
        }, [])
        .map((book) => Book(book, aliyahChoiceIdFor))
        .join('')}
    </ol>

    <h2 class="section-heading">חגים</h2>
    <ol class="parsha-books mod-holidays">
      ${groupHolidays(leinings)
        .map(
          (col) => `
        <li class="parsha-book">
          <ol class="parsha-list">
            ${col.map((leining) => Parsha(leining)).join('\n')}
          </ol>
        </li>
      `
        )
        .join('\n')}
    </ol>

    <h2 class="section-heading">מגילות</h2>
    <ol class="parsha-books">
      <li class="parsha-book">
        <ol class="parsha-list">
          ${leinings
            .filter((o) => o.id === LeiningInstanceId.Megillah)
            .map((leining) => Parsha(leining))
            .join('\n')}
        </ol>
      </li>
    </ol>
  </div>
`

const top = (n: number) => (_: unknown, i: number) => i < n

const TorahReferencePicker = () => {
  const [firstBook] = listTorahBooks()
  const chapters = listTorahChapters(firstBook.number)
  const firstChapter = chapters[0]
  const verses = listTorahVerses(firstBook.number, firstChapter)

  return `
    <section class="torah-reference-panel" dir="ltr">
      <div class="stack medium">
        <div class="torah-reference-header">
          <label class="section-label">Go to Torah reference</label>
          <p class="torah-reference-copy">Jump straight to a chapter and verse in the Torah.</p>
        </div>
        <form class="torah-reference-form" data-target-id="torah-reference-form">
          <div class="torah-reference-grid">
            <label class="torah-reference-field">
              <span>Sefer</span>
              <select data-target-id="torah-book-select">
                ${listTorahBooks()
                  .map(
                    (book) =>
                      `<option value="${book.number}">${book.label} · ${book.hebrew}</option>`
                  )
                  .join('')}
              </select>
            </label>
            <label class="torah-reference-field">
              <span>Chapter</span>
              <select data-target-id="torah-chapter-select">
                ${chapters
                  .map((chapter) => `<option value="${chapter}">${chapter}</option>`)
                  .join('')}
              </select>
            </label>
            <label class="torah-reference-field">
              <span>Verse</span>
              <select data-target-id="torah-verse-select">
                ${verses
                  .map((verse) => `<option value="${verse}">${verse}</option>`)
                  .join('')}
              </select>
            </label>
          </div>
          <button class="torah-reference-button" type="submit">Go</button>
        </form>
      </div>
    </section>
  `
}

const search = (leinings: LeiningInstance[], query: string) => {
  const results = fuzzy(leinings, query, (o) => [
    o.date.title.he,
    o.date.title.en,
  ])

  if (!results.length) return [NoResults()]

  return results
    .filter(top(5))
    .map((result) =>
      ParshaResult({
        ...result,
        href: navigationHrefForLeining(result.item),
      })
    )
}
export default (generator: LeiningGenerator) => {
  const leinings = generator
    .forEntireChumash(new HDate())
    .flatMap((ld) => ld.leinings)
    .filter((leining) => AVAILABLE_SCROLLS.has(leining.runs[0].scroll))

  const searchEmitter = EventEmitter.new<SearchEmitter>()
  const s = Search({
    search: search.bind(null, leinings),
    emitter: searchEmitter,
  })
  const parshaChoiceSourceLeinings = collectParshaChoiceSourceLeinings(
    generator,
    leinings
  )
  const aliyahChoicesById = new Map<string, ParshaAliyahChoiceGroup[]>()
  const aliyahChoiceIdFor = (leining: LeiningInstance) => {
    if (!leining.isParsha && !isVezosHabracha(leining.runs[0])) return null

    const groups = buildParshaAliyahChoiceGroups(
      leining,
      parshaChoiceSourceLeinings
    ).filter((group) => group.choices.length)
    if (!groups.length) return null

    const id = `parsha-aliyot-${aliyahChoicesById.size}`
    aliyahChoicesById.set(id, groups)
    return id
  }

  const comingUpReadings = leinings
    .filter((ld) => ld.date.date > new Date())
    .slice(0, 3)

  const self = htmlToElement(`
    <div class="parsha-picker">
      <div class="stack xlarge">
        <div class="centerize">
          <div id="search" style="display: inline-block;"></div>
        </div>
        ${TorahReferencePicker()}
        ${ComingUp(comingUpReadings)}
        ${Browse(leinings, aliyahChoiceIdFor)}
      </div>
    </div>
  `)

  searchEmitter.on('search', () => {
    self.querySelector('.browse').classList.add('u-hidden')
    self.querySelector('#coming-up').classList.add('u-hidden')
  })

  searchEmitter.on('clear', () => {
    self.querySelector('.browse').classList.remove('u-hidden')
    self.querySelector('#coming-up').classList.remove('u-hidden')
  })

  self
    .querySelector('#search')
    .parentNode.replaceChild(s.node, self.querySelector('#search'))

  const torahReferenceForm = self.querySelector<HTMLFormElement>(
    '[data-target-id="torah-reference-form"]'
  )
  const bookSelect = self.querySelector<HTMLSelectElement>(
    '[data-target-id="torah-book-select"]'
  )
  const chapterSelect = self.querySelector<HTMLSelectElement>(
    '[data-target-id="torah-chapter-select"]'
  )
  const verseSelect = self.querySelector<HTMLSelectElement>(
    '[data-target-id="torah-verse-select"]'
  )

  if (!torahReferenceForm || !bookSelect || !chapterSelect || !verseSelect) {
    throw new Error('Torah reference picker failed to mount.')
  }

  const setNumericOptions = (
    select: HTMLSelectElement,
    values: number[],
    selectedValue?: number
  ) => {
    select.innerHTML = values
      .map((value) => `<option value="${value}">${value}</option>`)
      .join('')

    if (!values.length) return

    const nextValue = values.includes(selectedValue ?? Number.NaN)
      ? selectedValue!
      : values[0]
    select.value = String(nextValue)
  }

  const syncVerseOptions = () => {
    setNumericOptions(
      verseSelect,
      listTorahVerses(Number(bookSelect.value), Number(chapterSelect.value)),
      Number(verseSelect.value)
    )
  }

  const syncChapterOptions = () => {
    setNumericOptions(
      chapterSelect,
      listTorahChapters(Number(bookSelect.value)),
      Number(chapterSelect.value)
    )
    syncVerseOptions()
  }

  bookSelect.addEventListener('change', syncChapterOptions)
  chapterSelect.addEventListener('change', syncVerseOptions)
  torahReferenceForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const nextHash = generateTorahReferenceHash({
      book: Number(bookSelect.value),
      chapter: Number(chapterSelect.value),
      verse: Number(verseSelect.value),
    })
    if (location.hash === nextHash) {
      window.dispatchEvent(new Event('hashchange'))
      return
    }
    location.hash = nextHash
  })

  let aliyahPopup: HTMLElement | null = null
  let aliyahPopupAbortController: AbortController | null = null

  const hideAliyahPopup = () => {
    aliyahPopupAbortController?.abort()
    aliyahPopupAbortController = null
    aliyahPopup?.remove()
    aliyahPopup = null
  }

  const positionAliyahPopup = (
    popup: HTMLElement,
    trigger: HTMLElement,
    anchorX: number
  ) => {
    const triggerRect = trigger.getBoundingClientRect()
    const rect = popup.getBoundingClientRect()
    const { left, top } = calculateAnchoredPopupPosition({
      anchorX,
      triggerRect,
      popupRect: rect,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    })

    popup.style.left = `${left}px`
    popup.style.top = `${top}px`
  }

  const setAliyahPopupContent = (
    popup: HTMLElement,
    groups: ParshaAliyahChoiceGroup[]
  ) => {
    popup.innerHTML = renderAliyahPopupContent(groups)
  }

  const showAliyahPopup = (
    trigger: HTMLElement,
    groups: ParshaAliyahChoiceGroup[],
    event: MouseEvent
  ) => {
    hideAliyahPopup()

    const popup = htmlToElement(`
      <div class="aliyah-selection-popup" role="menu" aria-label="Select aliyah">
      </div>
    `) as HTMLElement
    setAliyahPopupContent(popup, groups)
    aliyahPopup = popup
    document.body.appendChild(popup)
    aliyahPopupAbortController = new AbortController()

    const rect = trigger.getBoundingClientRect()
    positionAliyahPopup(popup, trigger, event.clientX || rect.left)

    popup.addEventListener(
      'click',
      (event) => {
        event.stopPropagation()
        const mouseEvent = event as MouseEvent
        const target = event.target as HTMLElement
        const groupOption = target.closest<HTMLButtonElement>(
          '[data-choice-group-index]'
        )
        if (groupOption) {
          const group = groups[Number(groupOption.dataset.choiceGroupIndex)]
          if (!group) return
          setAliyahPopupContent(popup, [group])
          positionAliyahPopup(popup, trigger, mouseEvent.clientX || rect.left)
          return
        }

        const link = target.closest<HTMLAnchorElement>('a[href^="#/"]')
        if (
          link &&
          !mouseEvent.metaKey &&
          !mouseEvent.ctrlKey &&
          !mouseEvent.shiftKey &&
          !mouseEvent.altKey &&
          link.getAttribute('href') === location.hash
        ) {
          event.preventDefault()
          hideAliyahPopup()
          window.dispatchEvent(new Event('hashchange'))
          return
        }

        if (target.closest('.aliyah-selection-option')) {
          hideAliyahPopup()
        }
      },
      { signal: aliyahPopupAbortController.signal }
    )

    const popupController = aliyahPopupAbortController
    window.setTimeout(() => {
      if (!popupController || popupController.signal.aborted) return
      document.addEventListener(
        'click',
        (event) => {
          if (event.composedPath().includes(popup)) return
          hideAliyahPopup()
        },
        { signal: popupController.signal }
      )
    }, 0)
  }

  self.addEventListener('click', (event) => {
    const mouseEvent = event as MouseEvent
    const target = event.target as HTMLElement
    const trigger = target.closest<HTMLAnchorElement>('[data-aliyah-choice-id]')

    if (!trigger) {
      hideAliyahPopup()
      return
    }

    if (
      mouseEvent.metaKey ||
      mouseEvent.ctrlKey ||
      mouseEvent.shiftKey ||
      mouseEvent.altKey
    ) {
      return
    }

    const groups = aliyahChoicesById.get(trigger.dataset.aliyahChoiceId ?? '')
    if (!groups) return

    event.preventDefault()
    showAliyahPopup(trigger, groups, mouseEvent)
  })

  self.addEventListener('scroll', hideAliyahPopup)
  self.addEventListener(
    'keydown',
    whenKey('Escape', () => {
      hideAliyahPopup()
    })
  )

  return {
    node: self,
    onMount: () => {
      setTimeout(() => s.focus(), 0)
    },
  }
}
