import type { CapacitorConfig } from '@capacitor/cli'
import type {} from '@capawesome/capacitor-live-update'
import { updateConfig } from './scripts/update-config.mjs'

const updates = updateConfig()

const config: CapacitorConfig = {
  appId: 'com.adamn.tikkunreader',
  appName: 'Tikkun',
  webDir: 'dist-native',
  server: {
    appStartPath: '/reader/',
  },
  ios: {
    contentInset: 'never',
  },
  plugins: {
    LiveUpdate: {
      autoUpdateStrategy: 'none',
      autoBlockRolledBackBundles: true,
      autoDeleteBundles: true,
      readyTimeout: updates.enabled ? 30_000 : 0,
      httpTimeout: 60_000,
      ...(updates.enabled ? { publicKey: updates.publicKey } : {}),
    },
    TikkunMedia: { mediaOrigin: process.env.TIKKUN_NATIVE_MEDIA_ORIGIN ?? 'https://tikkunreader.com' },
  },
}

export default config
