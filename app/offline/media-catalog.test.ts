import { describe, expect, test } from 'vitest'
import { audioRecordings } from '../../generated/audio-manifest.ts'
import type { AudioRecording } from '../audio/types.ts'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import { userSettingsFromCalendarSettings } from '../calendar-settings.ts'
import { listMediaReadings } from './media-readings.ts'
import { mediaRows, mediaSearchMatches, type MediaReading } from './media-catalog.ts'
import { descriptorForRecording } from './recording-download.ts'
import { recordingAssetKey, resolveRecordingAsset } from './recording-storage.ts'
import type { DownloadLibrarySnapshot } from './download-library.ts'

const base = 'https://tikkunreader.com/reader/'
const recordings = audioRecordings.filter((recording) => recording.reading.id === 'beresheet')
const reading: MediaReading = { id: 'beresheet', name: 'Beresheet', hebrew: 'בְּרֵאשִׁית', group: 'Genesis', aliyot: [1, 2, 3, 4, 5, 6, 7] }
function state(saved = 0): DownloadLibrarySnapshot {
  const entries = recordings.map((recording, index) => {
    const asset = resolveRecordingAsset(descriptorForRecording(recording)!, base)
    return { key: recordingAssetKey(asset), asset, phase: index < saved ? 'stored' as const : 'idle' as const,
      readiness: index < saved ? 'ready' as const : 'unchecked' as const, downloadedBytes: index < saved ? asset.byteLength : 0, error: null }
  })
  return { supported: true, location: 'device', phase: 'ready', entries, inventory: entries.slice(0, saved).map((entry) => entry.asset), error: null, persistenceError: null, unavailableIntent: [] }
}
const row = (snapshot: DownloadLibrarySnapshot, catalog: readonly AudioRecording[] = recordings, narrator = 'yoni-davidov') => mediaRows([reading], catalog, narrator, snapshot, base)[0]

describe('Media catalog', () => {
  test('includes all 54 canonical parshiot with actual calendar aliyot', () => {
    const result = listMediaReadings(new LeiningGenerator(userSettingsFromCalendarSettings({ israel: false })), audioRecordings)
    expect(result).toHaveLength(54)
    expect(result[0]).toMatchObject({ id: 'beresheet', group: 'Genesis', aliyot: [1, 2, 3, 4, 5, 6, 7] })
    expect(result.at(-1)?.id).toBe('vezos-haberacha')
    expect(result.every((item) => item.aliyot.length > 0 && item.group)).toBe(true)
    expect(new Set(result.map((item) => item.group)).size).toBe(5)
  })
  test('one partial control queues only remaining files', () => {
    const result = row(state(1))
    expect(result.label).toBe('1/7')
    expect(result.remaining).toHaveLength(6)
    expect(result.missingBytes).toBe(result.totalBytes - state(1).inventory[0].byteLength)
    expect(row(state(7))).toMatchObject({ label: 'Downloaded', complete: true })
  })
  test('partial publication never claims full completion', () => {
    const result = row(state(3), recordings.slice(0, 3))
    expect(result).toMatchObject({ available: 3, ready: 3, label: '3/7 saved', complete: true })
    expect(result.aliyot.filter((aliyah) => !aliyah.entry)).toHaveLength(4)
  })
  test('saved audio with missing dependencies remains repairable with zero audio bytes', () => {
    const snapshot = state(7)
    const entry = snapshot.entries[0]
    const result = row({ ...snapshot, entries: [{ ...entry, phase: 'paused', readiness: 'missing' }, ...snapshot.entries.slice(1)] })
    expect(result).toMatchObject({ label: '6/7', ready: 6, complete: false, missingBytes: 0 })
    expect(result.remaining.map((asset) => asset.key)).toEqual([entry.key])
  })
  test('unchecked inventory is not marked downloaded', () => {
    const snapshot = state(7)
    expect(row({ ...snapshot, entries: snapshot.entries.map((entry) => ({ ...entry, readiness: 'unchecked' })) }).ready).toBe(0)
  })
  test('aliases count logical coverage but share physical bytes', () => {
    const alias = { ...recordings[0], id: 'shared-alias', aliyah: 2 }
    const result = row(state(1), [recordings[0], alias])
    expect(result.ready).toBe(2)
    expect(result.assets).toHaveLength(1)
    expect(result.totalBytes).toBe(state(1).inventory[0].byteLength)
  })
  test('narrator scope does not inherit another narrator downloads', () => {
    expect(row(state(7), recordings, 'another-reader')).toMatchObject({ available: 0, ready: 0, label: 'Unavailable' })
  })
  test('search accepts unpointed Hebrew and normalized slug', () => {
    expect(mediaSearchMatches(reading, 'בראשית')).toBe(true)
    expect(mediaSearchMatches(reading, 'BERESHEET')).toBe(true)
    expect(mediaSearchMatches(reading, 'Noach')).toBe(false)
  })
})
