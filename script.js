(()=>{
const $=s=>document.getElementById(s);
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
let serverUrl='',authenticated=false,streaming=false,cW=0,cH=0;
let ruMode=false;

async function api(action,data={}){
  data.action=action;
  try{
    const r=await fetch(serverUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    return await r.json();
  }catch(e){return{action:'error',message:e.message}}
}

function ml(t,k){const e=$('loginMsg');if(!e)return;e.textContent=t||'';e.className='msg';if(k)e.classList.add(k)}

async function connect(){
  const h=$('inpHost').value.trim(),p=$('inpPass').value.trim();
  if(!h||!p){ml('Заполните все поля','er');return}
  serverUrl=h.replace(/\/$/,'')+'/api';
  ml('Подключение...','');
  const r=await api('auth',{password:p});
  if(r.action==='auth_ok'){
    authenticated=true;
    $('loginScreen').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('connDot').className='conn-dot on';
    $('connText').textContent='Онлайн';
    startStream();
    loadSysinfo();
  }else{
    ml('Неверный пароль','er');
  }
}

function disconnect(){
  authenticated=false;streaming=false;
  $('loginScreen').classList.remove('hidden');
  $('app').classList.add('hidden');
}

const canvas=$('screenCanvas'),ctx=canvas?canvas.getContext('2d'):null;

function drawFrame(b64,w,h){
  if(!ctx)return;
  const img=new Image();
  img.onload=()=>{canvas.width=w;canvas.height=h;cW=w;cH=h;ctx.drawImage(img,0,0)};
  img.src='data:image/jpeg;base64,'+b64;
}

async function screenLoop(){
  while(streaming&&authenticated){
    try{
      const r=await api('screenshot');
      if(r.image)drawFrame(r.image,r.width,r.height);
    }catch{}
    await new Promise(r=>setTimeout(r,100));
  }
}

function startStream(){
  if(streaming)return;
  streaming=true;
  screenLoop();
}

let touchDrag=false,touchStartX=0,touchStartY=0,touchStartTime=0;
let twoStartX=0,twoStartY=0;

canvas.addEventListener('touchstart',e=>{
  e.preventDefault();
  if(e.touches.length===2){
    twoStartX=(e.touches[0].clientX+e.touches[1].clientX)/2;
    twoStartY=(e.touches[0].clientY+e.touches[1].clientY)/2;
    return;
  }
  if(e.touches.length===1){
    touchStartX=e.touches[0].clientX;
    touchStartY=e.touches[0].clientY;
    touchStartTime=Date.now();
    touchDrag=true;
    const r=canvas.getBoundingClientRect();
    send({action:'mouse_move',x:e.touches[0].clientX-r.left,y:e.touches[0].clientY-r.top,cw:cW,ch:cH});
  }
},{passive:false});

canvas.addEventListener('touchmove',e=>{
  e.preventDefault();
  if(e.touches.length===2){
    const cx=(e.touches[0].clientX+e.touches[1].clientX)/2;
    const cy=(e.touches[0].clientY+e.touches[1].clientY)/2;
    const dx=(cx-twoStartX)*0.5;
    const dy=(cy-twoStartY)*0.5;
    if(Math.abs(dx)>2||Math.abs(dy)>2){
      send({action:'scroll',dx:Math.round(dx),dy:Math.round(dy)});
      twoStartX=cx;twoStartY=cy;
    }
    return;
  }
  if(e.touches.length===1&&touchDrag){
    const dx=e.touches[0].clientX-touchStartX;
    const dy=e.touches[0].clientY-touchStartY;
    if(Math.abs(dy)>15||Math.abs(dx)>15){
      touchDrag=false;
      if(Math.abs(dy)>Math.abs(dx)){
        send({action:'scroll',dx:0,dy:Math.round(dy*0.3)});
      }
      touchStartX=e.touches[0].clientX;
      touchStartY=e.touches[0].clientY;
    }else{
      const r=canvas.getBoundingClientRect();
      send({action:'mouse_move',x:e.touches[0].clientX-r.left,y:e.touches[0].clientY-r.top,cw:cW,ch:cH});
    }
  }
},{passive:false});

canvas.addEventListener('touchend',e=>{
  e.preventDefault();touchDrag=false;
  const elapsed=Date.now()-touchStartTime;
  if(elapsed<200&&e.changedTouches&&e.changedTouches.length){
    const t=e.changedTouches[0],r=canvas.getBoundingClientRect();
    send({action:'mouse_click',x:t.clientX-r.left,y:t.clientY-r.top,cw:cW,ch:cH,button:'left'});
  }
},{passive:false});

canvas.addEventListener('mousedown',e=>{if(!authenticated)return;e.preventDefault();const r=canvas.getBoundingClientRect();send({action:'mouse_click',x:e.clientX-r.left,y:e.clientY-r.top,cw:cW,ch:cH,button:e.button===2?'right':'left'})});
canvas.addEventListener('wheel',e=>{if(!authenticated)return;e.preventDefault();send({action:'scroll',dx:e.deltaX>0?3:e.deltaX<0?-3:0,dy:e.deltaY>0?3:e.deltaY<0?-3:0})},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());

function send(d){if(authenticated)api(d.action,d)}

let shiftOn=false,ruMode=false,capsOn=false;
const heldModifiers={ctrl:false,alt:false,shift:false};
const ruMap={'q':'й','w':'ц','e':'у','r':'к','t':'е','y':'н','u':'г','i':'ш','o':'щ','p':'з','a':'ф','s':'ы','d':'в','f':'а','g':'п','h':'р','j':'о','k':'л','l':'д','z':'я','x':'ч','c':'с','v':'м','b':'и','n':'т','m':'ь',',':',','.':'.',';':';',':':':','[':'х',']':'ъ','\\':'/','`':'ё','ё':'`'};

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

$('btnConnect').onclick=connect;
$('btnDisconnect').onclick=disconnect;
$('btnKeyboard').onclick=()=>$('kbOverlay').classList.toggle('show');
$('kbClose').onclick=()=>$('kbOverlay').classList.remove('show');
$('btnRu').onclick=()=>{ruMode=!ruMode;$('btnRu').textContent=ruMode?'EN':'RU';$('btnRu').classList.toggle('active',ruMode)};
$('btnCtrlAltDel').onclick=()=>{
  send({action:'key_down',key:'ctrl'});send({action:'key_down',key:'alt'});
  setTimeout(()=>{send({action:'key_press',key:'delete'})},50);
  setTimeout(()=>{send({action:'key_up',key:'ctrl'});send({action:'key_up',key:'alt'})},100);
};
$('btnHome').onclick=()=>send({action:'list_dir',path:'/'});
$('btnGo').onclick=()=>send({action:'list_dir',path:$('filePath').value});
$('btnRefresh').onclick=()=>loadSysinfo();
$('btnTermRun').onclick=async()=>{
  const c=$('termInput').value.trim();if(!c||!authenticated)return;
  $('termOutput').textContent+='$ '+c+'\n';
  const r=await api('run_cmd',{cmd:c});
  if(r.stdout)$('termOutput').textContent+=r.stdout;
  if(r.stderr)$('termOutput').textContent+=r.stderr;
  if(r.error)$('termOutput').textContent+=r.error;
  $('termOutput').textContent+='\n';
  $('termOutput').scrollTop=$('termOutput').scrollHeight;
  $('termInput').value='';
};
$('termInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('btnTermRun').click()});

async function loadSysinfo(){
  const r=await api('sysinfo');
  if(r.os){$('infoOs').textContent=r.os+' '+(r.os_version||'').substring(0,40);$('infoHost').textContent=r.hostname||'—';$('infoScreen').textContent=(r.screen_width||'?')+'x'+(r.screen_height||'?')}
  if(r.cpu_percent!=null){$('infoCpu').textContent=r.cpu_percent+'%';$('barCpu').style.width=r.cpu_percent+'%';$('barCpu').style.background=r.cpu_percent>80?'#ff3d00':'#0088cc'}
  if(r.ram_percent!=null){$('infoRam').textContent=r.ram_used_gb+'/'+r.ram_total_gb+' GB';$('barRam').style.width=r.ram_percent+'%';$('barRam').style.background=r.ram_percent>80?'#ff3d00':'#0088cc'}
  if(r.disk_percent!=null){$('infoDisk').textContent=r.disk_used_gb+'/'+r.disk_total_gb+' GB';$('barDisk').style.width=r.disk_percent+'%'}
}

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
    row.onclick=()=>{if(item.is_dir)send({action:'list_dir',path:item.path});else{}};
    el.appendChild(row);
  });
}
function fmtSize(b){if(!b)return'';if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';if(b<1073741824)return(b/1048576).toFixed(1)+' MB';return(b/1073741824).toFixed(1)+' GB'}

$('inpPass').addEventListener('keydown',e=>{if(e.key==='Enter')connect()});
})();
