export type ReaderMode =
  | 'normal'
  | 'practice-focus'
  | 'admin-authoring'
  | 'recording'

export interface ShortcutLikeEvent {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export interface ShortcutCommand {
  id: string
  key: string
  metaOrCtrl: boolean
  shift: boolean
  alt: boolean
  modes: ReaderMode[]
  run: () => void
}

export interface ShortcutCommandInput {
  id: string
  key: string
  metaOrCtrl?: boolean
  shift?: boolean
  alt?: boolean
  modes: ReaderMode[]
  run: () => void
}

export interface ShiftHoldEvent {
  key: string
  repeat: boolean
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  target: unknown
}

export function createTemporaryShiftToggle({
  getValue,
  setValue,
  isDisabled,
}: {
  getValue: () => boolean
  setValue: (value: boolean) => void
  isDisabled: () => boolean
}) {
  let restoreValue: boolean | null = null

  const release = () => {
    if (restoreValue === null) return
    const value = restoreValue
    restoreValue = null
    setValue(value)
  }

  return {
    handleKeyDown(event: ShiftHoldEvent) {
      if (
        event.key !== 'Shift' ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isShortcutEditableTarget(event.target) ||
        isDisabled() ||
        restoreValue !== null
      ) {
        return
      }

      restoreValue = getValue()
      setValue(!restoreValue)
    },
    handleKeyUp(event: ShiftHoldEvent) {
      if (event.key === 'Shift') release()
    },
    release,
  }
}

export function createShortcutCommand(input: ShortcutCommandInput): ShortcutCommand {
  return {
    metaOrCtrl: false,
    shift: false,
    alt: false,
    ...input,
    key: input.key.toLocaleLowerCase(),
  }
}

export function getShortcutCommand(
  commands: ShortcutCommand[],
  event: ShortcutLikeEvent,
  mode: ReaderMode
) {
  const key = event.key.toLocaleLowerCase()
  return commands.find((command) =>
    command.modes.includes(mode) &&
    command.key === key &&
    command.metaOrCtrl === (event.metaKey || event.ctrlKey) &&
    command.shift === event.shiftKey &&
    command.alt === event.altKey
  ) ?? null
}

export function isShortcutEditableTarget(target: unknown) {
  if (!target || typeof target !== 'object') return false
  const candidate = target as {
    isContentEditable?: boolean
    closest?: (selector: string) => unknown
  }
  return Boolean(
    candidate.isContentEditable ||
      candidate.closest?.('input, textarea, select, button, [contenteditable="true"]')
  )
}
