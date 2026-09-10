import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Plugin } from 'vite'

const execFileAsync = promisify(execFile)
const compilerInputs = new Set([
  'generated/audio-manifest.ts',
  'scripts/generate-public-reading-manifest.mjs',
  'scripts/public-reading-tokens.ts',
  'app/reader/canonical-line-words.ts',
  'app/reader/word-tokenization.ts',
  'app/reader/token-position.ts',
  'app/reading/exact-token-range.ts',
  'app/text-filter.ts',
  'app/data/about-progress.ts',
])

export function isPublicReadingCoverageInput(root: string, file: string) {
  const relative = path.relative(root, file).split(path.sep).join('/')
  return compilerInputs.has(relative) ||
    /^audio-cues\/.*\.json$/.test(relative) ||
    /^text\/(torah-toc\.json|pages\/torah\/.*\.json)$/.test(relative) ||
    /^app\/audio\/(cue-validation|cue-review|cue-schema|cue-file|types)\.ts$/.test(relative) ||
    /^app\/calendar-model\/.*\.ts$/.test(relative) ||
    /^app\/view-model\/navigation\/parsha-routes\.ts$/.test(relative)
}

export function publicReadingCoveragePlugin(): Plugin {
  let dispose: (() => Promise<void>) | undefined
  return {
    name: 'public-reading-coverage',
    apply: 'serve',
    async configureServer(server) {
      // Test servers must not rewrite the developer's generated catalog.
      if (server.config.mode === 'test') return
      const root = server.config.root
      const controller = new AbortController()
      let timer: ReturnType<typeof setTimeout> | undefined
      let running: Promise<void> | null = null
      let dirty = false
      let closed = false
      let failed = false

      function schedule() {
        clearTimeout(timer)
        timer = setTimeout(() => {
          timer = undefined
          void refresh()
        }, 200)
      }

      function refresh(): Promise<void> {
        if (closed) return Promise.resolve()
        if (running) { dirty = true; return running }
        dirty = false
        running = (async () => {
          try {
            // Fresh imports include changed recording identities and compiler code.
            const { stdout } = await execFileAsync(process.execPath, [
              '--import', 'tsx', 'scripts/generate-public-reading-manifest.mjs',
            ], { cwd: root, signal: controller.signal })
            if (closed) return
            server.config.logger.info(stdout.trim())
            if (failed) server.hot.send({ type: 'full-reload' })
            failed = false
          } catch (error) {
            if (closed) return
            failed = true
            const message = `Cue coverage refresh failed; keeping the last valid catalog.\n${error instanceof Error ? error.message : String(error)}`
            server.config.logger.error(message)
            server.hot.send({ type: 'error', err: {
              message, stack: '', plugin: 'public-reading-coverage',
            } })
          } finally {
            running = null
            if (dirty && !closed) schedule()
          }
        })()
        return running
      }

      const changed = (event: string, file: string) => {
        if (closed || !['add', 'change', 'unlink'].includes(event)) return
        if (!isPublicReadingCoverageInput(root, file)) return
        dirty = true
        schedule()
      }
      server.watcher.on('all', changed)
      dispose = async () => {
        closed = true
        clearTimeout(timer)
        server.watcher.off('all', changed)
        controller.abort()
        await running
      }
      await refresh()
    },
    async closeBundle() {
      await dispose?.()
    },
  }
}
