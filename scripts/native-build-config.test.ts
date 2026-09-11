import { expect, test } from 'vitest'
import { includeNativeAsset, nativeBuildConfig, nativeContentFiles } from './native-build-config.mjs'

test('web builds do not require a native media host', () => {
  expect(nativeBuildConfig({})).toEqual({ enabled: false, mediaOrigin: '' })
})

test('native configuration requires an explicit secure origin and root deployment', () => {
  expect(() => nativeBuildConfig({ TIKKUN_NATIVE: '1' })).toThrow('HTTPS audio host')
  for (const origin of ['http://example.org', 'https://user:pass@example.org', 'https://example.org/audio', 'https://example.org?key=x']) {
    expect(() => nativeBuildConfig({
      TIKKUN_NATIVE: '1', TIKKUN_NATIVE_MEDIA_ORIGIN: origin,
    })).toThrow()
  }
  expect(() => nativeBuildConfig({
    TIKKUN_NATIVE: '1', TIKKUN_NATIVE_MEDIA_ORIGIN: 'https://example.org',
    TIKKUN_BASE_PATH: '/preview',
  })).toThrow('empty TIKKUN_BASE_PATH')
  expect(nativeBuildConfig({
    TIKKUN_NATIVE: '1', TIKKUN_NATIVE_MEDIA_ORIGIN: 'https://example.org/',
  })).toEqual({ enabled: true, mediaOrigin: 'https://example.org' })
})

test('native assets retain reader content and exclude bulk media and host configuration', () => {
  for (const file of ['audio/narrator/file.m4a', 'audio', 'clips/file.mp4', 'prototypes/demo/index.html', '.DS_Store', '_headers', '_redirects', 'service-worker.js']) {
    expect(includeNativeAsset(file), file).toBe(false)
  }
  for (const file of ['fonts/reader.woff2', 'manifest.webmanifest', 'assets/icon.png', 'text/torah.json']) {
    expect(includeNativeAsset(file), file).toBe(true)
  }
})

test('native content proof includes transitive imports, assets, and styles', () => {
  const manifest = {
    'text/pages/torah/1.json': { file: 'page.js', imports: ['shared'] },
    shared: { file: 'shared.js', css: ['shared.css'], assets: ['font.woff2'], imports: ['shared'] },
  }
  const sources = ['text/pages/torah/1.json']
  const files = ['page.js', 'shared.js', 'shared.css', 'font.woff2']
  expect(nativeContentFiles(manifest, sources, files)).toEqual([{ source: sources[0], files: [...files].sort() }])
  expect(() => nativeContentFiles(manifest, sources, files.slice(0, -1))).toThrow('missing a bundled dependency')
  expect(() => nativeContentFiles(manifest, ['audio-cues/missing.json'], files)).toThrow('no compiled module')
  expect(nativeContentFiles(manifest, ['text/pages/torah/2.json'], files, { 'text/pages/torah/2.json': 'shared.js' }))
    .toEqual([{ source: 'text/pages/torah/2.json', files: ['font.woff2', 'shared.css', 'shared.js'] }])
})
