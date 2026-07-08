(()=>{
const $=s=>document.getElementById(s);
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
let ws=null,connected=false,cW=0,cH=0;

function connect(){
  const h=$('inpHost').value.trim(),p=$('inpPass').value.trim();
  if(!h||!p){ml('Заполните все поля','er');return}
  let url=h;
  if(url.startsWith('https://'))url='wss://'+url.slice(8);
  else if(url.startsWith('http://'))url='ws://'+url.slice(7);
  else if(!url.startsWith('ws://')&&!url.startsWith('wss://')){
    url=url.includes('trycloudflare.com')?'wss://'+url:'ws://'+url;
  }
  $('inpHost').value=url;
  try{ws=new WebSocket(url)}catch(e){ml('Неверный адрес','er');return}
  ws.binaryType='arraybuffer';
  ml('Подключение...','');
  ws.onopen=()=>ws.send(JSON.stringify({action:'auth',password:p}));
  ws.onmessage=e=>{
    try{
      if(e.data instanceof ArrayBuffer){
        const bytes=new Uint8Array(e.data);
        if(bytes.length<8){console.log('Кадр слишком мал');return}
        const w=(bytes[0]<<24)|(bytes[1]<<16)|(bytes[2]<<8)|bytes[3];
        const h=(bytes[4]<<24)|(bytes[5]<<16)|(bytes[6]<<8)|bytes[7];
        const jpeg=bytes.slice(8);
        let b64='';for(let i=0;i<jpeg.length;i++)b64+=String.fromCharCode(jpeg[i]);
        drawFrame(btoa(b64),w,h);
        return;
      }
      handleMsg(JSON.parse(e.data));
    }catch(err){console.error('Ошибка:',err)}
  };
  ws.onerror=()=>ml('Сервер недоступен','er');
  ws.onclose=()=>setConn(false);
}

function disconnect(){if(ws){ws.close();ws=null}setConn(false)}
function setConn(v){
  connected=v;
  $('connDot').className='conn-dot'+(v?' on':'');
  $('connText').textContent=v?'Онлайн':'Офлайн';
  if(v){$('loginScreen').classList.add('hidden');$('app').classList.remove('hidden')}
}
function ml(t,k){const e=$('loginMsg');if(!e)return;e.textContent=t||'';e.className='msg';if(k)e.classList.add(k)}
function send(d){if(ws&&ws.readyState===1)ws.send(JSON.stringify(d))}

function handleMsg(m){
  const a=m.action;
  if(a==='auth_ok'){setConn(true);send({action:'sysinfo'});send({action:'start_screen'})}
  if(a==='auth_fail')ml('Неверный пароль','er');
  if(a==='screen_frame'||a==='screenshot'){drawFrame(m.image,m.width,m.height)}
  if(a==='audio_frame')playAudio(m.data);
  if(a==='dir_list'){if(m.error){$('fileList').innerHTML='<div style="padding:20px;color:#888">'+m.error+'</div>';return}$('filePath').value=m.path;renderFiles(m.items)}
  if(a==='cmd_result'){const o=$('termOutput');if(m.stdout)o.textContent+=m.stdout;if(m.stderr)o.textContent+=m.stderr;if(m.error)o.textContent+=m.error;o.textContent+='\n';o.scrollTop=o.scrollHeight}
  if(a==='sysinfo'){
    if($('infoOs'))$('infoOs').textContent=(m.os||'')+' '+(m.os_version||'').substring(0,40);
    if($('infoHost'))$('infoHost').textContent=m.hostname||'—';
    if($('infoScreen'))$('infoScreen').textContent=(m.screen_width||'?')+'x'+(m.screen_height||'?');
    if($('infoCpu')&&m.cpu_percent!=null){$('infoCpu').textContent=m.cpu_percent+'%';$('barCpu').style.width=m.cpu_percent+'%';$('barCpu').style.background=m.cpu_percent>80?'#ff3d00':'#0088cc'}
    if($('infoRam')&&m.ram_percent!=null){$('infoRam').textContent=m.ram_used_gb+'/'+m.ram_total_gb+' GB';$('barRam').style.width=m.ram_percent+'%';$('barRam').style.background=m.ram_percent>80?'#ff3d00':'#0088cc'}
    if($('infoDisk')&&m.disk_percent!=null){$('infoDisk').textContent=m.disk_used_gb+'/'+m.disk_total_gb+' GB';$('barDisk').style.width=m.disk_percent+'%'}
  }
}

// === Screen ===
const canvas=$('screenCanvas'),ctx=canvas?canvas.getContext('2d'):null;
let audioCtx=null,audioQueue=[];

function drawFrame(b64,w,h){
  if(!ctx){console.log('Нет контекста canvas');return}
  const img=new Image();
  img.onload=()=>{
    canvas.width=w;canvas.height=h;
    cW=w;cH=h;
    ctx.drawImage(img,0,0);
    $('screenOverlay').classList.add('hidden');
    console.log('Кадр отрисован:',w+'x'+h);
  };
  img.onerror=()=>{
    console.error('Ошибка загрузки изображения, размер base64:',b64.length);
  };
  img.src='data:image/jpeg;base64,'+b64;
}

function playAudio(b64){
  try{
    if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();
    const raw=atob(b64);
    const buf=new ArrayBuffer(raw.length);
    const view=new Uint8Array(buf);
    for(let i=0;i<raw.length;i++)view[i]=raw.charCodeAt(i);
    const int16=new Int16Array(buf);
    const float32=new Float32Array(int16.length);
    for(let i=0;i<int16.length;i++)float32[i]=int16[i]/32768;
    const src=audioCtx.createBufferSource();
    const ab=audioCtx.createBuffer(1,float32.length,16000);
    ab.getChannelData(0).set(float32);
    src.buffer=ab;
    src.connect(audioCtx.destination);
    src.start();
  }catch(e){}
}

// === Touch coords ===
function tCoords(e){
  const r=canvas.getBoundingClientRect();
  if(e.touches&&e.touches.length)return{x:e.touches[0].clientX-r.left,y:e.touches[0].clientY-r.top,cw:cW,ch:cH};
  return{x:e.clientX-r.left,y:e.clientY-r.top,cw:cW,ch:cH};
}

// === Canvas touch ===
let touchDrag=false,touchStartX=0,touchStartY=0,touchStartTime=0;
let twoFingerStartX=0,twoFingerStartY=0;

canvas.addEventListener('touchstart',e=>{
  e.preventDefault();
  if(e.touches.length===2){
    // Two-finger: start horizontal scroll
    twoFingerStartX=(e.touches[0].clientX+e.touches[1].clientX)/2;
    twoFingerStartY=(e.touches[0].clientY+e.touches[1].clientY)/2;
    return;
  }
  if(e.touches.length===1){
    touchStartX=e.touches[0].clientX;
    touchStartY=e.touches[0].clientY;
    touchStartTime=Date.now();
    touchDrag=true;
    const c=tCoords(e);
    send({action:'mouse_move',...c});
  }
},{passive:false});

canvas.addEventListener('touchmove',e=>{
  e.preventDefault();
  if(e.touches.length===2){
    // Two-finger horizontal scroll
    const cx=(e.touches[0].clientX+e.touches[1].clientX)/2;
    const cy=(e.touches[0].clientY+e.touches[1].clientY)/2;
    const dx=(cx-twoFingerStartX)*0.5;
    const dy=(cy-twoFingerStartY)*0.5;
    if(Math.abs(dx)>2||Math.abs(dy)>2){
      send({action:'scroll',dx:Math.round(dx),dy:Math.round(dy)});
      twoFingerStartX=cx;
      twoFingerStartY=cy;
    }
    return;
  }
  if(e.touches.length===1&&touchDrag){
    const dx=e.touches[0].clientX-touchStartX;
    const dy=e.touches[0].clientY-touchStartY;
    // If moved more than 15px, it's a scroll
    if(Math.abs(dy)>15||Math.abs(dx)>15){
      touchDrag=false;
      // Vertical scroll
      if(Math.abs(dy)>Math.abs(dx)){
        send({action:'scroll',dx:0,dy:Math.round(dy*0.3)});
      }
      touchStartX=e.touches[0].clientX;
      touchStartY=e.touches[0].clientY;
    }else{
      send({action:'mouse_move',...tCoords(e)});
    }
  }
},{passive:false});

canvas.addEventListener('touchend',e=>{
  e.preventDefault();
  touchDrag=false;
  // If it was a short tap (<200ms) with minimal movement, it's a click
  const elapsed=Date.now()-touchStartTime;
  if(elapsed<200&&e.changedTouches&&e.changedTouches.length){
    const t=e.changedTouches[0],r=canvas.getBoundingClientRect();
    send({action:'mouse_click',x:t.clientX-r.left,y:t.clientY-r.top,cw:cW,ch:cH,button:'left'});
  }
},{passive:false});

// === Canvas mouse ===
canvas.addEventListener('mousemove',e=>{if(connected)send({action:'mouse_move',...tCoords(e)})});
canvas.addEventListener('mousedown',e=>{if(!connected)return;e.preventDefault();send({action:'mouse_click',...tCoords(e),button:e.button===2?'right':'left'})});
canvas.addEventListener('wheel',e=>{if(!connected)return;e.preventDefault();send({action:'scroll',dx:e.deltaX>0?3:e.deltaX<0?-3:0,dy:e.deltaY>0?3:e.deltaY<0?-3:0})},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());

// === Keyboard — sticky modifiers ===
let shiftOn=false, ruMode=false, capsOn=false;
const heldModifiers={ctrl:false,alt:false,shift:false};
const ruMap={'q':'й','w':'ц','e':'у','r':'к','t':'е','y':'н','u':'г','i':'ш','o':'щ','p':'з','a':'ф','s':'ы','d':'в','f':'а','g':'п','h':'р','j':'о','k':'л','l':'д','z':'я','x':'ч','c':'с','v':'м','b':'и','n':'т','m':'ь',
',':',','.':'.',';':';',':':':','[':'х',']':'ъ','\\':'/',
'`':'ё','ё':'`'};

function updateModifierUI(){
  ['kbCtrl1','kbCtrl2','kbCtrl3'].forEach(id=>{const e=$(id);if(e)e.classList.toggle('active',heldModifiers.ctrl)});
  ['kbAlt1','kbAlt2','kbAlt3'].forEach(id=>{const e=$(id);if(e)e.classList.toggle('active',heldModifiers.alt)});
  ['kbShift1','kbShift2','kbShift3'].forEach(id=>{const e=$(id);if(e)e.classList.toggle('active',heldModifiers.shift)});
}

function releaseModifier(mod){
  if(heldModifiers[mod]){
    heldModifiers[mod]=false;
    send({action:'key_up',key:mod});
    updateModifierUI();
  }
}

function toggleModifier(mod){
  if(heldModifiers[mod]){
    releaseModifier(mod);
  }else{
    heldModifiers[mod]=true;
    send({action:'key_down',key:mod});
    updateModifierUI();
  }
}

function sendKey(key){
  if(key==='ctrl'){toggleModifier('ctrl');return}
  if(key==='alt'){ruMode=!ruMode;$('btnRu').textContent=ruMode?'EN':'RU';$('btnRu').classList.toggle('active',ruMode);return}
  if(key==='shift'){toggleModifier('shift');return}
  if(key==='capslock'){capsOn=!capsOn;return}
  if(key==='escape'||key==='tab'||key==='backspace'||key==='enter'||key==='delete'){
    send({action:'key_press',key:key});return;
  }
  let k=key;
  if(ruMode&&key.length===1&&/[a-z]/i.test(k)){
    k=ruMap[key.toLowerCase()]||key;
    if(heldModifiers.shift||capsOn)k=k.toUpperCase();
  }else if(heldModifiers.shift&&key.length===1&&/[a-z]/i.test(k)){
    k=capsOn?k.toLowerCase():k.toUpperCase();
  }else if(heldModifiers.shift){
    const sm={'`':'~','1':'!','2':'@','3':'#','4':'$','5':'%','6':'^','7':'&','8':'*','9':'(','0':')','-':'_','=':'+','[':'{',']':'}','\\':'|',';':':',',':'<','.':'>','/':'?'};if(sm[key])k=sm[key];
  }
  send({action:'key_press',key:k});
}

document.querySelectorAll('.kbtn').forEach(btn=>{
  const key=btn.dataset.key;if(!key)return;
  btn.addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation();btn.classList.add('pressed');sendKey(key)},{passive:false});
  btn.addEventListener('touchend',e=>{e.preventDefault();e.stopPropagation();btn.classList.remove('pressed')},{passive:false});
  btn.addEventListener('touchcancel',()=>{btn.classList.remove('pressed')});
  btn.addEventListener('click',e=>{e.preventDefault();sendKey(key)});
});

