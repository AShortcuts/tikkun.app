import { expect, test } from 'vitest'
import {
  LeiningInstanceId,
  LeiningRunType,
  type LeiningDate,
  type LeiningInstance,
  type LeiningRun,
} from '../../calendar-model/model-types.ts'
import {
  createAliyahNavigationSnapshot,
  formatAliyahLabel,
  getAliyahNavigationEntriesForRun,
  resolveActiveTargetForRun,
  type AliyahNavigationPlayback,
  type AliyahNavigationTarget,
} from './model.ts'

test('builds one shared navigation sequence across main and maftir runs', () => {
  const mainRun = createRunFixture({
    id: '2025-10-25:shacharis,main',
    type: LeiningRunType.Main,
    indexes: [1, 2, 3, 4, 5, 6, 7],
  })
  const maftirRun = createRunFixture({
    id: '2025-10-25:shacharis,maftir',
    type: LeiningRunType.Maftir,
    indexes: ['Maftir'],
  })
  const leining = createLeiningFixture([mainRun, maftirRun])
  mainRun.leining = leining
  maftirRun.leining = leining

  expect(
    getAliyahNavigationEntriesForRun(mainRun).map(({ run, aliyah }) => ({
      runId: run.id,
      aliyahIndex: aliyah.index,
    }))
  ).toEqual([
    { runId: mainRun.id, aliyahIndex: 1 },
    { runId: mainRun.id, aliyahIndex: 2 },
    { runId: mainRun.id, aliyahIndex: 3 },
    { runId: mainRun.id, aliyahIndex: 4 },
    { runId: mainRun.id, aliyahIndex: 5 },
    { runId: mainRun.id, aliyahIndex: 6 },
    { runId: mainRun.id, aliyahIndex: 7 },
    { runId: maftirRun.id, aliyahIndex: 'Maftir' },
  ])
})

test('creates presentation items and a stable signature behind one model interface', () => {
  const run = createRunFixture({
    id: '2025-10-25:shacharis,main',
    type: LeiningRunType.Main,
    indexes: [1, 2],
  })
  run.leining = createLeiningFixture([run])
  const entries = getAliyahNavigationEntriesForRun(run)

  const snapshot = createAliyahNavigationSnapshot({
    entries,
    active: { runId: run.id, aliyahIndex: 2 },
    playback: idlePlayback,
    signaturePrefix: 'narrator-a',
    getAudio: ({ aliyah }) => {
      const key = aliyah.index === 1 ? 'recording-1' : null
      return { playbackKey: key, recordingKey: key }
    },
  })

  expect(snapshot.signature).toBe(
    `narrator-a:${run.id}:1:recording-1:recording-1|${run.id}:2::`
  )
  expect(snapshot.items).toEqual([
    {
      key: `${run.id}:1`,
      target: { runId: run.id, aliyahIndex: 1 },
      label: 'ראשון',
      compactLabel: '1',
      audioKey: 'recording-1',
      recordingKey: 'recording-1',
    },
    {
      key: `${run.id}:2`,
      target: { runId: run.id, aliyahIndex: 2 },
      label: 'שני',
      compactLabel: '2',
      audioKey: null,
      recordingKey: null,
    },
  ])
})

test('prefers active playback for the selected run, then viewport, then first item', () => {
  const runId = '2025-10-25:shacharis,main'
  const first: AliyahNavigationTarget = { runId, aliyahIndex: 1 }
  const current: AliyahNavigationTarget = { runId, aliyahIndex: 3 }
  const playback: AliyahNavigationPlayback = {
    target: { runId, aliyahIndex: 5 },
    playing: true,
    progressLabel: '0:10/3:20',
  }

  expect(resolveActiveTargetForRun({ runId, current, playback, first })).toEqual(
    playback.target
  )
  expect(
    resolveActiveTargetForRun({
      runId,
      current,
      playback: { ...playback, playing: false },
      first,
    })
  ).toEqual(current)
  expect(
    resolveActiveTargetForRun({
      runId,
      current: { runId: 'another-run', aliyahIndex: 2 },
      playback: idlePlayback,
      first,
    })
  ).toEqual(first)
})

test('formats maftir for navigation labels', () => {
  expect(formatAliyahLabel('Maftir')).toBe('מפטיר')
})

const idlePlayback: AliyahNavigationPlayback = {
  target: null,
  playing: false,
  progressLabel: '',
}

function createLeiningFixture(runs: LeiningRun[]): LeiningInstance {
  const date: LeiningDate = {
    date: new Date(2025, 9, 25),
    id: '2025-10-25',
    title: { en: 'Parshat Noach', he: 'פרשת נח' },
    leinings: [],
  }
  const leining: LeiningInstance = {
    date,
    id: LeiningInstanceId.Shacharis,
    isParsha: true,
    runs,
  }
  date.leinings = [leining]
  return leining
}

function createRunFixture({
  id,
  type,
  indexes,
}: {
  id: string
  type: LeiningRunType
  indexes: Array<1 | 2 | 3 | 4 | 5 | 6 | 7 | 'Maftir'>
}): LeiningRun {
  return {
    id,
    type,
    leining: null as unknown as LeiningInstance,
    scroll: 'torah',
    aliyot: indexes.map((index, position) => ({
      index,
      start: { scroll: 'torah', b: 1, c: position + 1, v: 1 },
      end: { scroll: 'torah', b: 1, c: position + 1, v: 5 },
    })),
  }
}
