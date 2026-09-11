import path from 'node:path'
import type { Plugin } from 'vite'

export function contentInventoryPlugin(version: string): Plugin {
  return {
    name: 'content-inventory',
    apply: 'build',
    generateBundle(_options, bundle) {
      if (this.environment.config.consumer === 'server') return
      const modules: Record<string, string> = {}
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue
        for (const id of Object.keys(output.modules)) {
          const source = path.relative(this.environment.config.root, id).split(path.sep).join('/')
          if (/^(?:text\/pages|audio-cues)\/.*\.json$/.test(source)) modules[source] = output.fileName
        }
      }
      this.emitFile({ type: 'asset', fileName: '.vite/content-inventory.json', source: JSON.stringify({ version, modules }) })
    },
  }
}
