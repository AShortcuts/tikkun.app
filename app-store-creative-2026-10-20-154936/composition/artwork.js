const params=new URLSearchParams(location.search);
const placement=params.get('placement')||'header';
const specs={header:{width:3840,height:1646,safe:[1097,493,1646,661]},search:{width:3840,height:2560,safe:[836,765,2168,1030]}};
if(!specs[placement])throw new Error('Unknown placement');
const board=document.getElementById('artboard');board.className=placement;
board.innerHTML='<div class="light"></div><div class="paper-plane"></div><div class="blue-plane"></div><div class="brand essential">Tikkun Reader</div><div class="rule"></div>';
board.insertAdjacentHTML('beforeend',placement==='header'?'<div class="copy essential"><h1>Your next aliyah,<br><em>within reach.</em></h1><p class="sub">Read. Listen. Practice.</p></div>':'<div class="copy essential"><h1>Torah reading<br><em>practice.</em></h1><p class="sub">Read with nekudot.<br>Practice without them.</p></div>');
function device(width,x,y,angle){const scale=width/1470;const node=document.createElement('div');node.className='device';node.style.cssText=`left:${x}px;top:${y}px;width:${width}px;height:${3000*scale}px;transform:rotate(${angle}deg)`;node.innerHTML=`<div class="screen" style="left:${75*scale}px;top:${66*scale}px;width:${1320*scale}px;height:${2868*scale}px;border-radius:${185*scale}px"><img src="../captures/01-reader.png" alt="Native Tikkun Reader with nekudot"></div><img class="bezel" src="assets/iphone-17-pro-max-silver.png" alt="">`;board.append(node);return {width,x,y,angle,scale};}
const geometry=placement==='header'?device(575,2175,300,-5):device(790,2160,570,6);
const crop={source:'../captures/02-practice.png',x:40,y:560,width:1240,height:260};
if(placement==='search'){const scale=1076/crop.width;board.insertAdjacentHTML('beforeend',`<div class="popout essential"><div class="popout-label">Without nekudot</div><div class="detail"><img src="${crop.source}" alt="Actual first verse in practice view" style="width:${1320*scale}px;height:${2868*scale}px;left:${-crop.x*scale}px;top:${-crop.y*scale}px"></div></div>`);}
if(params.has('guides')){const [x,y,w,h]=specs[placement].safe;board.insertAdjacentHTML('beforeend',`<div class="safe-guide" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`);}
window.artwork={placement,...specs[placement],device:geometry,practiceCrop:placement==='search'?crop:null};