// === Controls ===
$('btnConnect').onclick=connect;
$('btnDisconnect').onclick=disconnect;
if($('btnKeyboard'))$('btnKeyboard').onclick=()=>$('kbOverlay').classList.toggle('show');
if($('kbClose'))$('kbClose').onclick=()=>$('kbOverlay').classList.remove('show');
if($('btnRu'))$('btnRu').onclick=()=>{ruMode=!ruMode;$('btnRu').textContent=ruMode?'EN':'RU';$('btnRu').classList.toggle('active',ruMode)};
if($('btnStart2'))$('btnStart2').onclick=()=>send({action:'start_screen'});
if($('btnCtrlAltDel'))$('btnCtrlAltDel').onclick=()=>{
  send({action:'key_down',key:'ctrl'});send({action:'key_down',key:'alt'});
  setTimeout(()=>{send({action:'key_press',key:'delete'})},50);
  setTimeout(()=>{send({action:'key_up',key:'ctrl'});send({action:'key_up',key:'alt'})},100);
};
if($('btnHome'))$('btnHome').onclick=()=>send({action:'list_dir',path:'/'});
if($('btnGo'))$('btnGo').onclick=()=>send({action:'list_dir',path:$('filePath').value});
if($('btnRefresh'))$('btnRefresh').onclick=()=>send({action:'sysinfo'});
if($('termInput'))$('termInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&connected){const c=$('termInput').value.trim();if(!c)return;$('termOutput').textContent+='$ '+c+'\n';send({action:'run_cmd',cmd:c});$('termInput').value=''}});
if($('btnTermRun'))$('btnTermRun').onclick=()=>{const c=$('termInput').value.trim();if(!c||!connected)return;$('termOutput').textContent+='$ '+c+'\n';send({action:'run_cmd',cmd:c});$('termInput').value=''};

// === Tabs ===
document.querySelectorAll('.bbtn[data-tab]').forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll('.bbtn[data-tab]').forEach(x=>x.classList.remove('act'));
    document.querySelectorAll('.panel').forEach(x=>x.classList.remove('act'));
    document.querySelector('.screen-view').classList.remove('act');
    b.classList.add('act');
    const t=b.dataset.tab;
    if(t==='screen'){document.querySelector('.screen-view').classList.add('act');return}
    const p=$('panel'+t[0].toUpperCase()+t.slice(1));
    if(p)p.classList.add('act');
  };
});
document.querySelectorAll('.pback').forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll('.panel').forEach(x=>x.classList.remove('act'));
    document.querySelector('.screen-view').classList.add('act');
    document.querySelectorAll('.bbtn[data-tab]').forEach(x=>x.classList.remove('act'));
    document.querySelector('.bbtn[data-tab="screen"]').classList.add('act');
  };
});

function renderFiles(items){
  const el=$('fileList');el.innerHTML='';
  items.forEach(item=>{
    const row=document.createElement('div');row.className='file-item';
    row.innerHTML='<i class="fa-solid '+(item.is_dir?'fa-folder':'fa-file')+'"></i><span class="file-name">'+esc(item.name)+'</span><span class="file-size">'+fmtSize(item.size)+'</span>';
    row.onclick=()=>{if(item.is_dir)send({action:'list_dir',path:item.path});else send({action:'read_file',path:item.path})};
    el.appendChild(row);
  });
}
function fmtSize(b){if(!b)return'';if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';if(b<1073741824)return(b/1048576).toFixed(1)+' MB';return(b/1073741824).toFixed(1)+' GB'}

$('inpPass').addEventListener('keydown',e=>{if(e.key==='Enter')connect()});
})();
