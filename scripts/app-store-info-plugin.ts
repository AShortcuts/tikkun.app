import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { APP_STORE_INFO_PATH, parseAppStoreInfo } from '../app/updates/app-store-info.ts'

// Publishes config/app-store.json, checked, so installed apps can show the App Store Update Prompt.
export function appStoreInfoPlugin(root: string, { native }: { native: boolean }): Plugin {
  return {
    name: 'app-store-info',
    apply: 'build',
    generateBundle() {
      if (native || this.environment.config.consumer === 'server') return
      const info = parseAppStoreInfo(JSON.parse(readFileSync(path.join(root, 'config/app-store.json'), 'utf8')))
      this.emitFile({ type: 'asset', fileName: APP_STORE_INFO_PATH, source: `${JSON.stringify(info)}\n` })
    },
  }
}
