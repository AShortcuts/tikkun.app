const scenes = [
 {slug:'within-reach',title:'Your next aliyah,<br><em>within reach.</em>',sub:'Read. Listen. Practice.',capture:'01-reader.png',kind:'hero',palette:'paper',foot:'Tikkun Reader'},
 {slug:'hear-and-follow',title:'Hear it.<br><em>Follow it.</em>',sub:'Listen with word-by-word highlighting.',capture:'03-audio.png',kind:'full',palette:'blue',foot:'Audio and word timing vary by reading.'},
 {slug:'practice',title:'Now try<br><em>without vowels.</em>',sub:'Hide nekudot and cantillation. Keep your place.',capture:'02-practice.png',kind:'tilt',palette:'paper',foot:'Build your reading practice.'},
 {slug:'find-reading',title:'Find your<br><em>next reading.</em>',sub:'A library with upcoming readings close at hand.',capture:'08-library.png',kind:'full',palette:'ice',foot:'Israel and Diaspora calendar settings.'},
 {slug:'choose-aliyah',title:'Straight to<br><em>your aliyah.</em>',sub:'Choose a section. Play available recordings.',capture:'09-aliyah.png',kind:'aliyah',palette:'paper',foot:'Start where you need to practice.'},
 {slug:'your-layout',title:'A layout<br><em>that fits.</em>',sub:'Flowing Reading or Torah-line Match.',capture:'06-settings.png',kind:'detail',palette:'paper',foot:'Side-by-side views on supported layouts.',crop:{iphone:[145,176,1125,1330],ipad:[1180,124,850,970]}},
 {slug:'your-pace',title:'Practice<br><em>at your pace.</em>',sub:'Adjust playback speed for your practice.',capture:'10-playback.png',kind:'detail',palette:'blue',foot:'Listen with available aliyah recordings.',crop:{iphone:[145,176,1125,1590],ipad:[1180,124,850,1080]}},
 {slug:'take-it-along',title:'Take the<br><em>recording along.</em>',sub:'Save available audio for offline listening.',capture:'04-media.png',kind:'full',palette:'paper',foot:'Download recordings while online.'},
 {slug:'saved-on-device',title:'Know what<br><em>is saved.</em>',sub:'See and manage recordings on your device.',capture:'05-storage.png',kind:'full',palette:'ice',foot:'Clear storage. Keep the readings you need.'},
 {slug:'after-dark',title:'A quieter view<br><em>after dark.</em>',sub:'Choose the appearance that suits your reading.',capture:'07-dark.png',kind:'full',palette:'night',foot:'Light, dark, and sepia appearances.'}
];
const devices={iphone:{w:1470,h:3000,screen:[75,66,1320,2868],radius:185,frame:'iphone-17-pro-max-silver.png'},ipad:{w:2300,h:3000,screen:[118,124,2064,2752],radius:65,frame:'ipad-pro-13-silver.png'}};
const palettes={paper:['#f4f0e7','#202b32','#146ac3','#e3ca91'],ice:['#e7eff7','#202b32','#146ac3','#abcce8'],blue:['#146ac3','#fffdf6','#ffe191','#89b8df'],night:['#20262d','#f5f1e8','#9fc8ec','#485b6c']};
const params=new URLSearchParams(location.search),device=params.get('device')||'iphone',index=Number(params.get('scene')||0),scene=scenes[index],d=devices[device],isPad=device==='ipad',w=isPad?2064:1284,h=isPad?2752:2778,margin=isPad?124:92;
const board=document.getElementById('artboard');const palette=palettes[scene.palette];board.className=device;Object.entries({'--w':w+'px','--h':h+'px','--margin':margin+'px','--paper':palette[0],'--ink':palette[1],'--accent':palette[2],'--glow':palette[3]}).forEach(([k,v])=>board.style.setProperty(k,v));
board.innerHTML=`<div class="wash"></div><div class="brand">TIKKUN <span>Reader</span></div><div class="edition">Read &amp; practice</div><div class="rule"></div><header class="copy"><h1>${scene.title}</h1><p class="subtitle">${scene.sub}</p></header>`;
const src=`../captures/${device}/${scene.capture}`;
function addDevice(width,left,top,angle=0){const scale=width/d.w;const node=document.createElement('div');node.className='device';node.style.cssText=`width:${width}px;height:${d.h*scale}px;left:${left}px;top:${top}px;transform:rotate(${angle}deg)`;const [x,y,sw,sh]=d.screen;node.innerHTML=`<div class="screen" style="left:${x*scale}px;top:${y*scale}px;width:${sw*scale}px;height:${sh*scale}px;border-radius:${d.radius*scale}px"><img src="${src}" alt="Native Tikkun ${device} screen"></div><img class="bezel" src="assets/${d.frame}" alt="">`;board.append(node);}
function addDetail(crop,width,left,top){const [x,y,cw,ch]=crop,scale=width/cw;const node=document.createElement('div');node.className='detail';node.style.cssText=`width:${width}px;left:${left}px;top:${top}px`;node.innerHTML=`<div class="detail-label">Inside the app</div><div class="detail-image" style="height:${ch*scale}px"><img src="${src}" alt="Enlarged native screen detail" style="width:${d.screen[2]*scale}px;height:${d.screen[3]*scale}px;left:${-x*scale}px;top:${-y*scale}px"></div>`;board.append(node);}
if(scene.kind==='detail'){
 if(isPad){addDevice(1130,925,1090,3);addDetail(scene.crop.ipad,900,124,815)}
 else{addDevice(650,635,1250,3);addDetail(scene.crop.iphone,900,92,795)}
}else if(scene.kind==='aliyah'&&isPad){addDevice(1120,865,975,0);addDetail([1520,1825,340,770],510,160,790)}
else if(scene.kind==='hero'){addDevice(isPad?1780:1090,isPad?142:97,isPad?760:730)}
else if(scene.kind==='tilt'){addDevice(isPad?1400:855,isPad?332:215,isPad?740:755,-4)}
else{const width=isPad?1440:865;addDevice(width,(w-width)/2,isPad?715:740)}
if(scene.kind!=='hero')board.insertAdjacentHTML('beforeend',`<div class="footer"><span>${scene.foot}</span><span>${String(index+1).padStart(2,'0')} / 10</span></div>`);
window.artwork={device,index,width:w,height:h,scene,geometry:d};
