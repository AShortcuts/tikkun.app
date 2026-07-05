import { expect, test } from 'vitest'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import {
  findRecordingForRun,
  getCuePayloadForRecording,
  listRecordings,
  parshaSlugForRun,
} from './library.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

test('audio lookup canonicalizes parsha aliases before matching recordings', () => {
  const run = generator.parseId('2022-10-01:shacharis,main')

  if (!run) throw new Error('Missing Vayeilech run')

  expect(run.leining.date.title.en).toBe('Parshat Vayeilech')
  expect(parshaSlugForRun(run)).toBe('vayelech')
  expect(findRecordingForRun({
      narratorId: 'yoni-davidov',
      run,
      aliyahIndex: 1,
    })?.id).toBe('vayelech-1')
})

test('audio lookup preserves manifest spelling when the route slug differs', () => {
  const run = generator.parseId('2026-10-10:shacharis,main')

  if (!run) throw new Error('Missing Bereshit run')

  expect(run.leining.date.title.en).toBe('Parshat Bereshit')
  expect(parshaSlugForRun(run)).toBe('bereshit')
  expect(findRecordingForRun({
      narratorId: 'yoni-davidov',
      run,
      aliyahIndex: 1,
    })?.id).toBe('bereshit-1')
})

test('audio lookup resolves maftir to the seventh aliyah recording', () => {
  const run = generator.parseId('2025-10-25:shacharis,main')

  if (!run) throw new Error('Missing Noach run')

  expect(findRecordingForRun({
      narratorId: 'yoni-davidov',
      run,
      aliyahIndex: 'Maftir',
    })?.id).toBe('noach-7')
})

test('loads cue payloads for a recording on demand', async () => {
  const recording = listRecordings().find((entry) => entry.id === 'bereshit-1')

  if (!recording) throw new Error('Missing Bereshit recording')

  await expect(getCuePayloadForRecording(recording)).resolves.toMatchObject({
    audioId: 'bereshit-1',
    cueCount: 400,
    tokenCount: 400,
  })
})
