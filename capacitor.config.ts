import type { CapacitorConfig } from '@capacitor/cli'

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
    TikkunMedia: { mediaOrigin: process.env.TIKKUN_NATIVE_MEDIA_ORIGIN ?? 'https://tikkunreader.com' },
  },
}

export default config
