const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
async function ready(page){await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(async i=>{try{await i.decode()}catch(e){throw new Error(i.src+': '+e.message)}}));});}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--force-color-profile=srgb']});
 const galleryOnly=process.argv.includes('--gallery-only');
 const records=galleryOnly?JSON.parse(await fs.readFile(path.join(root,'render-checks.json'),'utf8')).records:[];
 try{
  for(const device of galleryOnly?[]:['iphone','ipad']){
   const [width,height]=device==='iphone'?[1284,2778]:[2064,2752];
   const out=path.join(root,'exports','en-US',device);await fs.mkdir(out,{recursive:true});
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   for(let scene=0;scene<10;scene++){
    const url=pathToFileURL(path.join(__dirname,'index.html'));url.search=new URLSearchParams({device,scene});
    await page.goto(url.href);await ready(page);
    const record=await page.evaluate(()=>{
     const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
     return {...window.artwork,title:box(document.querySelector('h1')),copy:box(document.querySelector('.copy')),devices:[...document.querySelectorAll('.device')].map(box),details:[...document.querySelectorAll('.detail')].map(box),fontLoaded:document.fonts.check('112px Lora'),images:[...document.images].map(i=>({src:i.getAttribute('src'),width:i.naturalWidth,height:i.naturalHeight}))};
    });
    if(errors.length||!record.fontLoaded||record.copy.bottom>Math.min(...record.devices.map(d=>d.y),...record.details.map(d=>d.y))-30||record.images.some(i=>!i.width))throw new Error(JSON.stringify({errors,record}));
    const filename=String(scene+1).padStart(2,'0')+'-'+record.scene.slug+'.png';
    await page.screenshot({path:path.join(out,filename),type:'png',omitBackground:false});
    records.push({...record,filename});console.log(device,filename);
   }
   await page.close();
  }
  await fs.writeFile(path.join(root,'render-checks.json'),JSON.stringify({records},null,2));
  require('node:child_process').execFileSync('python3',[path.join(__dirname,'thumbnails.py')]);
  const sections=['iphone','ipad'].map(device=>`<section><h2>${device==='iphone'?'iPhone / 1284 × 2778':'iPad / 2064 × 2752'}</h2><div class="grid">${records.filter(r=>r.device===device).map(r=>`<a href="exports/en-US/${device}/${r.filename}"><img src="thumbnails/${device}-${r.filename}" alt="${r.scene.title.replace(/<[^>]*>/g,' ')}"><span>${r.filename.replace('.png','')}</span></a>`).join('')}</div></section>`).join('');
  await fs.writeFile(path.join(root,'preview.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Tikkun Reader / App Store Collection</title><style>@font-face{font-family:Lora;src:url('composition/assets/Lora-Regular.ttf')}*{box-sizing:border-box}body{margin:0;padding:48px;background:#f4f0e7;color:#202b32;font-family:'Helvetica Neue',sans-serif}h1{font:42px Lora,serif;margin:0 0 16px}p{line-height:1.6;max-width:860px}h2{font-size:19px;font-weight:500;margin:38px 0 20px}.grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:22px}a{color:inherit;text-decoration:none}img{display:block;width:100%;box-shadow:0 5px 15px #202b3220}span{display:block;font-size:11px;margin-top:10px}a:focus-visible{outline:3px solid #146ac3;outline-offset:6px}@media(max-width:700px){body{padding:22px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}h1{font-size:32px}}</style><h1>Tikkun Reader</h1><p>Read. Listen. Practice. A collection of 20 App Store images, built from native iPhone and iPad captures. Select an image for full resolution.</p>${sections}</html>`);
  const gallery=await browser.newPage({viewport:{width:1600,height:1800},deviceScaleFactor:1});await gallery.goto(pathToFileURL(path.join(root,'preview.html')).href);await ready(gallery);await gallery.screenshot({path:path.join(root,'contact-sheet.png'),fullPage:true});
  for(const [i,device] of ['iphone','ipad'].entries()){await gallery.locator('section').nth(i).screenshot({path:path.join(root,`contact-sheet-${device}.png`)});}
  await gallery.setViewportSize({width:390,height:844});await gallery.reload();await ready(gallery);const mobile=await gallery.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));if(mobile.scroll>mobile.width)throw new Error('Gallery overflows on mobile');
  await fs.writeFile(path.join(root,'render-checks.json'),JSON.stringify({renderer:'Playwright Chromium, forced sRGB, opaque canvas',mobileGallery:mobile,records},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
