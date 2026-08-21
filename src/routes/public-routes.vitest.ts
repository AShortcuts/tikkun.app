import {
  createRawSnippet,
  flushSync,
  mount,
  tick,
  type Component,
  unmount,
} from 'svelte'
import { afterEach, expect, test } from 'vitest'
import { page } from 'vitest/browser'
import '../../css/home.css'
import ReadingCard from '../lib/components/ReadingCard.svelte'
import { getRequiredReading } from '../lib/readings.ts'
import SiteLayout from './(site)/+layout.svelte'
import AboutPage from './(site)/about/+page.svelte'
import ReadingsPage from './(site)/readings/+page.svelte'
import TidbitsPage from './(site)/tidbits/+page.svelte'

let component: ReturnType<typeof mount> | null = null
let target: HTMLElement | null = null

afterEach(async () => {
  if (component) await unmount(component)
  component = null
  target?.remove()
  target = null
})

test('renders an honest Tidbits empty state with a useful next action', () => {
  mountPage(TidbitsPage)

  expect(required('h1').textContent).toBe('Tidbits')
  expect(required('#tidbits-empty-title').textContent).toBe(
    'No tidbits published yet.'
  )
  expect(
    required<HTMLAnchorElement>('a[href="/readings/"]').textContent
  ).toBe('View available readings')
  expect(target?.textContent).not.toMatch(/lorem|placeholder|coming soon/i)
})

test('renders canonical public navigation and dismisses the mobile menu accessibly', async () => {
  target = document.createElement('div')
  document.body.appendChild(target)
  component = mount(SiteLayout, {
    target,
    props: {
      children: createRawSnippet(() => ({
        render: () => '<main data-test-site-child>Public content</main>',
      })),
    },
  })
  flushSync()

  expect(required('[data-test-site-child]').textContent).toBe('Public content')
  expect(primaryNavHrefs()).toEqual([
    '/readings/',
    '/tidbits/',
    '/about/',
    '/reader/#/next',
  ])

  const menu = required<HTMLDetailsElement>('.site-mobile-menu')
  const summary = required<HTMLElement>('.site-mobile-menu > summary')
  await page.getByLabelText('Open navigation menu').click()
  await tick()
  expect(menu.open).toBe(true)
  expect(summary.getAttribute('aria-expanded')).toBe('true')

  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  await tick()
  expect(menu.open).toBe(false)

  await page.getByLabelText('Open navigation menu').click()
  await tick()
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  )
  await tick()
  expect(menu.open).toBe(false)
  expect(document.activeElement).toBe(summary)
})

test('filters public coverage by text and status, then restores the catalog', async () => {
  mountPage(ReadingsPage)

  const input = required<HTMLInputElement>('input[type="search"]')
  input.value = 'Beresheet'
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  await tick()

  expect(required('[aria-live="polite"]').textContent?.trim()).toBe(
    'Showing 1 of 56 readings'
  )
  expect(resultNames()).toEqual(['Beresheet'])
  expect(
    required<HTMLAnchorElement>('.coverage-open').getAttribute('href')
  ).toBe('/reader/#/torah/parsha/beresheet')

  input.value = ''
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  required<HTMLButtonElement>('.coverage-filters button:nth-child(5)').click()
  await tick()

  expect(
    required<HTMLButtonElement>('.coverage-filters button:nth-child(5)')
      .getAttribute('aria-pressed')
  ).toBe('true')
  expect(resultNames()).toContain('Vayeira')
  expect(resultNames()).not.toContain('Beresheet')

  input.value = 'Beresheet'
  input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  await tick()
  expect(required('.coverage-empty h3').textContent).toBe('No readings match.')

  required<HTMLButtonElement>('.coverage-empty button').click()
  await tick()
  expect(input.value).toBe('')
  expect(required('[aria-live="polite"]').textContent?.trim()).toBe(
    'Showing 56 of 56 readings'
  )
})

test('renders aliyah actions as sibling links inside a non-link reading card', () => {
  target = document.createElement('div')
  document.body.appendChild(target)
  component = mount(ReadingCard, {
    target,
    props: { reading: getRequiredReading('beresheet') },
  })

  const card = required('article.home-reading-card')
  const aliyahGroup = required('[aria-label="Beresheet aliyot"]')
  const aliyahLinks = aliyahGroup.querySelectorAll<HTMLAnchorElement>('a')

  expect(card.querySelector(':scope > a.home-reading-card')).toBeNull()
  expect(aliyahLinks).toHaveLength(7)
  expect(aliyahLinks[0]?.dataset.cueStatus).toBe('cued')
  expect(aliyahLinks[0]?.getAttribute('href')).toBe(
    '/reader/#/torah/parsha/beresheet/1-1-1'
  )
  expect(aliyahLinks[0]?.getAttribute('aria-label')).toContain(
    'word timing ready'
  )
  const readyStatus = required<HTMLElement>('.home-reading-status.mod-ready')
  expect(getComputedStyle(readyStatus).backgroundColor).toBe(
    'rgba(63, 144, 83, 0.22)'
  )
})

test('keeps analytics and maintained project status discoverable from About', () => {
  mountPage(AboutPage)

  expect(
    required<HTMLAnchorElement>(
      'a[href="/reader/#/about/playback-analytics"]'
    ).textContent
  ).toBe('Cue analytics')
  expect(required('#taskboard-title').textContent).toBe('Taskboard')
  expect(
    target?.querySelectorAll('[role="list"] > [role="listitem"]').length
  ).toBeGreaterThan(0)
})

function mountPage(Page: Component<Record<string, never>>) {
  target = document.createElement('div')
  document.body.appendChild(target)
  component = mount(Page, { target })
  flushSync()
}

function resultNames() {
  return Array.from(
    target?.querySelectorAll<HTMLElement>('.coverage-name') ?? [],
    (element) => element.textContent?.trim() ?? ''
  )
}

function primaryNavHrefs() {
  return Array.from(
    required('nav.home-nav').querySelectorAll<HTMLAnchorElement>(':scope > a'),
    (link) => link.getAttribute('href')
  )
}

function required<T extends Element = HTMLElement>(selector: string): T {
  const element = target?.querySelector<T>(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}
