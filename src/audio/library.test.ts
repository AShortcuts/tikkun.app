import test from 'ava'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import { findRecordingForRun, parshaSlugForRun } from './recording-lookup.ts'

const testSettings: UserSettings = {
  ashkenazi: true,
  includeModernHolidays: false,
  israel: false,
}

const generator = new LeiningGenerator(testSettings)

test('audio lookup canonicalizes parsha aliases before matching recordings', (t) => {
  const run = generator.parseId('2022-10-01:shacharis,main')

  if (!run) throw new Error('Missing Vayeilech run')

  t.is(run.leining.date.title.en, 'Parshat Vayeilech')
  t.is(parshaSlugForRun(run), 'vayelech')
  t.is(
    findRecordingForRun({
      narratorId: 'yoni-davidov',
      run,
      aliyahIndex: 1,
    })?.id,
    'vayelech-1'
  )
})

test('audio lookup preserves manifest spelling when the route slug differs', (t) => {
  const run = generator.parseId('2026-10-10:shacharis,main')

  if (!run) throw new Error('Missing Bereshit run')

  t.is(run.leining.date.title.en, 'Parshat Bereshit')
  t.is(parshaSlugForRun(run), 'bereshit')
  t.is(
    findRecordingForRun({
      narratorId: 'yoni-davidov',
      run,
      aliyahIndex: 1,
    })?.id,
    'bereshit-1'
  )
})

test('audio lookup resolves maftir to the seventh aliyah recording', (t) => {
  const run = generator.parseId('2025-10-25:shacharis,main')

  if (!run) throw new Error('Missing Noach run')

  t.is(
    findRecordingForRun({
      narratorId: 'yoni-davidov',
      run,
      aliyahIndex: 'Maftir',
    })?.id,
    'noach-7'
  )
})
