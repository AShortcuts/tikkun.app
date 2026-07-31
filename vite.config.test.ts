import { expect, test } from 'vitest'
import type { PreRenderedChunk } from 'rollup'
import { chunkFileName } from './vite.config.ts'

function chunk(
  facadeModuleId: string | null,
  moduleIds: string[]
): PreRenderedChunk {
  return {
    exports: [],
    facadeModuleId,
    isDynamicEntry: true,
    isEntry: false,
    isImplicitEntry: false,
    moduleIds,
    name: 'chunk',
    type: 'chunk',
  }
}

test('names deferred data and optional feature chunks by stable category', () => {
  expect(
    chunkFileName(
      chunk('/repo/audio-cues/yoni-davidov/beresheet/1.json', [
        '/repo/audio-cues/yoni-davidov/beresheet/1.json',
      ])
    )
  ).toBe('assets/cue-data-[hash].js')
  expect(
    chunkFileName(
      chunk('/repo/text/pages/torah/1.json', [
        '/repo/text/pages/torah/1.json',
      ])
    )
  ).toBe('assets/page-[hash].js')
  expect(
    chunkFileName(
      chunk('/repo/app/admin/cue-authoring.ts', [
        '/repo/app/admin/cue-authoring.ts',
      ])
    )
  ).toBe('assets/optional-cue-authoring-[hash].js')
  expect(
    chunkFileName(
      chunk('/repo/app/video/recording-harness.ts', [
        '/repo/app/video/recording-harness.ts',
      ])
    )
  ).toBe('assets/optional-recording-harness-[hash].js')
  expect(
    chunkFileName(
      chunk('/repo/app/components/CueAnalyticsPage.ts', [
        '/repo/app/components/CueAnalyticsPage.ts',
      ])
    )
  ).toBe('assets/optional-cue-analytics-[hash].js')
  expect(
    chunkFileName(
      chunk('/repo/app/components/AboutPage.ts', [
        '/repo/app/components/AboutPage.ts',
      ])
    )
  ).toBe('assets/optional-about-[hash].js')
})

test('names deferred core reader chunks without excluding them from offline use', () => {
  expect(
    chunkFileName(
      chunk('/repo/app/components/ParshaPicker.ts', [
        '/repo/app/components/ParshaPicker.ts',
      ])
    )
  ).toBe('assets/reader-parsha-picker-[hash].js')
  expect(
    chunkFileName(
      chunk('/repo/app/navigation/command-palette.ts', [
        '/repo/app/navigation/command-palette.ts',
      ])
    )
  ).toBe('assets/reader-command-palette-[hash].js')
  expect(
    chunkFileName(
      chunk('/repo/app/reader/reader-settings.ts', [
        '/repo/app/reader/reader-settings.ts',
      ])
    )
  ).toBe('assets/reader-settings-[hash].js')
})
