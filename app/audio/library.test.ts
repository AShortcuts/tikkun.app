import { expect, test } from 'vitest'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import type { UserSettings } from '../calendar-model/user-settings.ts'
import type { LeiningRun } from '../calendar-model/model-types.ts'
import type { RangeAudioRecording } from './types.ts'
import {
  findAuthoringRecordingForRun,
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

const torahRef = (verse: number) => ({ scroll: 'torah' as const, b: 4, c: 28, v: verse })
const roshChodeshRecordings: RangeAudioRecording[] = [
  [1, 1, 3],
  [2, 3, 5],
  [3, 6, 10],
  [4, 11, 15],
].map(([aliyah, start, end]) => ({
  id: `rosh-chodesh-${aliyah}`,
  narratorId: 'test-reader',
  reading: { kind: 'range', id: 'rosh-chodesh', name: 'Rosh Chodesh' },
  range: { start: torahRef(start), end: torahRef(end) },
  aliyah,
  title: `Rosh Chodesh ${aliyah}`,
  playSrc: `/audio/rosh-chodesh-${aliyah}.mp3`,
  downloadSrc: `/audio/rosh-chodesh-${aliyah}.mp3`,
  format: 'mp3',
  status: 'available',
}))

const rangeSignature = (run: LeiningRun) => run.aliyot.map(
  (aliyah) => `${aliyah.start.b}:${aliyah.start.c}:${aliyah.start.v}-${aliyah.end.b}:${aliyah.end.c}:${aliyah.end.v}`
).join('|')

const ordinaryRoshChodeshSignature = '4:28:1-4:28:3|4:28:3-4:28:5|4:28:6-4:28:10|4:28:11-4:28:15'

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

test('audio lookup uses canonical Beresheet recording identities', () => {
  const run = generator.parseId('2026-10-10:shacharis,main')

  if (!run) throw new Error('Missing Beresheet run')

  expect(run.leining.date.title.en).toBe('Parshat Bereshit')
  expect(parshaSlugForRun(run)).toBe('beresheet')
  expect(findRecordingForRun({
      narratorId: 'yoni-davidov',
      run,
      aliyahIndex: 1,
    })?.id).toBe('beresheet-1')
})

test('audio lookup finds Vayetzei recordings through the canonical route slug', () => {
  const run = generator.parseId('2026-11-21:shacharis,main')

  if (!run) throw new Error('Missing Vayetzei run')

  expect(run.leining.date.title.en).toBe('Parshat Vayetzei')
  expect(parshaSlugForRun(run)).toBe('vayetzei')
  expect(findRecordingForRun({
      narratorId: 'yoni-davidov',
      run,
      aliyahIndex: 1,
    })?.id).toBe('vayetzei-1')
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

test('audio authoring creates a stable missing recording identity', () => {
  const run = generator.parseId('2026-10-10:shacharis,main')

  if (!run) throw new Error('Missing Beresheet run')

  expect(
    findAuthoringRecordingForRun({
      narratorId: 'new-reader',
      run,
      aliyahIndex: 3,
      recordings: [],
    })
  ).toMatchObject({
    id: 'beresheet-3',
    narratorId: 'new-reader',
    reading: { kind: 'parsha', id: 'beresheet' },
    aliyah: 3,
    playSrc: '/audio/new-reader/beresheet/3.m4a',
    status: 'missing',
  })
})

test('loads cue payloads for a recording on demand', async () => {
  const recording = listRecordings().find((entry) => entry.id === 'beresheet-1')

  if (!recording) throw new Error('Missing Beresheet recording')

  await expect(getCuePayloadForRecording(recording)).resolves.toMatchObject({
    audioId: 'beresheet-1',
    cueCount: 400,
    tokenCount: 400,
  })
})

test('all ordinary weekday Rosh Chodesh runs reuse the same canonical recordings', () => {
  const ordinaryRuns = [5785, 5786, 5787]
    .flatMap((year) => generator.forHebrewYear(year))
    .flatMap((date) => date.leinings)
    .flatMap((leining) => leining.runs)
    .filter((run) => rangeSignature(run) === ordinaryRoshChodeshSignature)

  expect(ordinaryRuns.length).toBeGreaterThan(20)
  for (const run of ordinaryRuns) {
    expect(run.aliyot.map((aliyah) => findRecordingForRun({
      narratorId: 'test-reader',
      run,
      aliyahIndex: aliyah.index!,
      recordings: roshChodeshRecordings,
    })?.id)).toEqual([
      'rosh-chodesh-1',
      'rosh-chodesh-2',
      'rosh-chodesh-3',
      'rosh-chodesh-4',
    ])
  }
})

test('the reported Rosh Chodesh route has exact overlapping canonical coverage', () => {
  const run = generator.parseId('2026-07-15:shacharis,main')
  if (!run) throw new Error('Missing reported Rosh Chodesh run')

  expect(rangeSignature(run)).toBe(ordinaryRoshChodeshSignature)
  expect(findRecordingForRun({
    narratorId: 'test-reader',
    run,
    aliyahIndex: 1,
    recordings: roshChodeshRecordings,
  })?.reading.id).toBe('rosh-chodesh')
  expect(findRecordingForRun({
    narratorId: 'test-reader',
    run,
    aliyahIndex: 2,
    recordings: roshChodeshRecordings,
  })?.id).toBe('rosh-chodesh-2')
})

test('Chanukah and Shabbat Rosh Chodesh only reuse exact scripture coverage', () => {
  const chanukah = generator.parseId('2024-12-31:shacharis,main')
  const shabbat = generator.parseId('2024-11-02:shacharis,maftir')
  if (!chanukah || !shabbat) throw new Error('Missing special Rosh Chodesh run')

  expect(rangeSignature(chanukah)).toContain('4:28:1-4:28:5')
  expect(findRecordingForRun({
    narratorId: 'test-reader',
    run: chanukah,
    aliyahIndex: 1,
    recordings: roshChodeshRecordings,
  })).toBeNull()
  expect(findRecordingForRun({
    narratorId: 'test-reader',
    run: chanukah,
    aliyahIndex: 2,
    recordings: roshChodeshRecordings,
  })?.id).toBe('rosh-chodesh-3')
  expect(findRecordingForRun({
    narratorId: 'test-reader',
    run: chanukah,
    aliyahIndex: 3,
    recordings: roshChodeshRecordings,
  })?.id).toBe('rosh-chodesh-4')

  expect(rangeSignature(shabbat)).toBe('4:28:9-4:28:15')
  expect(findRecordingForRun({
    narratorId: 'test-reader',
    run: shabbat,
    aliyahIndex: 'Maftir',
    recordings: roshChodeshRecordings,
  })).toBeNull()
})
