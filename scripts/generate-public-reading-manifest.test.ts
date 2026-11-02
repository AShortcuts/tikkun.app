import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { TOKENIZATION_VERSION } from '../app/audio/cue-schema.ts'
import type { ParshaAudioRecording } from '../app/audio/types.ts'
import {
  createPublicAliyotByParsha,
  generatePublicReadingManifestSource,
  readPublishedCueCoverage,
  validateRecordingWorkPlans,
} from './generate-public-reading-manifest.mjs'

const generatedManifestUrl = new URL(
  '../generated/public-reading-manifest.ts',
  import.meta.url
)

function publicAliyot(cueStatus: 'cued' | 'missing', withAudio = true) {
  return Array.from({ length: 7 }, (_, index) => ({
    number: index + 1,
    audioId: withAudio ? `beresheet-${index + 1}` : null,
    cueStatus: withAudio ? cueStatus : 'empty',
    expectedTokenCount: cueStatus === 'cued' && withAudio ? 1 : null,
    readerHash: `#/torah/parsha/beresheet/1-1-${index + 1}`,
  }))
}

const availableRecording: ParshaAudioRecording = {
  id: 'beresheet-1',
  narratorId: 'reader',
  reading: { kind: 'parsha', id: 'beresheet', name: 'Beresheet' },
  parshaSlug: 'beresheet',
  parshaName: 'Beresheet',
  parshaNumber: 1,
  aliyah: 1,
  title: 'Beresheet 1',
  playSrc: '/beresheet-1.mp3',
  downloadSrc: '/beresheet-1.mp3',
  format: 'mp3',
  status: 'available',
  mediaIdentity: {
    algorithm: 'sha256',
    digest: 'a'.repeat(64),
    byteLength: 123,
  },
}

const expectedTokenKeysByAudioId = new Map([
  [availableRecording.id, ['1:0:0:0']],
])

function cuePayload(change: Record<string, unknown> = {}) {
  return {
    audioId: availableRecording.id,
    audioFormat: availableRecording.format,
    narratorId: availableRecording.narratorId,
    readingId: availableRecording.reading.id,
    aliyah: availableRecording.aliyah,
    mediaIdentity: availableRecording.mediaIdentity,
    tokenCount: 1,
    cueCount: 1,
    tokenizationVersion: TOKENIZATION_VERSION,
    cues: [
      {
        cueNumber: 1,
        timeStart: 0,
        pageNumber: 1,
        lineIndex: 0,
        fragmentIndex: 0,
        wordIndex: 0,
      },
    ],
    ...change,
  }
}

async function withCueFixture(
  payload: unknown,
  relativePath = 'reader/01 beresheet/1.json'
) {
  const root = await mkdtemp(path.join(tmpdir(), 'tikkun-cue-manifest-'))
  const filePath = path.join(root, relativePath)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(payload))
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

test('checked-in public reading manifest matches its authoritative sources', async () => {
  const [{ contents }, checkedInContents] = await Promise.all([
    generatePublicReadingManifestSource(),
    readFile(generatedManifestUrl, 'utf8'),
  ])

  expect(checkedInContents).toBe(contents)
})

test('keeps published asset truth independent from manual workflow labels', () => {
  expect(() =>
    validateRecordingWorkPlans({
      recordings: [availableRecording],
      workRows: [
        {
          number: 1,
          parshaEnglish: 'Beresheet',
          parshaHebrew: 'בראשית',
          workStatus: 'Planned',
        },
      ],
      publicAliyotByParsha: { beresheet: publicAliyot('missing') },
    })
  ).not.toThrow()

  expect(() =>
    validateRecordingWorkPlans({
      recordings: [availableRecording],
      workRows: [
        {
          number: 1,
          parshaEnglish: 'Beresheet',
          parshaHebrew: 'בראשית',
          workStatus: 'Active',
        },
      ],
      publicAliyotByParsha: { beresheet: publicAliyot('cued') },
    })
  ).not.toThrow()
})

test('rejects published cue data without an available recording', () => {
  expect(() =>
    createPublicAliyotByParsha({
      recordings: [],
      cueCoverage: new Map([
        ['orphan-1', { status: 'cued', expectedTokenCount: 1 }],
      ]),
    })
  ).toThrow('Published cue payload has no available recording: orphan-1')
})

test('rejects Cue Data with stale recording identity', async () => {
  const fixture = await withCueFixture(cuePayload({
    mediaIdentity: {
      ...availableRecording.mediaIdentity,
      digest: 'b'.repeat(64),
    },
  }))
  try {
    await expect(readPublishedCueCoverage({
      root: fixture.root,
      recordings: [availableRecording],
      expectedTokenKeysByAudioId,
    })).rejects.toThrow('does not match its available recording')
  } finally {
    await fixture.cleanup()
  }
})

test('rejects cue-bearing data with a stale tokenization version', async () => {
  const fixture = await withCueFixture(cuePayload({ tokenizationVersion: 'v1' }))
  try {
    await expect(readPublishedCueCoverage({
      root: fixture.root,
      recordings: [availableRecording],
      expectedTokenKeysByAudioId,
    })).rejects.toThrow(`uses v1; expected ${TOKENIZATION_VERSION}`)
  } finally {
    await fixture.cleanup()
  }
})

test('rejects valid Cue Data stored under the wrong path', async () => {
  const fixture = await withCueFixture(cuePayload(), 'reader/beresheet/1.json')
  try {
    await expect(readPublishedCueCoverage({
      root: fixture.root,
      recordings: [availableRecording],
      expectedTokenKeysByAudioId,
    })).rejects.toThrow(
      'is reader/beresheet/1.json; expected reader/01 beresheet/1.json'
    )
  } finally {
    await fixture.cleanup()
  }
})

test('rejects Cue Data that skips a canonical token', async () => {
  const fixture = await withCueFixture(
    cuePayload({
      tokenCount: 2,
      cues: [
        {
          cueNumber: 1,
          timeStart: 0,
          pageNumber: 1,
          lineIndex: 0,
          fragmentIndex: 0,
          wordIndex: 1,
        },
      ],
    })
  )
  try {
    await expect(
      readPublishedCueCoverage({
        root: fixture.root,
        recordings: [availableRecording],
        expectedTokenKeysByAudioId: new Map([
          [availableRecording.id, ['1:0:0:0', '1:0:0:1']],
        ]),
      })
    ).rejects.toThrow('diverges from the canonical token sequence at cue 1')
  } finally {
    await fixture.cleanup()
  }
})
