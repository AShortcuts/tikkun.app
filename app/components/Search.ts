import utils from './utils.ts'
import SelectList, { setSelected, getSelected } from './SelectList.ts'
import { EventEmitter } from '../event-emitter.ts'

const { htmlToElement: html, whenKey, purgeNode } = utils

export type SearchEmitter = {
  selection: HTMLElement
  search: string
  clear: undefined
}

const Search = ({
  search,
  emitter,
}: {
  search: (query: string) => Element[]
  emitter: EventEmitter<SearchEmitter>
}) => {
  let list: HTMLElement | null = null

  const self = html(`
    <div class="search">
      <div class="search-bar">
        <span class="search-icon">⚲</span>
        <input class="search-input" placeholder="Search..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
      </div>
      <div class="search-results u-hidden">
      </div>
    </div>
  `)

  self.addEventListener(
    'keydown',
    whenKey('Enter', () => {
      if (!list) return
      const selected = getSelected(list)
      if (selected) emitter.emit('selection', selected)
    }),
  )

  const onSelect = (item: HTMLElement) => emitter.emit('selection', item)

  ;[
    { key: 'ArrowDown', adjustment: (selected: number) => selected + 1 },
    { key: 'ArrowUp', adjustment: (selected: number) => selected - 1 },
    {
      key: { key: 'n', ctrl: true },
      adjustment: (selected: number) => selected + 1,
    },
    {
      key: { key: 'p', ctrl: true },
      adjustment: (selected: number) => selected - 1,
    },
  ].forEach(({ key, adjustment }) =>
    self.addEventListener(
      'keydown',
      whenKey(key, (e) => {
        if (!list) return
        e.preventDefault()
        setSelected(list, adjustment)
      }),
    ),
  )

  const searchInput = self.querySelector<HTMLInputElement>('.search-input')
  const searchResults = self.querySelector<HTMLElement>('.search-results')
  if (!searchInput || !searchResults) {
    throw new Error('Search failed to render its required input and results elements')
  }

  searchInput.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value

    purgeNode(searchResults)

    if (query) {
      emitter.emit('search', query)
      const results = search(query)
      list = SelectList(results, searchInput, onSelect)

      searchResults.appendChild(list)
      searchResults.classList.remove('u-hidden')
    } else {
      list = null
      emitter.emit('clear', undefined)
      searchResults.classList.add('u-hidden')
    }
  })

  return {
    node: self,
    focus: () => {
      searchInput.focus()
    },
  }
}

export default Search
