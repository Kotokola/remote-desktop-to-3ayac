"use client";
import { useEffect, useRef, useState, useCallback } from "react";

type SysInfo = {
  os?: string; os_version?: string; hostname?: string;
  cpu_percent?: number; ram_percent?: number; ram_used_gb?: number; ram_total_gb?: number;
  disk_percent?: number; disk_used_gb?: number; disk_total_gb?: number;
  screen_width?: number; screen_height?: number;
};
type FileItem = { name: string; is_dir: boolean; size: number; path: string; modified?: number };

export default function Page() {
  const [serverUrl, setServerUrl] = useState("http://localhost:8765");
  const [password, setPassword] = useState("admin123");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loginMsg, setLoginMsg] = useState("");
  const [tab, setTab] = useState<"screen"|"files"|"terminal"|"sys">("screen");
  const [showKb, setShowKb] = useState(false);
  const [ruMode, setRuMode] = useState(false);
  const [cW, setCW] = useState(0);
  const [cH, setCH] = useState(0);
  const [sys, setSys] = useState<SysInfo>({});
  const [files, setFiles] = useState<FileItem[]>([]);
  const [filePath, setFilePath] = useState("");
  const [termOut, setTermOut] = useState("");
  const [termCmd, setTermCmd] = useState("");
  const [filePreview, setFilePreview] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamingRef = useRef(false);
  const ruMap: Record<string,string> = {'q':'й','w':'ц','e':'у','r':'к','t':'е','y':'н','u':'г','i':'ш','o':'щ','p':'з','a':'ф','s':'ы','d':'в','f':'а','g':'п','h':'р','j':'о','k':'л','l':'д','z':'я','x':'ч','c':'с','v':'м','b':'и','n':'т','m':'ь'};

  const api = useCallback(async (action: string, data: any = {}) => {
    const base = serverUrl.replace(/\/$/, "");
    // try new REST endpoints first, fallback to generic /api
    const endpoints: Record<string,string> = {
      auth: "/api/auth", screenshot: "/api/screenshot", sysinfo: "/api/sysinfo",
      list_dir: "/api/list_dir", read_file: "/api/read_file", run_cmd: "/api/run_cmd",
    };
    const url = endpoints[action] ? base + endpoints[action] : base + "/api";
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...data }),
      });
      const j = await r.json();
      if (action === "auth" && r.status === 401) return { action: "auth_fail" };
      return j;
    } catch (e: any) {
      // fallback generic
      try {
        const r2 = await fetch(base + "/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...data }) });
        return await r2.json();
      } catch (e2: any) {
        return { action: "error", message: e.message };
      }
    }
  }, [serverUrl]);

  const sendInput = useCallback((action: string, data: any = {}) => {
    if (!connected) return;
    const base = serverUrl.replace(/\/$/, "");
    fetch(base + "/api/input", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...data }) }).catch(()=>{});
    // also fallback to generic
    fetch(base + "/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...data }) }).catch(()=>{});
  }, [connected, serverUrl]);

  const connect = async () => {
    if (!serverUrl || !password) { setLoginMsg("Заполни все поля"); return; }
    setConnecting(true); setLoginMsg("Подключение к NEON NET...");
    const r = await api("auth", { password });
    if (r.action === "auth_ok") {
      setConnected(true); setLoginMsg(""); setSys(r.info || {});
      streamingRef.current = true;
      setTimeout(()=> loadFiles("/"), 500);
      loadSys();
    } else {
      setLoginMsg("ACCESS DENIED — неверный пароль");
    }
    setConnecting(false);
  };

  const disconnect = () => {
    streamingRef.current = false;
    setConnected(false);
  };

  const loadSys = async () => {
    const r = await api("sysinfo");
    if (r.os) setSys(r);
  };
  const loadFiles = async (p: string) => {
    setFilePath(p);
    const r = await api("list_dir", { path: p });
    if (r.items) { setFiles(r.items); setFilePath(r.path || p); }
    else if (r.error) setTermOut(prev => prev + `\n[files] ${r.error}`);
  };
  const openFile = async (p: string) => {
    const r = await api("read_file", { path: p });
    if (r.content) setFilePreview(r.content.slice(0, 8000));
    else setFilePreview(r.error || "Ошибка");
  };
  const runCmd = async () => {
    if (!termCmd.trim()) return;
    const cmd = termCmd;
    setTermOut(o => o + `\n$ ${cmd}\n`);
    setTermCmd("");
    const r = await api("run_cmd", { cmd });
    let out = "";
    if (r.stdout) out += r.stdout;
    if (r.stderr) out += r.stderr;
    if (r.error) out += r.error;
    if (!out) out = `(exit ${r.returncode ?? "?"})`;
    setTermOut(o => o + out + "\n");
  };

  // screen loop
  useEffect(() => {
    if (!connected) return;
    let alive = true;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const loop = async () => {
      while (alive && streamingRef.current) {
        try {
          const r = await api("screenshot");
          if (r.image && ctx && canvas) {
            const img = new window.Image();
            img.onload = () => {
              if (!alive) return;
              canvas.width = r.width; canvas.height = r.height;
              setCW(r.width); setCH(r.height);
              ctx.drawImage(img, 0, 0);
            };
            img.src = "data:image/jpeg;base64," + r.image;
          }
        } catch {}
        await new Promise(res => setTimeout(res, 90));
      }
    };
    loop();
    return () => { alive = false; };
  }, [connected, api]);

  // canvas mouse/touch
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const getPos = (e: MouseEvent | Touch, rect: DOMRect) => ({ x: (e as any).clientX - rect.left, y: (e as any).clientY - rect.top });

    const onMouseDown = (e: MouseEvent) => {
      if (!connected) return;
      const rect = c.getBoundingClientRect();
      const { x, y } = getPos(e as any, rect);
      sendInput("mouse_click", { x, y, cw: cW, ch: cH, button: (e as MouseEvent).button === 2 ? "right" : "left" });
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      sendInput("scroll", { dx: e.deltaX > 0 ? 3 : e.deltaX < 0 ? -3 : 0, dy: e.deltaY > 0 ? 3 : e.deltaY < 0 ? -3 : 0 });
    };
    const onContext = (e: Event) => e.preventDefault();

    let drag = false, sx = 0, sy = 0, st = 0;
    let twoX = 0, twoY = 0;
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        twoX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        twoY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        return;
      }
      if (e.touches.length === 1) {
        sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now(); drag = true;
        const rect = c.getBoundingClientRect();
        sendInput("mouse_move", { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top, cw: cW, ch: cH });
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const dx = (cx - twoX) * 0.5, dy = (cy - twoY) * 0.5;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) { sendInput("scroll", { dx: Math.round(dx), dy: Math.round(dy) }); twoX = cx; twoY = cy; }
        return;
      }
      if (e.touches.length === 1 && drag) {
        const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
        if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
          if (Math.abs(dy) > Math.abs(dx)) sendInput("scroll", { dx: 0, dy: Math.round(dy * 0.3) });
          sx = e.touches[0].clientX; sy = e.touches[0].clientY;
        } else {
          const rect = c.getBoundingClientRect();
          sendInput("mouse_move", { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top, cw: cW, ch: cH });
        }
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault(); drag = false;
      if (Date.now() - st < 220 && e.changedTouches.length) {
        const t = e.changedTouches[0]; const rect = c.getBoundingClientRect();
        sendInput("mouse_click", { x: t.clientX - rect.left, y: t.clientY - rect.top, cw: cW, ch: cH, button: "left" });
      }
    };

    c.addEventListener("mousedown", onMouseDown as any);
    c.addEventListener("wheel", onWheel as any, { passive: false } as any);
    c.addEventListener("contextmenu", onContext as any);
    c.addEventListener("touchstart", onTouchStart as any, { passive: false } as any);
    c.addEventListener("touchmove", onTouchMove as any, { passive: false } as any);
    c.addEventListener("touchend", onTouchEnd as any, { passive: false } as any);
    return () => {
      c.removeEventListener("mousedown", onMouseDown as any);
      c.removeEventListener("wheel", onWheel as any);
      c.removeEventListener("contextmenu", onContext as any);
      c.removeEventListener("touchstart", onTouchStart as any);
      c.removeEventListener("touchmove", onTouchMove as any);
      c.removeEventListener("touchend", onTouchEnd as any);
    };
  }, [connected, cW, cH, sendInput]);

  // keyboard
  const sendKey = (k: string) => {
    if (k === "ru") { setRuMode(v=>!v); return; }
    let key = k;
    if (ruMode && /^[a-z]$/i.test(key)) {
      key = ruMap[key.toLowerCase()] || key;
    }
    sendInput("key_press", { key });
  };

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        {/* bg effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#050510] via-[#0a0a2a] to-[#050510]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#00f0ff]/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-[#ff00a0]/10 blur-[120px] rounded-full" />

        <div className="relative w-full max-w-[420px]">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00f0ff]/10 border border-[#00f0ff]/30 text-[11px] tracking-[0.2em] text-[#00f0ff] font-mono">● NEON DESK v2.0 // CYBERPUNK EDITION</div>
          </div>

          <div className="rounded-[24px] bg-[#0a0a1f]/80 backdrop-blur-xl neon-border p-8 scanline relative">
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#00f0ff] to-[#7a00ff] flex items-center justify-center text-2xl shadow-neon mb-4">
                <i className="fa-solid fa-display" />
              </div>
              <h1 className="text-[22px] font-black tracking-tight" style={{fontFamily:'Orbitron'}}>NEON DESK</h1>
              <p className="text-xs tracking-[0.3em] text-[#00f0ff] font-mono -mt-1">REMOTE CYBER CONTROL</p>
              <p className="text-sm text-dim mt-3">Подключись к своему ПК через NEON NET</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] tracking-widest text-dim font-mono">NEON ADDRESS</label>
                <input value={serverUrl} onChange={e=>setServerUrl(e.target.value)} placeholder="http://192.168.1.10:8765" className="mt-1 w-full px-4 py-3 rounded-xl bg-[#050510] border border-border focus:border-[#00f0ff]/50 outline-none text-sm font-mono placeholder:text-dim/50" />
              </div>
              <div>
                <label className="text-[11px] tracking-widest text-dim font-mono">ACCESS KEY</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=> e.key==="Enter" && connect()} placeholder="••••••••" className="mt-1 w-full px-4 py-3 rounded-xl bg-[#050510] border border-border focus:border-[#ff00a0]/50 outline-none text-sm" />
              </div>
              <button onClick={connect} disabled={connecting} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#7a00ff] text-black font-black tracking-widest text-sm hover:shadow-neon transition disabled:opacity-50" style={{fontFamily:'Orbitron'}}>
                {connecting ? "CONNECTING..." : "► CONNECT TO NEON NET"}
              </button>
              {loginMsg && <div className={`text-xs font-mono text-center py-2 rounded-lg ${loginMsg.includes("DENIED") ? "bg-[#ff00a0]/10 text-[#ff3d8e] border border-[#ff00a0]/30" : "text-[#00f0ff]"}`}>{loginMsg}</div>}
            </div>

            <div className="mt-6 flex items-center justify-between text-[11px] font-mono text-dim">
              <span><span className="w-2 h-2 inline-block rounded-full bg-emerald-400 shadow-[0_0_8px_#00ff88] mr-1" /> ENCRYPTED</span>
              <span>PORT 8765</span>
              <span>FASTAPI + WS</span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            {[
              {icon:"fa-bolt", label:"60 FPS", sub:"LOW LATENCY"},
              {icon:"fa-shield-halved", label:"SECURE", sub:"AUTH ONLY"},
              {icon:"fa-microchip", label:"CYBER", sub:"NEON v2.0"},
            ].map(c=>(
              <div key={c.label} className="rounded-xl bg-card border border-border p-3">
                <i className={`fa-solid ${c.icon} text-[#00f0ff]`} />
                <div className="text-xs font-bold mt-1" style={{fontFamily:'Orbitron'}}>{c.label}</div>
                <div className="text-[10px] font-mono text-dim">{c.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-bg">
      {/* top bar */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border bg-card/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00f0ff] to-[#7a00ff] flex items-center justify-center"><i className="fa-solid fa-display text-sm" /></div>
          <div>
            <div className="text-sm font-black leading-none" style={{fontFamily:'Orbitron'}}>NEON DESK</div>
            <div className="text-[10px] font-mono tracking-widest text-[#00f0ff]">ONLINE // {sys.hostname || "CYBER NODE"}</div>
          </div>
          <span className="ml-2 hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-mono text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> CONNECTED</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setShowKb(v=>!v)} className={`w-9 h-9 rounded-xl border flex items-center justify-center ${showKb ? "bg-[#00f0ff] text-black border-[#00f0ff]" : "bg-card border-border text-dim hover:text-white"}`}><i className="fa-solid fa-keyboard" /></button>
          <button onClick={disconnect} className="px-3 py-2 rounded-xl bg-[#ff00a0]/10 border border-[#ff00a0]/30 text-[#ff5db1] text-xs font-mono hover:bg-[#ff00a0]/20"><i className="fa-solid fa-power-off mr-1" /> EXIT</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* sidebar */}
        <div className="w-16 sm:w-[72px] border-r border-border bg-card flex flex-col items-center py-4 gap-2 shrink-0">
          {[
            {id:"screen", icon:"fa-display", label:"SCREEN"},
            {id:"files", icon:"fa-folder", label:"FILES"},
            {id:"terminal", icon:"fa-terminal", label:"TERM"},
            {id:"sys", icon:"fa-chart-simple", label:"SYS"},
          ].map(b=>(
            <button key={b.id} onClick={()=>setTab(b.id as any)} className={`w-[52px] h-[52px] rounded-xl flex flex-col items-center justify-center gap-1 border text-[10px] font-mono tracking-widest transition ${tab===b.id ? "bg-[#00f0ff] text-black border-[#00f0ff] shadow-neon" : "bg-[#0a0a1f] border-border text-dim hover:text-white hover:border-[#00f0ff]/40"}`}>
              <i className={`fa-solid ${b.icon} text-[14px]`} />
              {b.label}
            </button>
          ))}
          <div className="mt-auto text-[9px] font-mono text-dim text-center leading-tight">NEON<br/>v2.0</div>
        </div>

        {/* main */}
        <div className="flex-1 overflow-hidden bg-[#050510] relative">
          {tab==="screen" && (
            <div className="h-full flex flex-col">
              <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
                <canvas ref={canvasRef} className="screen-canvas max-w-full max-h-full block" />
                {!cW && <div className="absolute inset-0 flex items-center justify-center"><div className="text-center"><div className="w-12 h-12 mx-auto rounded-xl bg-[#00f0ff]/10 border border-[#00f0ff]/30 flex items-center justify-center animate-pulse"><i className="fa-solid fa-satellite-dish text-[#00f0ff]" /></div><div className="text-xs font-mono tracking-widest text-[#00f0ff] mt-3">SYNCING NEON STREAM...</div></div></div>}
                {/* overlay controls */}
                <div className="absolute bottom-3 left-3 flex gap-2">
                  <div className="px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur border border-white/10 text-[11px] font-mono text-white/80">FPS ~ 10 • {cW}×{cH}</div>
                </div>
              </div>
            </div>
          )}

          {tab==="files" && (
            <div className="h-full flex flex-col">
              <div className="p-3 border-b border-border bg-card flex gap-2">
                <button onClick={()=>loadFiles("/")} className="px-3 py-2 rounded-xl bg-bg border border-border text-sm"><i className="fa-solid fa-house" /></button>
                <input value={filePath} onChange={e=>setFilePath(e.target.value)} onKeyDown={e=> e.key==="Enter" && loadFiles(filePath)} className="flex-1 px-3 py-2 rounded-xl bg-bg border border-border font-mono text-sm outline-none focus:border-[#00f0ff]/50" placeholder="/  путь" />
                <button onClick={()=>loadFiles(filePath)} className="px-4 py-2 rounded-xl bg-[#00f0ff] text-black font-bold text-sm">GO</button>
              </div>
              <div className="flex-1 overflow-auto p-2 space-y-1">
                {files.map(f=>(
                  <div key={f.path} onClick={()=> f.is_dir ? loadFiles(f.path) : openFile(f.path)} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card border border-border hover:border-[#00f0ff]/40 cursor-pointer group">
                    <i className={`fa-solid ${f.is_dir ? "fa-folder text-[#00f0ff]" : "fa-file text-dim group-hover:text-white"}`} />
                    <span className="flex-1 text-sm truncate font-medium">{f.name}</span>
                    <span className="text-xs font-mono text-dim">{f.is_dir ? "" : `${(f.size/1024).toFixed(1)} KB`}</span>
                    <i className="fa-solid fa-chevron-right text-dim text-xs opacity-0 group-hover:opacity-100" />
                  </div>
                ))}
                {files.length===0 && <div className="text-center text-dim font-mono text-sm py-10">Пусто или нет доступа</div>}
              </div>
              {filePreview && (
                <div className="border-t border-border bg-card p-3 max-h-[40%] overflow-auto">
                  <div className="flex justify-between items-center mb-2"><span className="text-xs font-mono tracking-widest text-[#00f0ff]">FILE PREVIEW</span><button onClick={()=>setFilePreview(null)} className="w-7 h-7 rounded-lg bg-bg border border-border"><i className="fa-solid fa-xmark" /></button></div>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all text-white/80 bg-bg p-3 rounded-xl border border-border overflow-auto max-h-[200px]">{filePreview}</pre>
                </div>
              )}
            </div>
          )}

          {tab==="terminal" && (
            <div className="h-full flex flex-col">
              <div className="flex-1 overflow-auto p-4 font-mono text-[13px] leading-5 whitespace-pre-wrap break-all bg-[#020208] text-[#b8ffb8] border-b border-border" style={{fontFamily:'JetBrains Mono'}}>
                <div className="text-dim mb-2"># NEON SHELL — connected to {sys.hostname || "remote"}</div>
                {termOut || <span className="text-dim/60">Введи команду и нажми Run / Enter...</span>}
              </div>
              <div className="p-3 bg-card border-t border-border flex gap-2">
                <span className="text-[#00ff88] font-mono font-bold py-2">$</span>
                <input value={termCmd} onChange={e=>setTermCmd(e.target.value)} onKeyDown={e=> e.key==="Enter" && runCmd()} placeholder="ls, dir, ipconfig, whoami..." className="flex-1 px-3 py-2 rounded-xl bg-bg border border-border font-mono text-sm outline-none focus:border-[#00ff88]/50 text-white" />
                <button onClick={runCmd} className="px-5 py-2 rounded-xl bg-[#00ff88] text-black font-black text-sm hover:shadow-[0_0_15px_rgba(0,255,136,0.5)]">RUN</button>
              </div>
            </div>
          )}

          {tab==="sys" && (
            <div className="h-full overflow-auto p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[
                  {label:"OS", value: `${sys.os || "—"} ${sys.os_version?.slice(0,30) || ""}`},
                  {label:"HOST", value: sys.hostname || "—"},
                  {label:"SCREEN", value: sys.screen_width ? `${sys.screen_width}×${sys.screen_height}` : "—"},
                ].map(c=>(
                  <div key={c.label} className="rounded-2xl bg-card border border-border p-4">
                    <div className="text-[10px] font-mono tracking-[0.2em] text-dim">{c.label}</div>
                    <div className="text-sm font-bold mt-1 break-all">{c.value}</div>
                  </div>
                ))}
                {[
                  {label:"CPU", pct: sys.cpu_percent, value: `${sys.cpu_percent ?? "—"}%`},
                  {label:"RAM", pct: sys.ram_percent, value: sys.ram_percent != null ? `${sys.ram_used_gb}/${sys.ram_total_gb} GB` : "—"},
                  {label:"DISK", pct: sys.disk_percent, value: sys.disk_percent != null ? `${sys.disk_used_gb}/${sys.disk_total_gb} GB` : "—"},
                ].map(c=>(
                  <div key={c.label} className="rounded-2xl bg-card border border-border p-4">
                    <div className="text-[10px] font-mono tracking-[0.2em] text-dim">{c.label}</div>
                    <div className="text-sm font-bold mt-1">{c.value}</div>
                    <div className="mt-3 h-2 bg-bg rounded-full overflow-hidden border border-border">
                      <div className="h-full bg-gradient-to-r from-[#00f0ff] to-[#7a00ff] transition-all" style={{width: `${c.pct ?? 0}%`}} />
                    </div>
                    <div className="text-[11px] font-mono text-dim mt-1">{c.pct ?? 0}%</div>
                  </div>
                ))}
              </div>
              <button onClick={loadSys} className="mt-4 px-5 py-2.5 rounded-xl bg-card border border-border hover:border-[#00f0ff]/50 text-sm font-mono"><i className="fa-solid fa-rotate mr-2" /> REFRESH TELEMETRY</button>
              <div className="mt-6 rounded-2xl bg-gradient-to-br from-[#00f0ff]/10 to-[#7a00ff]/10 border border-[#00f0ff]/20 p-4">
                <div className="text-xs font-mono tracking-widest text-[#00f0ff]">NEON TIP</div>
                <div className="text-sm text-white/70 mt-1">Используй файлы для навигации, терминал для команд, а клавиатуру для ввода на удалённом экране. Всё шифруется через NEON NET.</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* cyber keyboard */}
      {showKb && (
        <div className="border-t border-border bg-card p-2 sm:p-3 shrink-0">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[11px] font-mono tracking-[0.2em] text-[#00f0ff]">CYBER KEYBOARD {ruMode ? "• RU" : "• EN"}</span>
            <div className="flex gap-2">
              <button onClick={()=>setRuMode(v=>!v)} className={`px-3 py-1 rounded-lg border text-xs font-mono ${ruMode ? "bg-[#ff00a0] text-white border-[#ff00a0]" : "bg-bg border-border text-dim"}`}>{ruMode ? "RU" : "EN"}</button>
              <button onClick={()=>setShowKb(false)} className="w-8 h-8 rounded-lg bg-bg border border-border"><i className="fa-solid fa-xmark" /></button>
            </div>
          </div>
          {[
            ["`","1","2","3","4","5","6","7","8","9","0","-","=","Backspace"],
            ["Tab","q","w","e","r","t","y","u","i","o","p","[","]","\\"],
            ["Caps","a","s","d","f","g","h","j","k","l",";","'","Enter"],
            ["Shift","z","x","c","v","b","n","m",",",".","/","Shift"],
            ["Ctrl","Alt","Space","Alt","Ctrl","←","↓","↑","→"],
          ].map((row,i)=>(
            <div key={i} className="flex gap-1 mb-1 justify-center">
              {row.map(k=>{
                const isSpace = k==="Space";
                const label = k==="Space" ? "SPACE" : k;
                const wide = ["Backspace","Enter","Shift","Tab","Caps"].includes(k);
                return (
                  <button key={k+i} onClick={()=>sendKey(k.toLowerCase()==="space" ? " " : k.toLowerCase())} className={`${isSpace ? "flex-[3] max-w-[360px]" : wide ? "min-w-[64px]" : "flex-1"} h-9 rounded-lg border text-xs font-medium transition active:scale-95 ${["Backspace","Enter"].includes(k) ? "bg-[#ff00a0]/20 border-[#ff00a0]/40 text-[#ff8ac6]" : "bg-bg border-border hover:border-[#00f0ff]/50 hover:text-[#00f0ff]"}`}>
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
