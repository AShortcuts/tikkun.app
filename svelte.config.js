import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import process from 'node:process'

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
    adapter: adapter({
      pages: 'dist',
      assets: 'dist',
      strict: true,
    }),
    files: {
      assets: 'site',
      appTemplate: process.env.VITEST ? 'src/app.test.html' : 'src/app.html',
    },
    paths: {
      base: basePath,
    },
    prerender: {
      handleMissingId: ({ path, id, message }) => {
        // Reader fragments are routes owned by the legacy hash router, not DOM IDs.
        if (path.endsWith('/reader/') && id.startsWith('/')) return
        throw new Error(message)
      },
      handleUnseenRoutes: ({ routes, message }) => {
        // The Tidbit detail route intentionally has no entries until the first article exists.
        const unexpectedRoutes = routes.filter(
          (route) => route !== '/(site)/tidbits/[slug]'
        )
        if (unexpectedRoutes.length > 0) throw new Error(message)
      },
    },
  },
}
