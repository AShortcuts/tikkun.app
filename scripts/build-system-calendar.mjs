import { build } from 'esbuild'

await build({
  entryPoints: ['app/platform/system-calendar.ts'],
  outfile: 'ios/TikkunSystem/Sources/TikkunSystem/Resources/calendar.js',
  bundle: true,
  format: 'iife',
  globalName: 'TikkunCalendar',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  target: 'es2022',
  minify: true,
  legalComments: 'eof',
})
