import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import type { LineType } from '../app/components/Page.ts'
import { isParshaAudioRecording, type AudioNarrator, type AudioRecording } from '../app/audio/types.ts'
import { TOKENIZATION_VERSION } from '../app/audio/cue-schema.ts'
import { cueFileRelativePathForRecording } from '../app/audio/cue-file.ts'
import { canonicalLineWords } from '../app/reader/canonical-line-words.ts'
import { audioNarrators, audioRecordings } from '../generated/audio-manifest.ts'
import {
  PUBLISHED_CONTENT_DIRECTORY,
  PUBLISHED_CONTENT_SCHEMA,
  parsePublishedCatalog,
  publishedCueFileName,
  type BuiltInContent,
} from '../app/updates/published-content.ts'

export interface PublishedContent {
  // Paths under PUBLISHED_CONTENT_DIRECTORY: latest.json and cues/<digest>.json.
  files: Map<string, string>
  builtIn: BuiltInContent
}

type TextPage = readonly [pageNumber: number, lines: readonly Pick<LineType, 'text' | 'verses' | 'aliyot'>[]]

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

// Cues point at word positions inside aliyot, so only those positions are
// fingerprinted. New or changed recordings and cues never change this value.
export function textLayoutDigest(pages: readonly TextPage[]) {
  return sha256(JSON.stringify({
    tokenization: TOKENIZATION_VERSION,
    pages: pages.map(([pageNumber, lines]) => [pageNumber, lines.map((line, lineIndex) => ({
      verses: line.verses,
      aliyot: line.aliyot,
      words: canonicalLineWords(pageNumber, lineIndex, line).map((word) => word.tokenKey),
    }))]),
  }))
}

export function createPublishedContent({ narrators, recordings, pages, readCueFile }: {
  narrators: readonly AudioNarrator[]
  recordings: readonly AudioRecording[]
  pages: readonly TextPage[]
  readCueFile(relativePath: string): string | null
}): PublishedContent {
  const files = new Map<string, string>()
  const cues: Record<string, string> = {}
  const parshaRecordings = recordings.filter(isParshaAudioRecording)
  for (const recording of parshaRecordings) {
    const cuePath = cueFileRelativePathForRecording(recording)
    if (!cuePath) throw new Error(`${recording.id} has no cue file path`)
    const source = readCueFile(cuePath)
    if (source === null) continue
    let payload: unknown
    try {
      payload = JSON.parse(source)
    } catch (error) {
      throw new Error(`${cuePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
    const published = JSON.stringify(payload)
    const digest = sha256(published)
    cues[cuePath] = digest
    files.set(publishedCueFileName(digest), published)
  }
  // Publish exactly what installed apps accept, in its normalized form.
  const catalog = parsePublishedCatalog({
    schema: PUBLISHED_CONTENT_SCHEMA,
    textLayout: textLayoutDigest(pages),
    narrators,
    recordings: parshaRecordings,
    cues,
  })
  const catalogText = JSON.stringify(catalog)
  files.set('latest.json', catalogText)
  return { files, builtIn: { digest: sha256(catalogText), textLayout: catalog.textLayout, cues: catalog.cues } }
}

export function readTorahPages(root: string): TextPage[] {
  const directory = path.join(root, 'text/pages/torah')
  return readdirSync(directory)
    .filter((name) => /^\d+\.json$/.test(name))
    .map((name) => Number(name.slice(0, -'.json'.length)))
    .sort((a, b) => a - b)
    .map((pageNumber) => [pageNumber, JSON.parse(readFileSync(path.join(directory, `${pageNumber}.json`), 'utf8'))] as const)
}

export function buildPublishedContent(root: string): PublishedContent {
  return createPublishedContent({
    narrators: audioNarrators,
    recordings: audioRecordings,
    pages: readTorahPages(root),
    readCueFile(relativePath) {
      const file = path.join(root, relativePath)
      return existsSync(file) ? readFileSync(file, 'utf8') : null
    },
  })
}

// The website build publishes the recording list and cue files for installed apps.
// Native bundles skip them and carry a summary of their own copy instead.
export function publishedContentPlugin(root: string, { native }: { native: boolean }): Plugin {
  return {
    name: 'published-content',
    apply: 'build',
    generateBundle() {
      if (native || this.environment.config.consumer === 'server') return
      for (const [name, source] of buildPublishedContent(root).files) {
        this.emitFile({ type: 'asset', fileName: `${PUBLISHED_CONTENT_DIRECTORY}/${name}`, source })
      }
    },
  }
}
