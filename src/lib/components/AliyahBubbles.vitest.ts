import { mount, tick, unmount } from 'svelte'
import { afterEach, expect, test } from 'vitest'
import { TOKENIZATION_VERSION } from '../../../app/audio/cue-schema.ts'
import { audioRecordings } from '../../../app/data/audio-catalog.ts'
import type { PublicAliyah } from '../readings.ts'
import AliyahBubbles from './AliyahBubbles.svelte'

let component: ReturnType<typeof mount> | null = null
let target: HTMLElement | null = null

afterEach(async () => {
  if (component) await unmount(component)
  component = null
  target?.remove()
  target = null
  localStorage.clear()
})

function mountBubbles(aliyah: PublicAliyah) {
  target = document.createElement('div')
  document.body.appendChild(target)
  component = mount(AliyahBubbles, {
    target,
    props: { aliyot: [aliyah], readingName: 'Beresheet', interactive: true },
  })
}

function saveLocalDraft(cueCount: number, tokenCount: number) {
  const recording = audioRecordings.find(({ id }) => id === 'beresheet-1')
  if (!recording?.mediaIdentity) throw new Error('Missing test recording identity')
  localStorage.setItem(
    'tikkun-admin-draft:beresheet-1',
    JSON.stringify({
      audioId: recording.id,
      audioFormat: recording.format,
      narratorId: recording.narratorId,
      readingId: recording.reading.id,
      aliyah: recording.aliyah,
      mediaIdentity: recording.mediaIdentity,
      tokenCount,
      tokenPointer: cueCount - 1,
      tokenizationVersion: TOKENIZATION_VERSION,
      updatedAt: 100,
      cues: Array.from({ length: cueCount }, (_, wordIndex) => ({
        timeStart: wordIndex,
        pageNumber: 1,
        lineIndex: 0,
        fragmentIndex: 0,
        wordIndex,
      })),
    })
  )
}

test('keeps published synced status while disclosing an incomplete local draft', async () => {
  saveLocalDraft(1, 2)
  mountBubbles({
    number: 1,
    audioId: 'beresheet-1',
    cueStatus: 'cued',
    expectedTokenCount: 2,
    readerHash: '#/torah/parsha/beresheet/1-1-1',
  })
  await tick()

  const bubble = target?.querySelector<HTMLAnchorElement>('.home-aliyah-bubble')
  expect(bubble?.dataset.cueStatus).toBe('cued')
  expect(bubble?.dataset.localCueStatus).toBe('draft')
  expect(bubble?.classList.contains('mod-cued')).toBe(true)
  expect(bubble?.classList.contains('mod-draft')).toBe(false)
  expect(bubble?.getAttribute('aria-label')).toContain(
    'word timing ready; local timing draft present, not publicly verified'
  )
})

test('keeps published missing status while disclosing a full local draft as unverified', async () => {
  saveLocalDraft(2, 2)
  mountBubbles({
    number: 1,
    audioId: 'beresheet-1',
    cueStatus: 'missing',
    expectedTokenCount: 2,
    readerHash: '#/torah/parsha/beresheet/1-1-1',
  })
  await tick()

  const bubble = target?.querySelector<HTMLAnchorElement>('.home-aliyah-bubble')
  expect(bubble?.dataset.cueStatus).toBe('missing')
  expect(bubble?.dataset.localCueStatus).toBe('draft')
  expect(bubble?.classList.contains('mod-missing')).toBe(true)
  expect(bubble?.classList.contains('mod-cued')).toBe(false)
  expect(bubble?.getAttribute('aria-label')).toContain(
    'timing not started; local timing draft present, not publicly verified'
  )
})
