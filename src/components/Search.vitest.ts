import { afterEach, expect, test } from 'vitest'
import { EventEmitter } from '../event-emitter.ts'
import Search, { type SearchEmitter } from './Search.ts'

afterEach(() => {
  document.body.replaceChildren()
})

function inputValue(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

test('clearing search prevents Enter from re-selecting a detached old result', () => {
  const emitter = new EventEmitter<SearchEmitter>()
  const selections: HTMLElement[] = []
  emitter.on('selection', (selection) => selections.push(selection))
  const search = Search({
    search: () => {
      const result = document.createElement('a')
      result.textContent = 'Result'
      return [result]
    },
    emitter,
  })
  document.body.appendChild(search.node)
  const input = search.node.querySelector<HTMLInputElement>('.search-input')
  if (!input) throw new Error('Missing search input')

  inputValue(input, 'result')
  search.node.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  )
  expect(selections).toHaveLength(1)

  inputValue(input, '')
  search.node.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  )
  expect(selections).toHaveLength(1)
})

test('empty search results tolerate keyboard navigation without a selection', () => {
  const emitter = new EventEmitter<SearchEmitter>()
  const selections: HTMLElement[] = []
  emitter.on('selection', (selection) => selections.push(selection))
  const search = Search({ search: () => [], emitter })
  document.body.appendChild(search.node)
  const input = search.node.querySelector<HTMLInputElement>('.search-input')
  if (!input) throw new Error('Missing search input')

  inputValue(input, 'missing')
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter']) {
    search.node.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true }),
    )
  }

  expect(selections).toEqual([])
  expect(search.node.querySelectorAll('[data-target-class="list-item"]')).toHaveLength(0)
})
