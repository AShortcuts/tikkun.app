import { afterEach, expect, test, vi } from 'vitest'

vi.mock('../audio/library.ts', () => ({
  getCuesForRecording: vi.fn(async () => []),
  getCueProgressForRecording: vi.fn(async () => ({
    isComplete: false,
    isUnfinished: false,
  })),
  getCueSavedAtForRecording: vi.fn(async () => null),
  listNarrators: vi.fn(() => []),
  listRecordings: vi.fn(() => []),
}))

import CueAnalyticsPage, {
  mountCueAnalyticsPage,
} from './CueAnalyticsPage.ts'

let fixture: HTMLElement | null = null

afterEach(() => {
  fixture?.remove()
  fixture = null
})

test('describes only published data when local drafts are not verified', async () => {
  fixture = document.createElement('main')
  fixture.innerHTML = CueAnalyticsPage()
  document.body.append(fixture)

  await mountCueAnalyticsPage(fixture)

  expect(fixture.textContent).toContain('published playback timing')
  expect(fixture.textContent).toContain('Published timing incomplete')
  expect(fixture.textContent).not.toMatch(/local draft/i)
})
