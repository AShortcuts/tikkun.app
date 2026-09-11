import type { AudioRecording } from '../audio/types.ts'
import { descriptorForRecording } from './recording-download.ts'
import { recordingAssetKey, resolveRecordingAsset } from './recording-storage.ts'
import { recordingDependenciesReady } from './recording-dependencies.ts'
import type { DownloadEntry, DownloadLibrarySnapshot } from './download-library.ts'

export interface MediaReading {
  id: string
  name: string
  hebrew: string
  group: string
  aliyot: readonly number[]
}

export function mediaRows(readings: readonly MediaReading[], recordings: readonly AudioRecording[], narratorId: string,
  snapshot: DownloadLibrarySnapshot, baseUrl: string) {
  const entries = new Map(snapshot.entries.map((entry) => [entry.key, entry]))
  const inventory = new Set(snapshot.inventory.map(recordingAssetKey))
  return readings.map((reading) => {
    const aliyot = reading.aliyot.map((number) => {
      const recording = recordings.find((item) => item.reading.id === reading.id && item.narratorId === narratorId && item.aliyah === number)
      const descriptor = recording && descriptorForRecording(recording)
      const key = descriptor ? recordingAssetKey(resolveRecordingAsset(descriptor, baseUrl)) : null
      const entry = key ? entries.get(key) ?? null : null
      return { number, title: recording?.title ?? `Aliyah ${number}`, entry,
        saved: Boolean(key && inventory.has(key)),
        ready: Boolean(key && inventory.has(key) && entry?.phase === 'stored' && recordingDependenciesReady(entry.readiness)) }
    })
    const assets = [...new Map(aliyot.flatMap(({ entry }) => entry ? [[entry.key, entry] as const] : [])).values()]
    const remaining = assets.filter((entry) => !aliyot.some((aliyah) => aliyah.entry?.key === entry.key && aliyah.ready))
    const available = aliyot.filter(({ entry }) => entry).length
    const ready = aliyot.filter((aliyah) => aliyah.ready).length
    const active = assets.filter(isActiveDownload)
    const errors = assets.filter((entry) => entry.phase === 'error')
    const missingBytes = remaining.reduce((total, entry) => total + (inventory.has(entry.key) ? 0 : entry.asset.byteLength), 0)
    const complete = available > 0 && ready === available
    const label = !available ? 'Unavailable' : active.length
      ? active.every((entry) => entry.phase === 'queued') ? 'Queued' : active.some((entry) => entry.phase === 'downloading') ? `${ready}/${aliyot.length}` : 'Verifying'
      : complete ? available === aliyot.length ? 'Downloaded' : `${ready}/${aliyot.length} saved`
      : errors.length ? `Retry ${ready}/${aliyot.length}` : ready ? `${ready}/${aliyot.length}` : 'Download all'
    return { ...reading, aliyot, assets, remaining, available, ready, active, errors, missingBytes, complete, label,
      saved: aliyot.some((aliyah) => aliyah.saved),
      progressBytes: assets.reduce((total, entry) => total + entry.downloadedBytes, 0),
      totalBytes: assets.reduce((total, entry) => total + entry.asset.byteLength, 0) }
  })
}

export function isActiveDownload(entry: DownloadEntry) {
  return ['queued', 'downloading', 'verifying'].includes(entry.phase)
}

export function formatMediaBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function mediaSearchMatches(reading: Pick<MediaReading, 'name' | 'hebrew' | 'id'>, query: string) {
  const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[\p{P}\p{S}]+/gu, ' ').toLowerCase().trim()
  return normalize(`${reading.name} ${reading.hebrew} ${reading.id}`).includes(normalize(query))
}
