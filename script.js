(()=>{
const $=s=>document.getElementById(s);
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
let serverUrl='',authed=false,streaming=false,cW=0,cH=0;

async function api(action,d){
  d.action=action;
  try{const r=await fetch(serverUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});return await r.json()}
  catch(e){return{action:'error',message:e.message}}
}
function ml(t,k){const e=$('loginMsg');if(!e)return;e.textContent=t||'';e.className='ms';if(k)e.classList.add(k)}

// === Connect ===
async function connect(){
  const h=$('inpHost').value.trim(),p=$('inpPass').value.trim();
  if(!h||!p){ml('Заполните все поля','er');return}
  serverUrl=h.replace(/\/$/,'')+'/api';
  ml('Подключение...','');
  const r=await api('auth',{password:p});
  if(r.action==='auth_ok'){
    authed=true;$('loginScreen').classList.add('hidden');$('app').classList.remove('hidden');
    startStream();loadSysinfo();
  }else{ml('Неверный пароль','er')}
}

// === Screen ===
const canvas=$('screenCanvas'),ctx=canvas?canvas.getContext('2d'):null;
function drawFrame(b64,w,h){
  if(!ctx)return;
  const img=new Image();
  img.onload=()=>{canvas.width=w;canvas.height=h;cW=w;cH=h;ctx.drawImage(img,0,0)};
  img.src='data:image/jpeg;base64,'+b64;
}
async function screenLoop(){
  while(streaming&&authed){
    try{const r=await api('screenshot');if(r.image)drawFrame(r.image,r.width,r.height)}catch{}
    await new Promise(r=>setTimeout(r,100));
  }
}
function startStream(){if(streaming)return;streaming=true;screenLoop()}

// === Touch ===
let touchDrag=false,touchSX=0,touchSY=0,touchST=0;
canvas.addEventListener('touchstart',e=>{
  e.preventDefault();
  if(e.touches.length===1){touchSX=e.touches[0].clientX;touchSY=e.touches[0].clientY;touchST=Date.now();touchDrag=true;
    const r=canvas.getBoundingClientRect();api('mouse_move',{x:e.touches[0].clientX-r.left,y:e.touches[0].clientY-r.top,cw:cW,ch:cH})}
},{passive:false});
canvas.addEventListener('touchmove',e=>{
  e.preventDefault();
  if(e.touches.length===1&&touchDrag){
    const dy=e.touches[0].clientY-touchSY;
    if(Math.abs(dy)>15){touchDrag=false;api('scroll',{dx:0,dy:Math.round(dy*0.3)});touchSY=e.touches[0].clientY}
    else{const r=canvas.getBoundingClientRect();api('mouse_move',{x:e.touches[0].clientX-r.left,y:e.touches[0].clientY-r.top,cw:cW,ch:cH})}
  }
},{passive:false});
canvas.addEventListener('touchend',e=>{
  e.preventDefault();touchDrag=false;
  if(Date.now()-touchST<200&&e.changedTouches&&e.changedTouches.length){
    const t=e.changedTouches[0],r=canvas.getBoundingClientRect();
    api('mouse_click',{x:t.clientX-r.left,y:t.clientY-r.top,cw:cW,ch:cH,button:'left'});
  }
},{passive:false});

// === Mouse ===
canvas.addEventListener('mousedown',e=>{if(!authed)return;e.preventDefault();const r=canvas.getBoundingClientRect();api('mouse_click',{x:e.clientX-r.left,y:e.clientY-r.top,cw:cW,ch:cH,button:e.button===2?'right':'left'})});
canvas.addEventListener('wheel',e=>{if(!authed)return;e.preventDefault();api('scroll',{dx:e.deltaX>0?3:e.deltaX<0?-3:0,dy:e.deltaY>0?3:e.deltaY<0?-3:0})},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());

// === Physical Keyboard ===
const ruMap={'q':'й','w':'ц','e':'у','r':'к','t':'е','y':'н','u':'г','i':'ш','o':'щ','p':'з','a':'ф','s':'ы','d':'в','f':'а','g':'п','h':'р','j':'о','k':'л','l':'д','z':'я','x':'ч','c':'с','v':'м','b':'и','n':'т','m':'ь','`':'ё','ё':'`'};
const shiftMap={'`':'~','1':'!','2':'@','3':'#','4':'$','5':'%','6':'^','7':'&','8':'*','9':'(','0':')','-':'_','=':'+','[':'{',']':'}','\\':'|',';':':',',':'<','.':'>','/':'?'};
let ruMode=false;

document.addEventListener('keydown',e=>{
  if(!authed||e.target.tagName==='INPUT')return;
  e.preventDefault();
  let key=e.key;
  if(key==='Shift'||key==='Control'||key==='Alt'||key==='Meta')return;
  if(key.length===1&&/[a-z]/i.test(key)){key=ruMode?(ruMap[key.toLowerCase()]||key):key}
  else if(key.length===1){const sm={'`':'~','1':'!','2':'@','3':'#','4':'$','5':'%','6':'^','7':'&','8':'*','9':'(','0':')','-':'_','=':'+','[':'{',']':'}','\\':'|',';':':',',':'<','.':'>','/':'?'};if(sm[key])key=sm[key]}
  api('key_press',{key});
});

// === Virtual Keyboard ===
const kbRuMap={'q':'й','w':'ц','e':'у','r':'к','t':'е','y':'н','u':'г','i':'ш','o':'щ','p':'з','a':'ф','s':'ы','d':'в','f':'а','g':'п','h':'р','j':'о','k':'л','l':'д','z':'я','x':'ч','c':'с','v':'м','b':'и','n':'т','m':'ь','`':'ё','ё':'`'};
let kbRuMode=false;
function kbSendKey(key){
  if(key==='alt'){kbRuMode=!kbRuMode;const b=$('btnRu');if(b){b.textContent=kbRuMode?'EN':'RU';b.classList.toggle('active',kbRuMode)}return}
  let k=key;
  if(kbRuMode&&key.length===1&&/[a-z]/i.test(k)){k=kbRuMap[key.toLowerCase()]||key}
  api('key_press',{key:k});
}
document.querySelectorAll('.kbtn').forEach(btn=>{
  const key=btn.dataset.key;if(!key)return;
  btn.addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation();btn.classList.add('pressed');kbSendKey(key)},{passive:false});
  btn.addEventListener('touchend',e=>{e.preventDefault();e.stopPropagation();btn.classList.remove('pressed')},{passive:false});
  btn.addEventListener('touchcancel',()=>btn.classList.remove('pressed'));
  btn.addEventListener('click',e=>{e.preventDefault();kbSendKey(key)});
});

