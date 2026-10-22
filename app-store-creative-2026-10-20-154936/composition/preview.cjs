const {chromium}=require('playwright');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--force-color-profile=srgb']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function ready(){await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});}
  await page.goto(pathToFileURL(path.join(root,'preview.html')).href);await ready();
  if(errors.length)throw new Error(errors.join('\n'));
  await page.screenshot({path:path.join(root,'contact-sheet.png'),fullPage:true});
  await page.locator('.contexts').screenshot({path:path.join(root,'previews','placement-mockups.png')});
  for(const placement of ['header','search'])await page.locator('#'+placement+'-placement').screenshot({path:path.join(root,'previews',placement+'-placement.png')});
  await page.setViewportSize({width:390,height:844});await ready();
  const mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  if(mobile.width!==mobile.scrollWidth)throw new Error('Mobile gallery overflow');
  await fs.writeFile(path.join(root,'preview-checks.json'),JSON.stringify({imagesDecoded:true,javascriptErrors:errors,mobile},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
