import globals from 'globals'
import pluginJs from '@eslint/js'
import svelte from 'eslint-plugin-svelte'
import tseslint from 'typescript-eslint'
import svelteConfig from './svelte.config.js'

export default [
  {
    files: [
      'app/**/*.{js,mjs,cjs,ts,svelte}',
      'functions/**/*.{js,mjs,cjs,ts}',
      'src/**/*.{js,mjs,cjs,ts,svelte}',
      'scripts/*.mjs',
      'vite.config.ts',
      'svelte.config.js',
    ],
  },
  {
    ignores: [
      'dist/',
      '.svelte-kit/',
      '.tsimp/',
      'site/audio/**',
      'generated/**',
    ],
  },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    files: ['app/**/*.svelte', 'src/**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        svelteConfig,
      },
    },
  },
  {
    files: ['app/**/*.svelte'],
    rules: {
      'svelte/no-navigation-without-resolve': 'off',
    },
  },
]
