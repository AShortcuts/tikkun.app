import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import process from 'node:process'
import { nativeBuildConfig } from './scripts/native-build-config.mjs'

const native = nativeBuildConfig()

const configuredBasePath = process.env.TIKKUN_BASE_PATH ?? ''
const basePath =
  configuredBasePath === '/'
    ? ''
    : configuredBasePath.replace(/\/+$/, '')

if (basePath && !basePath.startsWith('/')) {
  throw new Error('TIKKUN_BASE_PATH must be empty or start with "/"')
}

export default {
  preprocess: vitePreprocess(),
  kit: {
    // Each kind of run keeps its own generated app, so a build or test run never replaces the
    // page list a running dev server is serving (which leaves every page on a 500 error).
    outDir: native.enabled ? '.svelte-kit-native' : process.env.VITEST ? '.svelte-kit-test'
      : process.env.TIKKUN_PRODUCTION_ROUTES ? '.svelte-kit-web' : '.svelte-kit',
    adapter: adapter({
      pages: native.enabled ? 'dist-native' : 'dist',
      assets: native.enabled ? 'dist-native' : 'dist',
      strict: true,
    }),
    files: {
      routes: process.env.TIKKUN_PRODUCTION_ROUTES ?? 'src/routes',
      assets: native.enabled ? '.native-site' : 'site',
      appTemplate: process.env.VITEST ? 'src/app.test.html' : 'src/app.html',
    },
    paths: {
      base: basePath,
    },
    prerender: {
      handleMissingId: ({ path, id, message }) => {
        // Reader fragments are routes owned by Reader Route, not DOM IDs.
        if (path.endsWith('/reader/') && id.startsWith('/')) return
        throw new Error(message)
      },
      handleUnseenRoutes: ({ routes, message }) => {
        // The public Tidbit detail route stays empty until the first article exists.
        const intentionallyEmptyRoutes = new Set(['/(site)/tidbits/[slug]'])
        const unexpectedRoutes = routes.filter(
          (route) => !intentionallyEmptyRoutes.has(route)
        )
        if (unexpectedRoutes.length > 0) throw new Error(message)
      },
    },
  },
}
