import { flushSync, mount, unmount, type ComponentProps } from 'svelte'
import { afterEach, expect, test, vi } from 'vitest'
import SupportDiagnosticsActions from './SupportDiagnosticsActions.svelte'

let component: ReturnType<typeof mount> | null = null
let target: HTMLElement | null = null

afterEach(async () => {
  if (component) await unmount(component)
  component = null
  target?.remove()
  target = null
  vi.restoreAllMocks()
})

test('exports only after the user chooses copy or download', async () => {
  const copy = vi.fn(async () => {})
  const download = vi.fn()
  mountActions({
    variant: 'reader',
    diagnostics: { buildIdentifier: 'release-42', copy, download },
  })

  expect(required('[data-target-id="support-build-identifier"]').textContent).toContain(
    'release-42'
  )
  expect(copy).not.toHaveBeenCalled()
  expect(download).not.toHaveBeenCalled()

  required<HTMLButtonElement>('[data-target-id="support-copy-report"]').click()
  await vi.waitFor(() =>
    expect(required('[role="status"]').textContent).toBe(
      'Diagnostic report copied.'
    )
  )

  required<HTMLButtonElement>('[data-target-id="support-download-report"]').click()
  expect(download).toHaveBeenCalledOnce()
  await vi.waitFor(() =>
    expect(required('[role="status"]').textContent).toBe(
      'Diagnostic report downloaded.'
    )
  )
})

test('keeps both recovery actions available when one export path fails', async () => {
  const copy = vi.fn(async () => {
    throw new Error('clipboard denied')
  })
  const download = vi.fn()
  mountActions({
    variant: 'site',
    diagnostics: { buildIdentifier: 'test-build', copy, download },
  })

  const copyButton = required<HTMLButtonElement>(
    '[data-target-id="support-copy-report"]'
  )
  const downloadButton = required<HTMLButtonElement>(
    '[data-target-id="support-download-report"]'
  )
  expect(copyButton.type).toBe('button')
  expect(downloadButton.type).toBe('button')

  copyButton.click()
  await vi.waitFor(() =>
    expect(required('[role="status"]').textContent).toBe(
      'Copy failed. Download the report instead.'
    )
  )
  expect(copyButton.disabled).toBe(false)
  expect(downloadButton.disabled).toBe(false)

  downloadButton.click()
  expect(download).toHaveBeenCalledOnce()
})

function mountActions(
  props: ComponentProps<typeof SupportDiagnosticsActions>
) {
  target = document.createElement('div')
  document.body.appendChild(target)
  component = mount(SupportDiagnosticsActions, { target, props })
  flushSync()
}

function required<T extends Element = HTMLElement>(selector: string): T {
  const element = target?.querySelector<T>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}
