import { iconMarkup } from '../components/icons.ts'
import type { MountScope } from '../lifecycle/mount.ts'
import {
  filterNavigationActions,
  type NavigationAction,
  type NavigationActionGroup,
} from './actions.ts'

export interface CommandPaletteOptions {
  document: Document
  getActions(): NavigationAction[]
  restoreFocus(): void
  isBookmarkAction(action: NavigationAction): boolean
  formatBadge(label: string): string
}

export interface CommandPalette {
  open(): void
  close(): void
  toggle(): void
  isOpen(): boolean
  refresh(): void
}

const groupLabels: Record<NavigationActionGroup, string> = {
  reading: 'Reading',
  page: 'Page',
  resume: 'Resume',
  checkpoint: 'Checkpoint',
  tools: 'Tool',
  admin: 'Admin',
}

export function createCommandPalette(
  scope: MountScope,
  options: CommandPaletteOptions
): CommandPalette {
  const root = options.document.querySelector<HTMLElement>(
    '[data-target-id="command-palette"]'
  )
  const input = options.document.querySelector<HTMLInputElement>(
    '[data-target-id="command-palette-input"]'
  )
  const results = options.document.querySelector<HTMLElement>(
    '[data-target-id="command-palette-results"]'
  )
  let actions: NavigationAction[] = []
  let activeIndex = 0

  const isOpen = () =>
    Boolean(root && !root.classList.contains('u-hidden'))

  const close = () => {
    root?.classList.add('u-hidden')
  }

  const run = (action: NavigationAction) => {
    close()
    void action.run()
  }

  const render = () => {
    if (!input || !results) return
    const matches = filterNavigationActions(actions, input.value)
    activeIndex = Math.min(activeIndex, Math.max(matches.length - 1, 0))
    results.replaceChildren()

    if (!matches.length) {
      const empty = options.document.createElement('div')
      empty.className = 'command-palette-empty'
      empty.textContent = 'No matching command'
      results.appendChild(empty)
      return
    }

    matches.forEach((action, index) => {
      const button = options.document.createElement('button')
      button.type = 'button'
      button.className = 'command-palette-result'
      button.classList.toggle('is-active', index === activeIndex)
      button.dataset.actionId = action.id

      const label = options.document.createElement('span')
      label.className = 'command-palette-label'
      label.textContent = action.label
      if (options.isBookmarkAction(action)) {
        const icon = options.document.createElement('span')
        icon.className = 'command-palette-inline-icon'
        icon.innerHTML = iconMarkup('bookmarkFilled')
        label.prepend(icon, ' ')
      }
      if (action.badgeLabel) {
        const badge = options.document.createElement('span')
        badge.className = 'command-palette-inline-badge'
        badge.textContent = options.formatBadge(action.badgeLabel)
        label.append(' ', badge)
      }

      const group = options.document.createElement('span')
      group.className = 'command-palette-group'
      group.textContent = groupLabels[action.group]
      button.append(label, group)
      button.addEventListener('click', () => run(action), {
        signal: scope.signal,
      })
      results.appendChild(button)
    })
  }

  const refresh = () => {
    actions = options.getActions()
    if (isOpen()) render()
  }

  const open = () => {
    if (!root || !input) return
    actions = options.getActions()
    root.classList.remove('u-hidden')
    input.value = ''
    activeIndex = 0
    render()
    input.focus({ preventScroll: true })
  }

  const toggle = () => {
    if (isOpen()) {
      close()
      options.restoreFocus()
      return
    }
    open()
  }

  root?.addEventListener(
    'pointerdown',
    (event) => {
      if (event.target === root) close()
    },
    { signal: scope.signal }
  )
  input?.addEventListener(
    'input',
    () => {
      activeIndex = 0
      render()
    },
    { signal: scope.signal }
  )
  input?.addEventListener(
    'keydown',
    (event) => {
      const matches = filterNavigationActions(actions, input.value)
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        activeIndex = Math.min(activeIndex + 1, Math.max(matches.length - 1, 0))
        render()
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        activeIndex = Math.max(activeIndex - 1, 0)
        render()
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const action = matches[activeIndex]
        if (action) run(action)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        options.restoreFocus()
      }
    },
    { signal: scope.signal }
  )

  scope.own(() => {
    actions = []
    results?.replaceChildren()
    close()
  })

  return { open, close, toggle, isOpen, refresh }
}
