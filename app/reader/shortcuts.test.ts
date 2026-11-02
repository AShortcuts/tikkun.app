import { expect, test } from 'vitest'
import {
  createShortcutCommand,
  getShortcutCommand,
  isShortcutEditableTarget,
} from './shortcuts.ts'

test('matches shortcuts by key and required modifier', () => {
  const command = createShortcutCommand({
    id: 'palette.open',
    key: 'k',
    metaOrCtrl: true,
    modes: ['normal'],
    run: () => undefined,
  })

  const matched = getShortcutCommand([command], {
    key: 'K',
    metaKey: true,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  }, 'normal')

  expect(matched?.id).toBe('palette.open')
})

test('does not match commands outside the active reader mode', () => {
  const command = createShortcutCommand({
    id: 'issue.mark',
    key: 'm',
    modes: ['admin-authoring'],
    run: () => undefined,
  })

  expect(getShortcutCommand([command], {
    key: 'm',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  }, 'normal')).toBe(null)
})

test('detects editable targets that should not trigger global shortcuts', () => {
  const input = { isContentEditable: false, closest: (selector: string) => selector.includes('input') ? {} : null }
  expect(isShortcutEditableTarget(input)).toBe(true)
})
