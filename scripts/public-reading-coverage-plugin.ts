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

const generatedManifest = 'generated/public-reading-manifest.ts'

/** Cue files and the catalog built from them, which the Reader reloads instead of hot-swapping. */
export function isCueDataReloadFile(root: string, file: string) {
  const relative = path.relative(root, file).split(path.sep).join('/')
  return /^audio-cues\/.*\.json$/.test(relative) || relative === generatedManifest
}

export function publicReadingCoveragePlugin(): Plugin {
  let dispose: (() => Promise<void>) | undefined
  let projectRoot: string | undefined
  let cueDataChanged: (() => void) | undefined
  return {
    name: 'public-reading-coverage',
    apply: 'serve',
    hotUpdate: {
      // After Vite's glob plugin, which adds the module that lists cue files.
      order: 'post',
      handler({ file, modules }) {
        if (!projectRoot || !cueDataChanged || !isCueDataReloadFile(projectRoot, file)) return
        // Hot-swapping the Reader for new cue data crashes it, so rebuild these
        // modules and reload the page once the reading catalog has caught up.
        for (const module of modules) this.environment.moduleGraph.invalidateModule(module)
        if (this.environment.name === 'client') cueDataChanged()
        return []
      },
    },
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
      let reloadPending = false

      function reloadPage() {
        reloadPending = false
        const manifest = path.join(root, generatedManifest)
        for (const environment of Object.values(server.environments)) {
          for (const module of environment.moduleGraph.getModulesByFile(manifest) ?? []) {
            environment.moduleGraph.invalidateModule(module)
          }
        }
        server.hot.send({ type: 'full-reload' })
      }

      projectRoot = root
      cueDataChanged = () => {
        reloadPending = true
        // A catalog refresh is already due; reload after it finishes.
        if (!timer && !running) reloadPage()
      }

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
            // A recovered catalog also needs the page to pick it up.
            if (failed) reloadPending = true
            if (!dirty && reloadPending) reloadPage()
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
        cueDataChanged = undefined
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
