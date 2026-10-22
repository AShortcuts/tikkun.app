const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
async function ready(page){await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--force-color-profile=srgb']});const records=[];
 try{
  for(const [placement,canvasHeight] of [['header',1646],['search',2560]]){
   const page=await browser.newPage({viewport:{width:3840,height:canvasHeight},deviceScaleFactor:1});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const url=pathToFileURL(path.join(__dirname,'index.html'));url.search=new URLSearchParams({placement});
   await page.goto(url.href);await ready(page);
   const record=await page.evaluate(()=>{const [x,y,w,h]=window.artwork.safe;return {...window.artwork,fontLoaded:document.fonts.check('110px Lora'),essential:[...document.querySelectorAll('.essential')].map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent,x:r.x,y:r.y,width:r.width,height:r.height,inside:r.x>=x&&r.y>=y&&r.right<=x+w&&r.bottom<=y+h};})};});
   if(errors.length||!record.fontLoaded||record.essential.some(e=>!e.inside))throw new Error(JSON.stringify({errors,record}));
   const filename=`tikkun-reader-${placement}.png`;
   await page.screenshot({path:path.join(root,'creative-assets',placement,filename),type:'png',omitBackground:false});
   const [x,y,width,height]=record.safe;
   await page.screenshot({path:path.join(root,'previews',`${placement}-safe-crop.png`),clip:{x,y,width,height},type:'png'});
   url.searchParams.set('guides','1');await page.goto(url.href);await ready(page);
   await page.screenshot({path:path.join(root,'previews',`${placement}-safe-guide.png`),type:'png'});
   records.push({...record,filename});await page.close();
  }
  await fs.writeFile(path.join(root,'render-checks.json'),JSON.stringify({renderer:'Playwright Chromium; forced sRGB; opaque canvas',records},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
