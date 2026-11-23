import { readFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = new URL('../', import.meta.url)
const svg = await readFile(new URL('site/favicon.svg', root), 'utf8')
const icon = new URL('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', root)
const splash = new URL('ios/App/App/Assets.xcassets/Splash.imageset/', root)
// Transparent marks let the launch screen's system background show through in light and dark.
const launchMarks = [
  { name: 'Tikkun.png', color: '#000' },
  { name: 'Tikkun-dark.png', color: '#fff' },
]
const frame = 'html,body{margin:0;width:100%;height:100%}body{display:grid;place-items:center}svg{width:720px;height:720px}'
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 })
  await page.setContent(`<style>${frame}html,body{background:white}</style>${svg}`)
  await page.screenshot({ path: fileURLToPath(icon) })
  for (const { name, color } of launchMarks) {
    await page.setContent(`<style>${frame}html,body{background:transparent}path{fill:${color};stroke:none}</style>${svg}`)
    await page.screenshot({ path: fileURLToPath(new URL(name, splash)), omitBackground: true })
  }
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await rm(new URL(name, splash), { force: true })
  }
  console.log('Rendered native icon (1024 x 1024, opaque) and light and dark launch marks (transparent) from site/favicon.svg.')
} finally { await browser.close() }
