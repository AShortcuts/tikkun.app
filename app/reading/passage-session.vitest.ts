import { afterEach, expect, test, vi } from 'vitest'
import { audioRecordings } from '../../generated/audio-manifest.ts'
import { loadPassageTokens } from '../audio/passage-tokens.ts'
import { createRecordingRangeResolver } from '../audio/recording-ranges.ts'
import { LeiningGenerator } from '../calendar-model/generator.ts'
import { resolveParshaRun } from '../view-model/navigation/parsha-routes.ts'
import { AudioController } from './audio-controller.ts'
import { HighlightController } from './highlight-controller.ts'
import { PassageAudioResolver, type PassageAudioPortion, type PassageAudioResolution } from './passage-audio.ts'
import { createRecordingSession } from './recording-session.ts'

const controllers: AudioController[] = []
afterEach(() => { controllers.splice(0).forEach(controller => controller.destroy()); vi.restoreAllMocks() })

function harness(choose = async (resolution: PassageAudioResolution): Promise<PassageAudioPortion | null> => resolution.portions[0] ?? null) {
  const generator = new LeiningGenerator({ ashkenazi: true, israel: false, includeModernHolidays: false })
  const run = resolveParshaRun(generator, 'nitzavim-vayelech', new Date('2026-09-07T12:00:00'))!.run
  const audio = document.createElement('audio')
  Object.defineProperty(audio, 'readyState', { value: HTMLMediaElement.HAVE_METADATA })
  Object.defineProperty(audio, 'duration', { value: 20 })
  vi.spyOn(audio, 'load').mockImplementation(() => {})
  vi.spyOn(audio, 'pause').mockImplementation(() => {})
  vi.spyOn(audio, 'play').mockResolvedValue()
  const controller = new AudioController(audio)
  controllers.push(controller)
  const highlightController = new HighlightController(document.createElement('main'))
  const choosePortion = vi.fn(choose)
  const session = createRecordingSession({
    audioController: controller, highlightController,
    passages: new PassageAudioResolver({ recordings: audioRecordings, rangeForRecording: createRecordingRangeResolver(), loadTokens: loadPassageTokens, loadCues: async () => [] }),
    choosePassagePortion: choosePortion,
    library: { findRecording: () => null, findAuthoringRecording: () => null, listRecordings: () => audioRecordings, loadCues: async () => [] },
    display: { resolveRun: () => run, collectTokenKeys: target => loadPassageTokens(run.aliyot.find(a => a.index === target.aliyahIndex)!), waitUntilReady: async () => {}, resolveRunForRecording: () => null },
    authoring: { isActive: () => false, isVisible: () => false, hasSession: () => false, bindSession: async () => {}, clearSession: () => {} },
    presentation: { setCueIndex: () => {}, sessionLoaded: () => {} },
    getNarratorId: () => 'yoni-davidov', recordingMode: false,
  })
  return { run, audio, controller, session, choosePortion }
}

test('loads combined aliyah five with finite duration and seeks across source files', async () => {
  const { run, audio, session, controller, choosePortion } = harness()
  expect(session.lookup(run, 5).available).toBe(true)
  const loaded = await session.load({ runId: run.id, aliyahIndex: 5 })
  expect(loaded?.segments.map(segment => segment.recording.id)).toEqual(['vayelech-3', 'vayelech-4'])
  const firstDuration = loaded!.segments[0].endTime!
  expect(firstDuration).toBeGreaterThan(0)
  expect(controller.duration).toBeGreaterThan(firstDuration)
  controller.seek(firstDuration + 5)
  expect(audio.src).toContain('/vayelech/4.mp3')
  expect(audio.currentTime).toBe(5)
  controller.seek(2)
  expect(audio.src).toContain('/vayelech/3.mp3')
  expect(audio.currentTime).toBe(2)
  expect(choosePortion).not.toHaveBeenCalled()
})

test('partial selection loads only the available suffix and cancellation loads nothing', async () => {
  const { run, session, choosePortion } = harness()
  const loaded = await session.load({ runId: run.id, aliyahIndex: 4 })
  expect(choosePortion).toHaveBeenCalledOnce()
  expect(loaded?.status).toBe('partial-passage')
  expect(loaded?.segments.map(segment => segment.recording.id)).toEqual(['vayelech-1', 'vayelech-2'])
  expect(loaded?.passage?.range.start).toMatchObject({ c: 31, v: 1 })
  const cancelled = harness(async () => null)
  expect(await cancelled.session.load({ runId: cancelled.run.id, aliyahIndex: 4 })).toBeNull()
  expect(cancelled.controller.session).toBeNull()
})
