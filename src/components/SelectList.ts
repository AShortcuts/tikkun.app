import utils from './utils.ts'

const { htmlToElement } = utils

const setSelected = (
  list: Element,
  adjustSelected: (index: number) => number,
) => {
  const items = [...list.querySelectorAll('[data-target-class="list-item"]')]
  if (!items.length) return

  const selectedIndex = Math.max(
    items.findIndex((item) => item.getAttribute('data-selected') === 'true'),
    0,
  )

  const selected = items[selectedIndex]
  if (!selected) return
  selected.removeAttribute('data-selected')

  const nextIndex =
    (adjustSelected(selectedIndex) + items.length) % items.length

  const next = items[nextIndex]
  if (!next) throw new Error('Select list could not resolve its next item')
  next.setAttribute('data-selected', 'true')
}

export { setSelected }

const getSelected = (list: Element) =>
  list.querySelector<HTMLElement>(
    '[data-target-class="list-item"][data-selected="true"]',
  )

export { getSelected }

const SelectList = (
  items: Element[],
  _el: Element,
  onSelect: (el: HTMLElement) => void,
) => {
  const list = htmlToElement(`
    <ol class="list"></ol>
  `)
  if (!(list instanceof HTMLOListElement)) {
    throw new Error('Select list failed to render its list element')
  }

  items.forEach((item) => {
    const listItem = htmlToElement(
      '<li class="list-item" data-target-class="list-item"></li>',
    )
    if (!(listItem instanceof HTMLLIElement)) {
      throw new Error('Select list failed to render a list item')
    }
    listItem.appendChild(item)
    listItem.addEventListener('click', () => {
      onSelect(listItem)
    })
    list.appendChild(listItem)
  })

  list
    .querySelector<HTMLElement>('[data-target-class="list-item"]')
    ?.setAttribute('data-selected', 'true')

  return list
}

export default SelectList
