import globals from 'globals'
import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
  { files: ['src/**/*.{js,mjs,cjs,ts}', 'scripts/*.mjs', 'vite.config.ts'] },
  { ignores: ['dist/', '.tsimp/', 'static/audio/**', 'src/data/audio-manifest.generated.ts'] },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
]
