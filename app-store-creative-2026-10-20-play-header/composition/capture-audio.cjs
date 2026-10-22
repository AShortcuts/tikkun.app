const {chromium}=require('playwright');
const path=require('node:path');
const fs=require('node:fs/promises');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:440,height:956},deviceScaleFactor:3});
  const preferences={highlightFill:'#ffd700',highlightOpacity:0.3,outlineColor:'#e6c14a',outlineWidth:1,outlineOffset:0,radius:3,glow:0};
  await page.addInitScript(p=>localStorage.setItem('tikkun.reader-preferences',JSON.stringify(p)),preferences);
  const url='https://tikkunreader.com/reader/#/torah/parsha/beresheet/1-1-1';
  await page.goto(url);await page.waitForTimeout(2300);
  await page.getByRole('button',{name:'Play ראשון',exact:true}).first().click();
  await page.locator('.word.is-active-word').first().waitFor({timeout:20000});
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.waitForTimeout(250);
  const word=await page.locator('.word.is-active-word').first().evaluate(el=>({text:el.textContent,tokenKey:el.dataset.tokenKey,rect:el.getBoundingClientRect().toJSON(),color:getComputedStyle(el).backgroundColor,shadow:getComputedStyle(el).boxShadow}));
  if(word.tokenKey!=='1:0:0:0')throw new Error('Expected the first word of Beresheet: '+JSON.stringify(word));
  await page.screenshot({path:path.join(root,'captures','05-beresheet-soft-highlight.png')});
  const play=page.getByRole('button',{name:'Play',exact:true});
  const playBounds=await play.boundingBox();
  await play.screenshot({path:path.join(root,'captures','06-play-button.png')});
  await fs.writeFile(path.join(root,'capture-evidence.json'),JSON.stringify({url,date:'2026-10-20',source:'Public web reader; genuine paused playback; supported appearance preferences',viewport:{width:440,height:956},deviceScaleFactor:3,preferences,word,playBounds},null,2));
  console.log(JSON.stringify({word,playBounds}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
