import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { expect, test, vi } from 'vitest'

// Load just the batch coordinator: importing the CLI would start a real recording.
const source = await readFile(new URL('./record-aliyah-videos.mjs', import.meta.url), 'utf8')
const batchSource = source.slice(source.indexOf('async function recordBatch('), source.indexOf('\nasync function calibrate('))

function harness(ids) {
  const reports = vi.fn()
  const run = vi.fn(async () => ({ results: [], peakConcurrency: 1 }))
  const start = vi.fn()
  const log = vi.fn()
  const context = {
    console: { log }, selectedRecordings: () => ids.map(id => ({ id })),
    readJsonFile: async () => [], metadataPath: 'metadata',
    getCuesForRecording: async ({ id }) => id === 'nasso-4' ? [] : [{ timeStart: 0 }],
    appendReports: reports, mkdir: vi.fn(), startVite: start, stopOwnedProcess: vi.fn(),
    createVideoProgress: () => ({ log, close() {} }), createResourceSampler: vi.fn(), runResourceAware: run,
  }
  return { batch: vm.runInNewContext(`(${batchSource.trim()})`, context), reports, run, start, log }
}

const options = { force: false, concurrency: 'auto', maxConcurrency: 5, width: 1300, height: 600, deviceScaleFactor: 3 }

test('skips a cue-less aliyah and queues the remaining aliyot, including with --force', async () => {
  for (const force of [false, true]) {
    const h = harness(['nasso-3', 'nasso-4', 'nasso-5'])
    await h.batch({ ...options, force })
    expect(Array.from(h.run.mock.calls[0][0], item => item.id)).toEqual(['nasso-3', 'nasso-5'])
    expect(h.reports.mock.calls[0][0][0].report).toMatchObject({ audioId: 'nasso-4', skipped: true, reason: 'missing cue data' })
    expect(h.log).toHaveBeenCalledWith('[video] 0 completed; 1 skipped without cues; 2 remaining')
  }
})

test('exits successfully without launching a browser when every selected aliyah lacks cues', async () => {
  const h = harness(['nasso-4'])
  const result = await h.batch(options)
  expect(result.results).toHaveLength(0)
  expect(h.start).not.toHaveBeenCalled()
  expect(h.run).not.toHaveBeenCalled()
})