// === Controls ===
$('btnConnect').onclick=connect;
if($('btnKeyboard'))$('btnKeyboard').onclick=()=>$('kbOverlay').classList.toggle('show');
if($('kbClose'))$('kbClose').onclick=()=>$('kbOverlay').classList.remove('show');
if($('btnStart2'))$('btnStart2').onclick=()=>startStream();
if($('btnCtrlAltDel'))$('btnCtrlAltDel').onclick=()=>{api('key_press',{key:'ctrl'});api('key_press',{key:'alt'});api('key_press',{key:'delete'})};
if($('btnHome'))$('btnHome').onclick=()=>api('list_dir',{path:'/'});
if($('btnGo'))$('btnGo').onclick=()=>api('list_dir',{path:$('filePath').value});
if($('btnRefresh'))$('btnRefresh').onclick=()=>loadSysinfo();
if($('termInput'))$('termInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&authed){const c=$('termInput').value.trim();if(!c)return;$('termOutput').textContent+='$ '+c+'\n';api('run_cmd',{cmd:c}).then(r=>{if(r.stdout)$('termOutput').textContent+=r.stdout;if(r.stderr)$('termOutput').textContent+=r.stderr;if(r.error)$('termOutput').textContent+=r.error;$('termOutput').textContent+='\n';$('termOutput').scrollTop=$('termOutput').scrollHeight});$('termInput').value=''}});
if($('btnTermRun'))$('btnTermRun').onclick=()=>{const c=$('termInput').value.trim();if(!c||!authed)return;$('termOutput').textContent+='$ '+c+'\n';api('run_cmd',{cmd:c}).then(r=>{if(r.stdout)$('termOutput').textContent+=r.stdout;if(r.stderr)$('termOutput').textContent+=r.stderr;if(r.error)$('termOutput').textContent+=r.error;$('termOutput').textContent+='\n';$('termOutput').scrollTop=$('termOutput').scrollHeight});$('termInput').value=''};

async function loadSysinfo(){const r=await api('sysinfo');if(r.os){$('infoOs').textContent=r.os+' '+(r.os_version||'').substring(0,40);$('infoHost').textContent=r.hostname||'—';$('infoScreen').textContent=(r.screen_width||'?')+'x'+(r.screen_height||'?');if(r.cpu_percent!=null){$('infoCpu').textContent=r.cpu_percent+'%';$('barCpu').style.width=r.cpu_percent+'%';$('barCpu').style.background=r.cpu_percent>80?'#ff3d00':'#0088cc'}if(r.ram_percent!=null){$('infoRam').textContent=r.ram_used_gb+'/'+r.ram_total_gb+' GB';$('barRam').style.width=r.ram_percent+'%';$('barRam').style.background=r.ram_percent>80?'#ff3d00':'#0088cc'}if(r.disk_percent!=null){$('infoDisk').textContent=r.disk_used_gb+'/'+r.disk_total_gb+' GB';$('barDisk').style.width=r.disk_percent+'%'}}
function renderFiles(items){const el=$('fileList');el.innerHTML='';items.forEach(item=>{const row=document.createElement('div');row.className='file-item';row.innerHTML='<i class="fa-solid '+(item.is_dir?'fa-folder':'fa-file')+'"></i><span class="file-name">'+esc(item.name)+'</span><span class="file-size">'+fmtSize(item.size)+'</span>';row.onclick=()=>{if(item.is_dir)api('list_dir',{path:item.path})};el.appendChild(row)})}
function fmtSize(b){if(!b)return'';if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(1)+' MB'}

// === Tabs ===
document.querySelectorAll('.bbtn[data-tab]').forEach(b=>{b.onclick=()=>{document.querySelectorAll('.bbtn[data-tab]').forEach(x=>x.classList.remove('act'));document.querySelectorAll('.panel').forEach(x=>x.classList.remove('act'));document.querySelector('.screen-view').classList.remove('act');b.classList.add('act');const t=b.dataset.tab;if(t==='screen'){document.querySelector('.screen-view').classList.add('act');return}const p=$('panel'+t[0].toUpperCase()+t.slice(1));if(p)p.classList.add('act')}});
document.querySelectorAll('.pback').forEach(b=>{b.onclick=()=>{document.querySelectorAll('.panel').forEach(x=>x.classList.remove('act'));document.querySelector('.screen-view').classList.add('act');document.querySelectorAll('.bbtn[data-tab]').forEach(x=>x.classList.remove('act'));document.querySelector('.bbtn[data-tab="screen"]').classList.add('act')}});

$('inpPass').addEventListener('keydown',e=>{if(e.key==='Enter')connect()});
})();
