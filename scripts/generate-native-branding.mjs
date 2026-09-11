import { readFile, copyFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = new URL('../', import.meta.url)
const svg = await readFile(new URL('site/favicon.svg', root), 'utf8')
const icon = new URL('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', root)
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 })
  await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:white}body{display:grid;place-items:center}svg{width:720px;height:720px}</style>${svg}`)
  await page.screenshot({ path: fileURLToPath(icon) })
  await copyFile(icon, new URL('ios/App/App/Assets.xcassets/Splash.imageset/Tikkun.png', root))
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await rm(new URL(`ios/App/App/Assets.xcassets/Splash.imageset/${name}`, root), { force: true })
  }
  console.log('Rendered native icon and launch mark from site/favicon.svg (1024 x 1024, opaque).')
} finally { await browser.close() }
