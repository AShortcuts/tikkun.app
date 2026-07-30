import type { LeiningInstance } from '../calendar-model/model-types.ts'
import utils from './utils.ts'
import renderLeiningTitle from './render-leining-title.ts'

const { htmlToElement } = utils

const decorateString = ({
  string,
  atIndexes,
  withDecoration,
}: {
  string: string
  atIndexes: number[]
  withDecoration: (char: string) => string
}) => {
  let indexesIndex = 0
  return string
    .split('')
    .map((char, i) => {
      if (atIndexes[indexesIndex] !== i) return char

      ++indexesIndex
      return withDecoration(char)
    }, '')
    .join('')
}

const strongify = (c: string) => `<strong>${c}</strong>`

const ParshaResult = ({
  match,
  item,
  href,
}: {
  match: { index: number; indexes: number[] }
  item: LeiningInstance
  href: string
}) =>
  htmlToElement(`
  <a data-target-class="parsha-result" href="${href}">
    <p class="search-result-tag mod-hebrew" data-target-class="result-hebrew">${
      match.index === 0
        ? decorateString({
            string: renderLeiningTitle(item),
            atIndexes: match.indexes,
            withDecoration: strongify,
          })
        : renderLeiningTitle(item)
    }: ${item.id}
    </p>
    <p class="search-result-tag">${
      match.index === 1
        ? decorateString({
            string: item.date.title.en,
            atIndexes: match.indexes,
            withDecoration: strongify,
          })
        : item.date.title.en
    }
    </p>
  </a>
`)

export default ParshaResult

const NoResults = () =>
  htmlToElement(`<p class="" style="text-align: center; color: var(--light-text-color);">
  No results
</p>
`)

export { NoResults }
