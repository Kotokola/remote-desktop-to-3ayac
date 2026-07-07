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
  ml('Подключение...','');
  ws.onopen=()=>ws.send(JSON.stringify({action:'auth',password:p}));
  ws.onmessage=e=>{try{handleMsg(JSON.parse(e.data))}catch{}};
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
  if(a==='screen_frame'||a==='screenshot')drawFrame(m.image,m.width,m.height);
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
function drawFrame(b64,w,h){
  if(!ctx)return;
  const img=new Image();
  img.onload=()=>{canvas.width=w;canvas.height=h;cW=w;cH=h;ctx.drawImage(img,0,0);$('screenOverlay').classList.add('hidden')};
  img.src='data:image/jpeg;base64,'+b64;
}

// === Touch coords ===
function tCoords(e){
  const r=canvas.getBoundingClientRect();
  if(e.touches&&e.touches.length)return{x:e.touches[0].clientX-r.left,y:e.touches[0].clientY-r.top,cw:cW,ch:cH};
  return{x:e.clientX-r.left,y:e.clientY-r.top,cw:cW,ch:cH};
}

// === Canvas touch ===
let touchDrag=false;
canvas.addEventListener('touchstart',e=>{
  e.preventDefault();touchDrag=true;
  const c=tCoords(e);
  send({action:'mouse_move',...c});
  send({action:'mouse_click',...c,button:'left'});
},{passive:false});
canvas.addEventListener('touchmove',e=>{
  e.preventDefault();
  if(touchDrag)send({action:'mouse_move',...tCoords(e)});
},{passive:false});
canvas.addEventListener('touchend',e=>{
  e.preventDefault();touchDrag=false;
  if(e.changedTouches&&e.changedTouches.length){
    const t=e.changedTouches[0],r=canvas.getBoundingClientRect();
    send({action:'mouse_up',x:t.clientX-r.left,y:t.clientY-r.top,cw:cW,ch:cH,button:'left'});
  }
},{passive:false});

// === Canvas mouse ===
canvas.addEventListener('mousemove',e=>{if(connected)send({action:'mouse_move',...tCoords(e)})});
canvas.addEventListener('mousedown',e=>{if(!connected)return;e.preventDefault();send({action:'mouse_click',...tCoords(e),button:e.button===2?'right':'left'})});
canvas.addEventListener('contextmenu',e=>e.preventDefault());

// === Keyboard ===
let shiftOn=false;
function sendKey(key,pressed){
  if(key==='shift'){shiftOn=pressed}
  let k=key;
  if(shiftOn&&key.length===1&&/[a-z]/i.test(key))k=key.toUpperCase();
  else if(shiftOn){const sm={'`':'~','1':'!','2':'@','3':'#','4':'$','5':'%','6':'^','7':'&','8':'*','9':'(','0':')','-':'_','=':'+','[':'{',']':'}','\\':'|',';':':',',':'<','.':'>','/':'?'};if(sm[key])k=sm[key]}
  send({action:'key',key:k,pressed});
}

document.querySelectorAll('.kbtn').forEach(btn=>{
  const key=btn.dataset.key;if(!key)return;
  btn.addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation();btn.classList.add('pressed');sendKey(key,true)},{passive:false});
  btn.addEventListener('touchend',e=>{e.preventDefault();e.stopPropagation();btn.classList.remove('pressed');sendKey(key,false)},{passive:false});
  btn.addEventListener('touchcancel',()=>{btn.classList.remove('pressed');sendKey(key,false)});
  btn.addEventListener('click',e=>{e.preventDefault();sendKey(key,true);setTimeout(()=>sendKey(key,false),50)});
});

// === Controls ===
$('btnConnect').onclick=connect;
$('btnDisconnect').onclick=disconnect;
if($('btnKeyboard'))$('btnKeyboard').onclick=()=>$('kbOverlay').classList.toggle('show');
if($('kbClose'))$('kbClose').onclick=()=>$('kbOverlay').classList.remove('show');
if($('btnStart2'))$('btnStart2').onclick=()=>send({action:'start_screen'});
if($('btnCtrlAltDel'))$('btnCtrlAltDel').onclick=()=>{send({action:'key',key:'ctrl',pressed:true});send({action:'key',key:'alt',pressed:true});send({action:'key',key:'delete',pressed:true});setTimeout(()=>{send({action:'key',key:'delete',pressed:false});send({action:'key',key:'alt',pressed:false});send({action:'key',key:'ctrl',pressed:false})},100)};
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
