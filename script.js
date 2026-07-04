(() => {
  const $=s=>document.getElementById(s);
  let ws=null, connected=false, streaming=false, frameCount=0, lastFpsTime=0;

  // ===== Connection =====
  function connect(){
    const host=$('inpHost').value.trim();
    const pass=$('inpPass').value.trim();
    if(!host||!pass){msg('loginMsg','Заполните все поля','er');return}

    try{ws=new WebSocket(host)}catch(e){msg('loginMsg','Неверный адрес','er');return}

    ws.onopen=()=>{
      ws.send(JSON.stringify({action:'auth',password:pass}));
    };

    ws.onmessage=(e)=>{
      const m=JSON.parse(e.data);
      handleMsg(m);
    };

    ws.onerror=()=>{msg('loginMsg','Ошибка подключения','er')};
    ws.onclose=()=>{setConnected(false)};
  }

  function disconnect(){
    if(ws){ws.close();ws=null}
    setConnected(false);
    streaming=false;
  }

  function setConnected(v){
    connected=v;
    $('connDot').className='conn-dot'+(v?' on':'');
    $('connText').textContent=v?'Подключено':'Отключено';
    if(v){$('loginScreen').classList.add('hidden');$('app').classList.remove('hidden')}
  }

  function msg(id,t,k){const e=$(id);if(!e)return;e.textContent=t||'';e.className='msg';if(k)e.classList.add(k)}
  function send(d){if(ws&&ws.readyState===1)ws.send(JSON.stringify(d))}

  // ===== Message handler =====
  function handleMsg(m){
    if(m.action==='auth_ok'){setConnected(true);send({action:'sysinfo'})}
    if(m.action==='auth_fail'){msg('loginMsg','Неверный пароль','er')}
    if(m.action==='error'){console.error(m.message)}

    // Screen
    if(m.action==='screen_frame'||m.action==='screenshot'){
      drawFrame(m.image,m.width,m.height);
      frameCount++;
      const now=Date.now();
      if(now-lastFpsTime>=1000){
        $('fpsCounter').textContent=frameCount+' FPS';
        frameCount=0;lastFpsTime=now;
      }
    }

    // Files
    if(m.action==='dir_list'){
      if(m.error){$('fileList').innerHTML='<div class="dim" style="padding:20px">'+m.error+'</div>';return}
      $('filePath').value=m.path;
      renderFiles(m.items,m.path);
    }

    // Terminal
    if(m.action==='cmd_result'){
      const out=$('termOutput');
      if(m.stdout)out.textContent+=m.stdout;
      if(m.stderr)out.textContent+='\x1b[31m'+m.stderr+'\x1b[0m';
      if(m.error)out.textContent+='\x1b[31m'+m.error+'\x1b[0m';
      out.textContent+='\n';
      out.scrollTop=out.scrollHeight;
    }

    // Sysinfo
    if(m.action==='sysinfo'){
      $('infoOs').textContent=(m.os||'')+' '+(m.os_version||'').substring(0,30);
      $('infoHost').textContent=m.hostname||'—';
      $('infoScreen').textContent=(m.screen_width||'?')+'x'+(m.screen_height||'?');
      if(m.cpu_percent!==undefined){$('infoCpu').textContent=m.cpu_percent+'%';$('barCpu').style.width=m.cpu_percent+'%';$('barCpu').style.background=m.cpu_percent>80?'var(--er)':'var(--p)'}
      if(m.ram_percent!==undefined){$('infoRam').textContent=m.ram_used_gb+'/'+m.ram_total_gb+' GB';$('barRam').style.width=m.ram_percent+'%';$('barRam').style.background=m.ram_percent>80?'var(--er)':'var(--p)'}
      if(m.disk_percent!==undefined){$('infoDisk').textContent=m.disk_used_gb+'/'+m.disk_total_gb+' GB';$('barDisk').style.width=m.disk_percent+'%'}
    }
  }

  // ===== Screen =====
  const canvas=$('screenCanvas');
  const ctx=canvas.getContext('2d');
  let canvasW=0, canvasH=0;

  function drawFrame(b64,w,h){
    const img=new Image();
    img.onload=()=>{
      canvas.width=w;canvas.height=h;
      canvasW=w;canvasH=h;
      ctx.drawImage(img,0,0);
      $('screenOverlay').classList.add('hidden');
    };
    img.src='data:image/jpeg;base64,'+b64;
  }

  // Mouse events on canvas
  function getCanvasCoords(e){
    const r=canvas.getBoundingClientRect();
    return{
      x:e.clientX-r.left,
      y:e.clientY-r.top,
      cw:canvasW,
      ch:canvasH
    };
  }

  canvas.addEventListener('mousemove',e=>{if(connected)send({action:'mouse_move',...getCanvasCoords(e)})});
  canvas.addEventListener('mousedown',e=>{
    if(!connected)return;
    e.preventDefault();
    const btn=e.button===2?'right':e.button===1?'middle':'left';
    send({action:'mouse_down',...getCanvasCoords(e),button:btn});
  });
  canvas.addEventListener('mouseup',e=>{
    if(!connected)return;
    const btn=e.button===2?'right':e.button===1?'middle':'left';
    send({action:'mouse_up',...getCanvasCoords(e),button:btn});
  });
  canvas.addEventListener('click',e=>{
    if(!connected)return;
    const btn=e.button===2?'right':e.button===1?'middle':'left';
    send({action:'mouse_click',...getCanvasCoords(e),button:btn});
  });
  canvas.addEventListener('wheel',e=>{
    if(!connected)return;
    e.preventDefault();
    send({action:'mouse_scroll',delta:e.deltaY>0?-1:1});
  },{passive:false});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());

  // Keyboard
  const keyMap={'Enter':'enter','Backspace':'backspace','Tab':'tab','Escape':'escape','Delete':'delete',
    'ArrowUp':'up','ArrowDown':'down','ArrowLeft':'left','ArrowRight':'right',
    ' ':'space','Control':'ctrl','Alt':'alt','Shift':'shift','Meta':'win'};

  document.addEventListener('keydown',e=>{
    if(!connected||e.target.tagName==='INPUT')return;
    e.preventDefault();
    const key=keyMap[e.key]||e.key.toLowerCase();
    send({action:'key',key,pressed:true});
  });
  document.addEventListener('keyup',e=>{
    if(!connected||e.target.tagName==='INPUT')return;
    const key=keyMap[e.key]||e.key.toLowerCase();
    send({action:'key',key,pressed:false});
  });

  // ===== Files =====
  function renderFiles(items,path){
    const el=$('fileList');
    el.innerHTML='';
    // Parent dir
    if(path!=='/'){
      const up=document.createElement('div');
      up.className='file-item';
      up.innerHTML='<i class="fa-solid fa-arrow-up"></i><span class="file-name">..</span>';
      up.onclick=()=>{const parts=path.split('/').filter(Boolean);parts.pop();send({action:'list_dir',path:'/'+parts.join('/')||'/'})};
      el.appendChild(up);
    }
    items.forEach(item=>{
      const row=document.createElement('div');
      row.className='file-item';
      const icon=item.is_dir?'fa-folder':'fa-file';
      const size=item.is_dir?'':formatSize(item.size);
      row.innerHTML=`<i class="fa-solid ${icon}"></i><span class="file-name">${esc(item.name)}</span><span class="file-size">${size}</span>`;
      row.onclick=()=>{
        if(item.is_dir)send({action:'list_dir',path:item.path});
        else send({action:'read_file',path:item.path});
      };
      el.appendChild(row);
    });
  }

  function formatSize(b){
    if(b<1024)return b+' B';
    if(b<1024*1024)return(b/1024).toFixed(1)+' KB';
    if(b<1024*1024*1024)return(b/(1024*1024)).toFixed(1)+' MB';
    return(b/(1024*1024*1024)).toFixed(1)+' GB';
  }

  function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

  // ===== Terminal =====
  $('termInput').addEventListener('keydown',e=>{
    if(e.key==='Enter'&&connected){
      const cmd=$('termInput').value.trim();
      if(!cmd)return;
      $('termOutput').textContent+='$ '+cmd+'\n';
      send({action:'run_cmd',cmd});
      $('termInput').value='';
    }
  });
  $('btnTermRun').onclick=()=>{
    const cmd=$('termInput').value.trim();
    if(!cmd||!connected)return;
    $('termOutput').textContent+='$ '+cmd+'\n';
    send({action:'run_cmd',cmd});
    $('termInput').value='';
  };

  // ===== Tabs =====
  document.querySelectorAll('.tbtn[data-tab]').forEach(btn=>{
    btn.onclick=()=>{
      document.querySelectorAll('.tbtn[data-tab]').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      const panel=$('panel'+btn.dataset.tab.charAt(0).toUpperCase()+btn.dataset.tab.slice(1));
      if(panel)panel.classList.add('active');
    };
  });

  // ===== Controls =====
  $('btnConnect').onclick=connect;
  $('btnDisconnect').onclick=disconnect;
  $('btnStartStream').onclick=()=>{streaming=true;send({action:'start_screen'})};
  $('btnStopStream').onclick=()=>{streaming=false};
  $('btnHome').onclick=()=>send({action:'list_dir',path:navigator.platform.includes('Win')?'C:\\\\':"/"});
  $('btnGo').onclick=()=>send({action:'list_dir',path:$('filePath').value});
  $('btnRefresh').onclick=()=>send({action:'sysinfo'});
  $('btnFullscreen').onclick=()=>{
    const el=$('screenWrap');
    if(document.fullscreenElement)document.exitFullscreen();
    else el.requestFullscreen();
  };

  // Enter on login
  $('inpPass').addEventListener('keydown',e=>{if(e.key==='Enter')connect()});
})();
