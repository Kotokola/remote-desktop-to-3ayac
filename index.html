(()=>{
  const $=s=>document.getElementById(s);
  let ws=null,connected=false,streaming=false,fc=0,lt=0;
  let scrollMode=false, activeKeys=new Set();

  const tg=()=>{try{return window.Telegram?.WebApp||null}catch{return null}};

  // === Connection ===
  function connect(){
    const h=$('inpHost').value.trim(),p=$('inpPass').value.trim();
    if(!h||!p){ml('Заполните все поля','er');return}

    // Auto-fix address format
    let url=h;
    if(url.startsWith('https://'))url='wss://'+url.slice(8);
    else if(url.startsWith('http://'))url='ws://'+url.slice(7);
    else if(!url.startsWith('ws://')&&!url.startsWith('wss://')){
      if(url.includes('trycloudflare.com'))url='wss://'+url;
      else url='ws://'+url;
    }
    $('inpHost').value=url;

    try{ws=new WebSocket(url)}catch(e){ml('Неверный формат адреса. Пример: ws://192.168.1.100:8765','er');return}
    ml('Подключение...','');
    ws.onopen=()=>ws.send(JSON.stringify({action:'auth',password:p}));
    ws.onmessage=e=>handleMsg(JSON.parse(e.data));
    ws.onerror=()=>ml('Сервер недоступен. Проверь:\n1. Сервер запущен\n2. Тот же WiFi\n3. Адрес верный','er');
    ws.onclose=()=>setConn(false);
  }
  function disconnect(){if(ws){ws.close();ws=null}setConn(false);streaming=false}
  function setConn(v){
    connected=v;
    $('connDot').className='conn-dot'+(v?' on':'');
    $('connText').textContent=v?'Онлайн':'Офлайн';
    if(v){$('loginScreen').classList.add('hidden');$('app').classList.remove('hidden')}
  }
  function ml(t,k){const e=$('loginMsg');if(!e)return;e.textContent=t||'';e.className='msg';if(k)e.classList.add(k)}
  function send(d){if(ws&&ws.readyState===1)ws.send(JSON.stringify(d))}

  // === Messages ===
  function handleMsg(m){
    if(m.action==='auth_ok'){setConn(true);send({action:'sysinfo'});send({action:'start_screen'})}
    if(m.action==='auth_fail')ml('Неверный пароль','er');
    if(m.action==='screen_frame'||m.action==='screenshot')drawFrame(m.image,m.width,m.height);
    if(m.action==='dir_list'){if(m.error){$('fileList').innerHTML='<div class="dim" style="padding:20px">'+m.error+'</div>';return}$('filePath').value=m.path;renderFiles(m.items)}
    if(m.action==='cmd_result'){const o=$('termOutput');if(m.stdout)o.textContent+=m.stdout;if(m.stderr)o.textContent+=m.stderr;if(m.error)o.textContent+=m.error;o.textContent+='\n';o.scrollTop=o.scrollHeight}
    if(m.action==='sysinfo'){
      $('infoOs').textContent=(m.os||'')+' '+(m.os_version||'').substring(0,40);
      $('infoHost').textContent=m.hostname||'—';
      $('infoScreen').textContent=(m.screen_width||'?')+'x'+(m.screen_height||'?');
      if(m.cpu_percent!=null){$('infoCpu').textContent=m.cpu_percent+'%';$('barCpu').style.width=m.cpu_percent+'%';$('barCpu').style.background=m.cpu_percent>80?'var(--er)':'var(--p)'}
      if(m.ram_percent!=null){$('infoRam').textContent=m.ram_used_gb+'/'+m.ram_total_gb+' GB';$('barRam').style.width=m.ram_percent+'%';$('barRam').style.background=m.ram_percent>80?'var(--er)':'var(--p)'}
      if(m.disk_percent!=null){$('infoDisk').textContent=m.disk_used_gb+'/'+m.disk_total_gb+' GB';$('barDisk').style.width=m.disk_percent+'%'}
    }
  }

  // === Screen ===
  const canvas=$('screenCanvas'),ctx=canvas.getContext('2d');
  let cW=0,cH=0;
  function drawFrame(b64,w,h){
    const img=new Image();
    img.onload=()=>{canvas.width=w;canvas.height=h;cW=w;cH=h;ctx.drawImage(img,0,0);$('screenOverlay').classList.add('hidden')};
    img.src='data:image/jpeg;base64,'+b64;
    fc++;const n=Date.now();if(n-lt>=1000){lt=n;fc=0}
  }

  // === Touch/Mouse on canvas ===
  function coords(e){
    const r=canvas.getBoundingClientRect();
    let cx,cy;
    if(e.touches&&e.touches.length){
      cx=e.touches[0].clientX-r.left;
      cy=e.touches[0].clientY-r.top;
    }else{
      cx=e.clientX-r.left;
      cy=e.clientY-r.top;
    }
    return{x:cx,y:cy,cw:cW,ch:cH};
  }

  let lastTap=0, tapTimeout=null, pinchDist=0;

  // Mouse events (desktop)
  canvas.addEventListener('mousemove',e=>{if(connected&&!scrollMode)send({action:'mouse_move',...coords(e)})});
  canvas.addEventListener('mousedown',e=>{if(!connected)return;e.preventDefault();send({action:'mouse_down',...coords(e),button:e.button===2?'right':'left'})});
  canvas.addEventListener('mouseup',e=>{if(!connected)return;send({action:'mouse_up',...coords(e),button:e.button===2?'right':'left'})});
  canvas.addEventListener('wheel',e=>{if(!connected)return;e.preventDefault();send({action:'mouse_scroll',delta:e.deltaY>0?-1:1})},{passive:false});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());

  // Touch events (mobile)
  canvas.addEventListener('touchstart',e=>{
    if(!connected)return;
    e.preventDefault();

    // Two-finger scroll mode
    if(e.touches.length===2){
      scrollMode=true;
      $('btnScrollMode').classList.add('active');
      const dx=e.touches[0].clientX-e.touches[1].clientX;
      const dy=e.touches[0].clientY-e.touches[1].clientY;
      pinchDist=Math.sqrt(dx*dx+dy*dy);
      return;
    }

    // Single tap — detect double-tap for right click
    const now=Date.now();
    if(now-lastTap<300){
      // Double tap = right click
      clearTimeout(tapTimeout);
      send({action:'mouse_click',...coords(e),button:'right'});
      lastTap=0;
      return;
    }
    lastTap=now;

    // Long press = right click (after 500ms)
    const c=coords(e);
    tapTimeout=setTimeout(()=>{
      send({action:'mouse_click',...c,button:'right'});
      tapTimeout=null;
    },500);

    // Start drag
    send({action:'mouse_down',...c,button:'left'});
  },{passive:false});

  canvas.addEventListener('touchmove',e=>{
    if(!connected)return;
    e.preventDefault();

    // Two-finger scroll
    if(scrollMode&&e.touches.length===2){
      const dy=e.touches[0].clientY-e.touches[1].clientY;
      const delta=dy>0?1:-1;
      send({action:'mouse_scroll',delta});
      return;
    }

    // Single finger drag
    if(tapTimeout){clearTimeout(tapTimeout);tapTimeout=null}
    send({action:'mouse_move',...coords(e)});
  },{passive:false});

  canvas.addEventListener('touchend',e=>{
    if(!connected)return;
    clearTimeout(tapTimeout);tapTimeout=null;
    if(scrollMode&&e.touches.length<2){scrollMode=false;$('btnScrollMode').classList.remove('active')}
    if(e.touches.length===0){
      send({action:'mouse_up',x:0,y:0,cw:cW,ch:cH,button:'left'});
    }
  });

  // === Keyboard ===
  const keyMap={'Enter':'enter','Backspace':'backspace','Tab':'tab','Escape':'escape','Delete':'delete',
    'ArrowUp':'up','ArrowDown':'down','ArrowLeft':'left','ArrowRight':'right',
    ' ':'space','Control':'ctrl','Alt':'alt','Shift':'shift','Meta':'win'};

  document.addEventListener('keydown',e=>{
    if(!connected||e.target.tagName==='INPUT')return;
    e.preventDefault();
    const k=keyMap[e.key]||e.key.toLowerCase();
    if(!activeKeys.has(k)){activeKeys.add(k);send({action:'key',key:k,pressed:true})}
  });
  document.addEventListener('keyup',e=>{
    if(!connected||e.target.tagName==='INPUT')return;
    const k=keyMap[e.key]||e.key.toLowerCase();
    activeKeys.delete(k);
    send({action:'key',key:k,pressed:false});
  });

  // === Virtual Keyboard ===
  let shiftOn=false, ctrlOn=false, altOn=false, winOn=false;

  function toggleKB(){$('kbOverlay').classList.toggle('show')}
  function sendKey(key,pressed){
    // Handle modifier states
    if(key==='shift'){shiftOn=pressed;if(!pressed)$('kbOverlay').querySelectorAll('.kbtn').forEach(b=>{if(b.dataset.key==='shift')b.classList.remove('pressed')});else $('kbOverlay').querySelectorAll('[data-key="shift"]').forEach(b=>b.classList.add('pressed'))}
    if(key==='ctrl'){ctrlOn=pressed;if(pressed)$('kbOverlay').querySelectorAll('[data-key="ctrl"]').forEach(b=>b.classList.add('pressed'));else $('kbOverlay').querySelectorAll('[data-key="ctrl"]').forEach(b=>b.classList.remove('pressed'))}
    if(key==='alt'){altOn=pressed;if(pressed)$('kbOverlay').querySelectorAll('[data-key="alt"]').forEach(b=>b.classList.add('pressed'));else $('kbOverlay').querySelectorAll('[data-key="alt"]').forEach(b=>b.classList.remove('pressed'))}
    if(key==='win'){winOn=pressed;if(pressed)$('kbOverlay').querySelectorAll('[data-key="win"]').forEach(b=>b.classList.add('pressed'));else $('kbOverlay').querySelectorAll('[data-key="win"]').forEach(b=>b.classList.remove('pressed'))}
    if(key==='capslock'&&pressed){shiftOn=!shiftOn;if(shiftOn)$('kbOverlay').querySelectorAll('[data-key="shift"]').forEach(b=>b.classList.add('pressed'));else $('kbOverlay').querySelectorAll('[data-key="shift"]').forEach(b=>b.classList.remove('pressed'))}

    // Apply shift for letters
    let finalKey=key;
    if(shiftOn&&key.length===1&&/[a-z]/i.test(key)){
      finalKey=key.toUpperCase();
    }else if(shiftOn){
      const shiftMap={'`':'~','1':'!','2':'@','3':'#','4':'$','5':'%','6':'^','7':'&','8':'*','9':'(','0':')','-':'_','=':'+','[':'{',']':'}','\\':'|',';':':',',':'<','.':'>','/':'?'};
      if(shiftMap[key])finalKey=shiftMap[key];
    }

    send({action:'key',key:finalKey,pressed});
  }

  document.querySelectorAll('.kbtn').forEach(btn=>{
    const key=btn.dataset.key;
    if(!key)return;

    // Touch events for keyboard buttons
    btn.addEventListener('touchstart',e=>{
      e.preventDefault();e.stopPropagation();
      btn.classList.add('pressed');
      sendKey(key,true);
    },{passive:false});

    btn.addEventListener('touchend',e=>{
      e.preventDefault();e.stopPropagation();
      btn.classList.remove('pressed');
      sendKey(key,false);
    },{passive:false});

    btn.addEventListener('touchcancel',e=>{
      btn.classList.remove('pressed');
      sendKey(key,false);
    });
  });

  // === Tabs ===
  document.querySelectorAll('.bbtn[data-tab]').forEach(btn=>{
    btn.onclick=()=>{
      document.querySelectorAll('.bbtn[data-tab]').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
      document.querySelector('.screen-view').classList.remove('active');
      btn.classList.add('active');
      const tab=btn.dataset.tab;
      if(tab==='screen'){document.querySelector('.screen-view').classList.add('active');return}
      const panel=$('panel'+tab.charAt(0).toUpperCase()+tab.slice(1));
      if(panel)panel.classList.add('active');
    };
  });

  document.querySelectorAll('.pback').forEach(btn=>{
    btn.onclick=()=>{
      document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
      document.querySelector('.screen-view').classList.add('active');
      document.querySelectorAll('.bbtn[data-tab]').forEach(b=>b.classList.remove('active'));
      document.querySelector('.bbtn[data-tab="screen"]').classList.add('active');
    };
  });

  // === Controls ===
  $('btnConnect').onclick=connect;
  $('btnDisconnect').onclick=disconnect;
  $('btnStart2').onclick=()=>{streaming=true;send({action:'start_screen'})};
  $('btnKeyboard').onclick=toggleKB;
  $('kbClose').onclick=toggleKB;
  $('btnScrollMode').onclick=()=>{scrollMode=!scrollMode;$('btnScrollMode').classList.toggle('active',scrollMode)};
  $('btnCtrlAltDel').onclick=()=>{send({action:'key',key:'ctrl',pressed:true});send({action:'key',key:'alt',pressed:true});send({action:'key',key:'delete',pressed:true});setTimeout(()=>{send({action:'key',key:'delete',pressed:false});send({action:'key',key:'alt',pressed:false});send({action:'key',key:'ctrl',pressed:false})},100)};
  $('btnHome').onclick=()=>send({action:'list_dir',path:navigator.platform.includes('Win')?'C:\\':"/"});
  $('btnGo').onclick=()=>send({action:'list_dir',path:$('filePath').value});
  $('btnRefresh').onclick=()=>send({action:'sysinfo'});
  $('termInput').addEventListener('keydown',e=>{
    if(e.key==='Enter'&&connected){
      const c=$('termInput').value.trim();if(!c)return;
      $('termOutput').textContent+='$ '+c+'\n';
      send({action:'run_cmd',cmd:c});$('termInput').value='';
    }
  });
  $('btnTermRun').onclick=()=>{
    const c=$('termInput').value.trim();if(!c||!connected)return;
    $('termOutput').textContent+='$ '+c+'\n';
    send({action:'run_cmd',cmd:c});$('termInput').value='';
  };

  // === Files ===
  function renderFiles(items){
    const el=$('fileList');el.innerHTML='';
    items.forEach(item=>{
      const row=document.createElement('div');row.className='file-item';
      const icon=item.is_dir?'fa-folder':'fa-file';
      const size=item.is_dir?'':fmtSize(item.size);
      row.innerHTML=`<i class="fa-solid ${icon}"></i><span class="file-name">${esc(item.name)}</span><span class="file-size">${size}</span>`;
      row.onclick=()=>{
        if(item.is_dir)send({action:'list_dir',path:item.path});
        else send({action:'read_file',path:item.path});
      };
      el.appendChild(row);
    });
  }
  function fmtSize(b){if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';if(b<1073741824)return(b/1048576).toFixed(1)+' MB';return(b/1073741824).toFixed(1)+' GB'}
  function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

  // === Init ===
  $('inpPass').addEventListener('keydown',e=>{if(e.key==='Enter')connect()});

  // Telegram WebApp
  const a=tg();
  if(a){try{a.expand()}catch{}try{a.ready()}catch{}}
})();
