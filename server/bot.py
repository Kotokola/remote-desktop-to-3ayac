"""
Telegram Remote Control Bot - Cyberpunk Edition
Only for user 8580891668. Controls PC via Telegram.
Features: screen, sysinfo, files, terminal, WIN+R cmd, server control, OpenCode control
"""
import os, sys, json, subprocess, platform, time, base64, io, re
from pathlib import Path
from datetime import datetime

# ---- Config ----
ALLOWED_USER = 8580891668
PASSWORD = "admin123" # for reference

# Token priority: env BOT_TOKEN > bot_token.txt > placeholder
BOT_TOKEN = os.getenv("BOT_TOKEN", "")
if not BOT_TOKEN and Path("bot_token.txt").exists():
    try: BOT_TOKEN = Path("bot_token.txt").read_text().strip().split()[0]
    except: pass
# fallback for local dev (do NOT commit real token to GitHub)
if not BOT_TOKEN:
    BOT_TOKEN = "PUT_YOUR_TOKEN_HERE"

if not BOT_TOKEN or ":" not in BOT_TOKEN:
    print("ERROR: BOT_TOKEN not set. Set env BOT_TOKEN or create bot_token.txt")
    sys.exit(1)

# Proxy for Bot API (HTTP/SOCKS, NOT MTProxy secret)
# set env PROXY_URL or create proxy.txt with e.g. http://127.0.0.1:1080 or socks5://...
PROXY_URL = os.getenv("PROXY_URL", "")
if not PROXY_URL and Path("proxy.txt").exists():
    try: PROXY_URL = Path("proxy.txt").read_text().strip().split()[0]
    except: pass
if PROXY_URL:
    print(f"[BOT] Proxy: {PROXY_URL}")
else:
    print("[BOT] No proxy (if Telegram blocked, set PROXY_URL or proxy.txt)")

print(f"[BOT] Token ...{BOT_TOKEN[-6:]}  Allowed: {ALLOWED_USER}")

try:
    from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
    from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, ContextTypes, filters
except ImportError:
    print("pip install python-telegram-bot --upgrade")
    sys.exit(1)

try: import mss
except: mss=None
try: import pyautogui; pyautogui.FAILSAFE=False
except: pyautogui=None
try: from PIL import Image
except: Image=None
try: import psutil
except: psutil=None

# ---- State ----
awaiting_cmd = set()  # user_ids waiting for cmd text after WIN+R
awaiting_exec = set()
server_process = None

# Persistent terminal sessions: {user_id: {sess_id: {"proc": Popen, "title": str, "cwd": str}}}
term_sessions = {}
TERM_MAX = 5

def get_term(user_id, sess_id="default"):
    if user_id not in term_sessions: term_sessions[user_id] = {}
    if sess_id not in term_sessions[user_id]:
        try:
            # start powershell with UTF-8
            proc = subprocess.Popen(
                ["powershell.exe", "-NoLogo", "-NoExit", "-Command", "chcp 65001 >$null; [Console]::InputEncoding=[Console]::OutputEncoding=[System.Text.Encoding]::UTF8"],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace", bufsize=1, cwd=str(Path.home()),
                creationflags=subprocess.CREATE_NO_WINDOW if os.name=="nt" else 0
            )
            # drain initial banner
            time.sleep(0.3)
            try: proc.stdout.read(1024)
            except: pass
            term_sessions[user_id][sess_id] = {"proc": proc, "title": sess_id, "cwd": str(Path.home())}
        except Exception as e:
            proc = subprocess.Popen(
                ["cmd.exe", "/k", "chcp 65001 >nul"],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace", bufsize=1, cwd=str(Path.home()),
                creationflags=subprocess.CREATE_NO_WINDOW if os.name=="nt" else 0
            )
            term_sessions[user_id][sess_id] = {"proc": proc, "title": sess_id, "cwd": str(Path.home())}
    return term_sessions[user_id][sess_id]

def exec_persistent(cmd, user_id, sess_id="default", timeout=15):
    sess = get_term(user_id, sess_id)
    proc = sess["proc"]
    if proc.poll() is not None:
        term_sessions[user_id].pop(sess_id, None)
        sess = get_term(user_id, sess_id)
        proc = sess["proc"]
    # handle cd with LiteralPath to support \u2800 and —
    stripped = cmd.strip()
    if stripped.lower().startswith("cd "):
        try:
            raw = stripped[3:].strip().strip('"').strip("'")
            # remove /d for cmd compat
            if raw.lower().startswith("/d "): raw = raw[3:].strip().strip('"').strip("'")
            if raw:
                # use PowerShell Set-Location -LiteralPath
                # escape single quotes by doubling
                esc = raw.replace("'", "''")
                proc.stdin.write(f"Set-Location -LiteralPath '{esc}'\n")
                proc.stdin.write(f"echo __END_{time.time()}__\n")
                proc.stdin.flush()
                # drain
                out = ""
                start = time.time()
                marker = "__END_"
                while time.time() - start < 2:
                    line = proc.stdout.readline()
                    if not line: time.sleep(0.05); continue
                    if marker in line: break
                # also update python cwd for next non-persistent runs
                try: os.chdir(raw)
                except: pass
                sess["cwd"] = raw
                return f"📁 cd -> {raw}"
        except Exception as e:
            return f"cd error: {e}"
    marker = f"__END_{time.time()}__"
    try:
        proc.stdin.write(cmd + f"\nWrite-Output {marker}\n")
        proc.stdin.flush()
        out = ""
        start = time.time()
        while time.time() - start < timeout:
            line = proc.stdout.readline()
            if not line: time.sleep(0.05); continue
            if marker in line: break
            out += line
            if len(out) > 6000: break
        return out.strip() or f"(no output)"
    except Exception as e:
        return f"exec error: {e}"

def list_windows():
    try:
        import ctypes
        user32 = ctypes.windll.user32
        EnumWindows = user32.EnumWindows
        GetWindowTextW = user32.GetWindowTextW
        GetWindowTextLengthW = user32.GetWindowTextLengthW
        IsWindowVisible = user32.IsWindowVisible
        windows = []
        @ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
        def callback(hwnd, lParam):
            if IsWindowVisible(hwnd):
                length = GetWindowTextLengthW(hwnd)
                if length:
                    buff = ctypes.create_unicode_buffer(length+1)
                    GetWindowTextW(hwnd, buff, length+1)
                    title = buff.value
                    if title.strip():
                        windows.append((hwnd, title[:60]))
            return True
        EnumWindows(callback, 0)
        return windows[:30]
    except Exception as e:
        return []

def is_allowed(uid): return uid == ALLOWED_USER

async def deny(update: Update):
    try:
        m = update.effective_message
        if m: await m.reply_text("⛔ ACCESS DENIED. Ваш ID: "+str(update.effective_user.id))
    except: pass

def opencode_path():
    for p in [
        Path(os.getenv("LOCALAPPDATA", "")) / "Programs" / "@opencode-aidesktop" / "OpenCode.exe",
        Path("C:/Users/GUEST/AppData/Local/Programs/@opencode-aidesktop/OpenCode.exe"),
        Path("C:/Users/zedre/AppData/Local/Programs/@opencode-aidesktop/OpenCode.exe"),
        Path.home() / "AppData" / "Local" / "Programs" / "@opencode-aidesktop" / "OpenCode.exe",
    ]:
        if p.exists(): return str(p)
    return None

def get_opencode_workspaces():
    # parse workspaces from Roaming
    ws = []
    for base in [Path(os.getenv("APPDATA","")) / "ai.opencode.desktop", Path.home() / "AppData" / "Roaming" / "ai.opencode.desktop"]:
        if not base.exists(): continue
        for f in base.glob("opencode.workspace.*.dat"):
            try:
                name = f.name.replace("opencode.workspace.","").replace(".dat","")
                # try to decode - it's binary, just show name
                ws.append({"file": str(f), "name": name[:40], "mtime": f.stat().st_mtime})
            except: pass
    ws = sorted(ws, key=lambda x: x["mtime"], reverse=True)[:10]
    return ws

def capture_screen_bytes():
    if not mss or not Image: return None, "mss/Pillow not installed"
    try:
        with mss.MSS() as sct:
            mon = sct.monitors[1]
            shot = sct.grab(mon)
            img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
            # smaller for proxy to avoid Malformed reply
            img = img.resize((int(img.width*0.45), int(img.height*0.45)), Image.Resampling.BILINEAR)
            buf = io.BytesIO(); img.save(buf, format="JPEG", quality=55, optimize=True)
            return buf.getvalue(), None
    except Exception as e: return None, str(e)

def sysinfo_text():
    try:
        cpu = psutil.cpu_percent(interval=0.5) if psutil else "?"
        mem = psutil.virtual_memory() if psutil else None
        disk = psutil.disk_usage("/") if psutil else None
        sw, sh = pyautogui.size() if pyautogui else ("?","?")
        txt = f"🖥 *SYSINFO*\nOS: {platform.system()} {platform.version()[:40]}\nHost: {platform.node()}\nScreen: {sw}x{sh}\n"
        if mem: txt += f"CPU: {cpu}%\nRAM: {mem.percent}% {round(mem.used/1024**3,1)}/{round(mem.total/1024**3,1)} GB\n"
        if disk: txt += f"Disk: {disk.percent}% {round(disk.used/1024**3,1)}/{round(disk.total/1024**3,1)} GB\n"
        txt += f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
        return txt
    except Exception as e: return f"sysinfo error: {e}"

def list_dir_text(path):
    try:
        p = Path(path).expanduser().resolve()
        if not p.exists(): return f"❌ Path not found: {path}", []
        if not p.is_dir(): return f"❌ Not a dir: {p}", []
        items = sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
        lines = [f"📁 `{p}`\n"]
        kb = []
        for it in items[:30]:
            icon = "📁" if it.is_dir() else "📄"
            lines.append(f"{icon} {it.name} {'('+str(it.stat().st_size)+'b)' if not it.is_dir() else ''}")
            # button for navigation (limit)
            if it.is_dir():
                kb.append([InlineKeyboardButton(f"📁 {it.name[:30]}", callback_data=f"files:{it}")])
            else:
                kb.append([InlineKeyboardButton(f"📄 {it.name[:30]}", callback_data=f"read:{it}")])
        # parent
        if p.parent != p:
            kb.append([InlineKeyboardButton("⬆️ Parent", callback_data=f"files:{p.parent}")])
        kb.append([InlineKeyboardButton("🏠 Home", callback_data="files:C:/"), InlineKeyboardButton("📍 Cwd", callback_data=f"files:{Path.cwd()}")])
        return "\n".join(lines), kb
    except Exception as e: return f"error: {e}", []

# ---- Handlers ----
async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id): return await deny(update)
    kb = [
        [InlineKeyboardButton("🖥 Screen", callback_data="do:screen"), InlineKeyboardButton("📊 SysInfo", callback_data="do:sysinfo")],
        [InlineKeyboardButton("📁 Files", callback_data="do:files"), InlineKeyboardButton("💻 Terminal", callback_data="do:terminal")],
        [InlineKeyboardButton("⌨️ WIN+R → CMD", callback_data="do:cmd"), InlineKeyboardButton("🤖 OpenCode", callback_data="do:opencode")],
        [InlineKeyboardButton("🔄 Server", callback_data="do:server"), InlineKeyboardButton("❓ Help", callback_data="do:help")],
    ]
    await update.message.reply_text(
        "🌆 *NEON DESK // CYBER CONTROL*\n\n"
        "Доступ: только для `8580891668`\n"
        "Команды: /screen /sysinfo /files /exec <cmd> /cmd /opencode /server\n"
        "Нажми кнопку или введи команду.",
        parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(kb)
    )

async def help_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id): return await deny(update)
    await update.message.reply_text(
        "📖 *HELP*\n"
        "/start — меню\n"
        "/screen — скрин экрана\n"
        "/sysinfo — CPU/RAM/Disk\n"
        "/files [path] — файлы\n"
        "/exec <cmd> — PowerShell (скрыто, без окна)\n"
        "/cmd — WIN+R → cmd → ждёт команду\n"
        "/opencode — OpenCode\n"
        "/server — управление сервером\n"
        "/lock — заблокировать ПК\n"
        "/shutdown — выключить\n"
        "/reboot — перезагрузить\n"
        "/volume 0-100 — громкость\n"
        "/clipboard — буфер обмена\n"
        "/download <path> — скачать файл\n"
        "/ps — процессы\n"
        "/kill <pid> — убить\n"
        "Текст: `открой файл C:\\...`, `скрин`",
        parse_mode="Markdown"
    )

async def lock_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id): return await deny(update)
    try:
        import ctypes; ctypes.windll.user32.LockWorkStation()
        await update.message.reply_text("🔒 Заблокировано")
    except Exception as e: await update.message.reply_text(f"❌ {e}")

async def shutdown_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id): return await deny(update)
    await update.message.reply_text("⏳ Выключение через 5с... /abort для отмены")
    subprocess.Popen("shutdown /s /t 5", shell=True)

async def reboot_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id): return await deny(update)
    await update.message.reply_text("🔄 Перезагрузка через 5с...")
    subprocess.Popen("shutdown /r /t 5", shell=True)

async def volume_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id): return await deny(update)
    try:
        vol = int(ctx.args[0]) if ctx.args else 50
        vol = max(0,min(100,vol))
        # PowerShell set volume
        subprocess.run(f"(New-Object -comObject WScript.Shell).SendKeys([char]175)", shell=True) # placeholder
        # Use nircmd if available, else PowerShell
        ps = f"$v={vol}; $o=New-Object -ComObject WScript.Shell; for($i=0;$i<50;$i++){{$o.SendKeys([char]174)}}; for($i=0;$i<{vol//2};$i++){{$o.SendKeys([char]175)}}"
        subprocess.run(["powershell.exe","-Command",ps], creationflags=subprocess.CREATE_NO_WINDOW if os.name=="nt" else 0)
        await update.message.reply_text(f"🔊 Громкость ~{vol}%")
    except Exception as e: await update.message.reply_text(f"❌ {e}")

async def clipboard_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id): return await deny(update)
    if ctx.args:
        txt = " ".join(ctx.args)
        try:
            import pyperclip; pyperclip.copy(txt); await update.message.reply_text(f"📋 Скопировано: {txt[:100]}")
            return
        except Exception as e: await update.message.reply_text(f"❌ {e}"); return
    try:
        import pyperclip; txt = pyperclip.paste()
        await update.message.reply_text(f"📋 Буфер:\n```\n{txt[:3000]}\n```", parse_mode="Markdown")
    except Exception as e: await update.message.reply_text(f"❌ {e}")

async def download_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id): return await deny(update)
    path = " ".join(ctx.args) if ctx.args else ""
    if not path: await update.message.reply_text("Использование: /download C:\\path\\file"); return
    p = Path(path)
    if not p.exists(): await update.message.reply_text("❌ Не найден"); return
    if p.stat().st_size > 50*1024*1024: await update.message.reply_text("❌ >50MB"); return
    try: await update.message.reply_document(document=open(str(p),"rb"), filename=p.name)
    except Exception as e: await update.message.reply_text(f"❌ {e}")

async def ps_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id): return await deny(update)
    try:
        if not psutil: await update.message.reply_text("psutil not installed"); return
        txt = "🖥 *Processes:*\n"
        for p in sorted(psutil.process_iter(['pid','name','cpu_percent']), key=lambda x: x.info['cpu_percent'] or 0, reverse=True)[:15]:
            txt += f"`{p.info['pid']:5}` {p.info['name'][:20]:20} {p.info['cpu_percent']}%\n"
        await update.message.reply_text(txt, parse_mode="Markdown")
    except Exception as e: await update.message.reply_text(f"❌ {e}")

async def screen_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id): return await deny(update)
    msg = await update.message.reply_text("📸 Capturing...")
    data, err = capture_screen_bytes()
    if err: await msg.edit_text(f"❌ {err}")
    else:
        await msg.delete()
        await update.message.reply_photo(photo=data, caption=f"🖥 Screen {datetime.now().strftime('%H:%M:%S')}")

async def sysinfo_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id): return await deny(update)
    await update.message.reply_text(sysinfo_text(), parse_mode="Markdown")

async def files_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id): return await deny(update)
    path = " ".join(ctx.args) if ctx.args else str(Path.home())
    txt, kb = list_dir_text(path)
    # telegram limit 4096
    if len(txt) > 4000: txt = txt[:4000]
    await update.message.reply_text(txt, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(kb) if kb else None)

async def exec_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id): return await deny(update)
    cmd = " ".join(ctx.args) if ctx.args else ""
    if not cmd:
        # show window manager
        uid = update.effective_user.id
        sess = term_sessions.get(uid, {})
        wins = list_windows()
        kb = []
        for sid in list(sess.keys())[:5]:
            kb.append([InlineKeyboardButton(f"💻 {sid} ({'alive' if sess[sid]['proc'].poll() is None else 'dead'})", callback_data=f"term:use:{sid}")])
        kb.append([InlineKeyboardButton("➕ New term", callback_data="term:new"), InlineKeyboardButton("📋 List wins", callback_data="term:wins")])
        kb.append([InlineKeyboardButton("❌ Close term", callback_data="term:close"), InlineKeyboardButton("🔄 Kill all", callback_data="term:killall")])
        await update.message.reply_text("💻 *Terminal* — введи `/exec <cmd>` или выбери окно:\n`Без нового окна!` — выполняется в скрытом персистентном shell (грязь, но не моргает).\nСледующее сообщение без `/` выполнится в текущем терминале.", parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(kb))
        awaiting_exec.add(uid)
        return
    # use persistent shell, no new window
    await update.message.reply_text(f"⏳ Exec (no new window): `{cmd}`", parse_mode="Markdown")
    try:
        out = exec_persistent(cmd, update.effective_user.id)
        out = out[-3800:] or "(no output)"
        await update.message.reply_text(f"```\n{out}\n```", parse_mode="Markdown")
    except Exception as e: await update.message.reply_text(f"❌ {e} (charmap fixed, retry)")

async def cmd_winr(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id): return await deny(update)
    if not pyautogui:
        msg = update.effective_message
        if msg: await msg.reply_text("❌ pyautogui not installed")
        return
    msg = update.effective_message
    if msg: await msg.reply_text("⌨️ Нажимаю WIN+R → ввод `cmd` → Enter...\nЗатем введи команду в чат — она выполнится и вернётся.")
    try:
        pyautogui.hotkey('win', 'r', _pause=False)
        time.sleep(0.5)
        pyautogui.write('cmd', interval=0.05)
        pyautogui.press('enter', _pause=False)
        time.sleep(0.8)
        awaiting_cmd.add(update.effective_user.id)
        if msg: await msg.reply_text("✅ CMD открыт. Введи команду (например `dir` / `ipconfig`):")
    except Exception as e:
        if msg: await msg.reply_text(f"❌ {e}")

async def opencode_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id): return await deny(update)
    path = opencode_path()
    procs = []
    if psutil:
        for p in psutil.process_iter(['pid','name']):
            try:
                if 'opencode' in p.info['name'].lower(): procs.append(p.info)
            except: pass
    kb = [
        [InlineKeyboardButton("▶️ Launch OpenCode", callback_data="op:launch"), InlineKeyboardButton("❌ Kill All", callback_data="op:killall")],
        [InlineKeyboardButton("📋 List PIDs", callback_data="op:list"), InlineKeyboardButton("🔄 Restart", callback_data="op:restart")],
        [InlineKeyboardButton("💬 Continue same chat", callback_data="op:continue"), InlineKeyboardButton("📂 Choose chat", callback_data="op:choose")],
        [InlineKeyboardButton("➕ New chat", callback_data="op:new"), InlineKeyboardButton("🗑 Close chat", callback_data="op:close")],
        [InlineKeyboardButton("🖥 Bring to front", callback_data="op:front")],
    ]
    txt = f"🤖 *OpenCode*\nPath: `{path or 'not found'}`\nRunning: {len(procs)} process(es)\n"
    for p in procs[:5]: txt += f" • PID {p['pid']} {p['name']}\n"
    ws = get_opencode_workspaces()
    if ws:
        txt += "\n*Recent workspaces:*\n"
        for w in ws[:5]: txt += f" • `{w['name']}`\n"
    txt += "\nВыбери действие:"
    await update.message.reply_text(txt, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(kb))

async def server_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id): return await deny(update)
    kb = [
        [InlineKeyboardButton("▶️ Start server_nocors", callback_data="srv:start"), InlineKeyboardButton("🔄 Restart", callback_data="srv:restart")],
        [InlineKeyboardButton("⏹ Stop", callback_data="srv:stop"), InlineKeyboardButton("📊 Status", callback_data="srv:status")],
        [InlineKeyboardButton("📜 Logs", callback_data="srv:logs")],
    ]
    # status
    status = "unknown"
    if psutil:
        for p in psutil.process_iter(['pid','name','cmdline']):
            try:
                cl = " ".join(p.info['cmdline'] or [])
                if "server_nocors" in cl or "server_http" in cl or "server.py" in cl: status = f"running PID {p.info['pid']} {cl[:60]}"
            except: pass
        if status=="unknown": status="not running"
    await update.message.reply_text(f"🔄 *Server*\nStatus: `{status}`\nPort 8765\nPassword: `{PASSWORD}`\n\nУправление:", parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(kb))

async def on_callback(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id): return await update.callback_query.answer("DENIED", show_alert=True)
    q = update.callback_query; await q.answer()
    data = q.data
    msg = q.message or update.effective_message
    try:
        if data == "do:screen":
            d, e = capture_screen_bytes()
            if not msg: return
            if e: await msg.reply_text(f"❌ {e}")
            else: await msg.reply_photo(photo=d, caption="🖥 Screen")
            return
        elif data == "do:sysinfo": await msg.reply_text(sysinfo_text(), parse_mode="Markdown")
        elif data == "do:files":
            txt, kb = list_dir_text(str(Path.home())); await msg.reply_text(txt[:4000], parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(kb) if kb else None)
        elif data == "do:terminal": await msg.reply_text("💻 Введи /exec <команда> или нажми: /exec")
        elif data == "do:cmd": await cmd_winr(update, ctx)
        elif data == "do:opencode": await opencode_cmd(update, ctx)
        elif data == "do:server": await server_cmd(update, ctx)
        elif data == "do:help": await help_cmd(update, ctx)
        elif data.startswith("files:"):
            path = data[6:]; txt, kb = list_dir_text(path); await msg.reply_text(txt[:4000], parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(kb) if kb else None)
        elif data.startswith("read:"):
            path = data[5:]
            try:
                p = Path(path); txt = p.read_text(encoding="utf-8", errors="replace")[:3500]
                await msg.reply_text(f"📄 `{p.name}`\n```\n{txt}\n```", parse_mode="Markdown")
            except Exception as e: await msg.reply_text(f"❌ {e}")
        elif data.startswith("op:"):
            act = data[3:]
            path = opencode_path()
            if act == "launch":
                if path: subprocess.Popen([path]); await msg.reply_text("▶️ Launching OpenCode...")
                else: await msg.reply_text("❌ OpenCode.exe not found")
            elif act == "killall":
                killed=0
                if psutil:
                    for p in psutil.process_iter(['pid','name']):
                        if 'opencode' in p.info['name'].lower():
                            try: psutil.Process(p.info['pid']).kill(); killed+=1
                            except: pass
                await msg.reply_text(f"❌ Killed {killed}")
            elif act == "list":
                procs = [p.info for p in psutil.process_iter(['pid','name']) if 'opencode' in p.info['name'].lower()] if psutil else []
                await msg.reply_text("PIDs:\n" + "\n".join([f"{p['pid']} {p['name']}" for p in procs]) or "none")
            elif act == "restart":
                if psutil:
                    for p in psutil.process_iter(['pid','name']):
                        if 'opencode' in p.info['name'].lower():
                            try: psutil.Process(p.info['pid']).kill()
                            except: pass
                    time.sleep(1)
                if path: subprocess.Popen([path]); await msg.reply_text("🔄 Restarted")
            elif act == "continue": await msg.reply_text("💬 Продолжаю в том же чате — просто пиши сообщение в OpenCode (окно уже открыто).")
            elif act == "choose":
                ws = get_opencode_workspaces()
                if not ws: await msg.reply_text("Нет сохранённых чатов")
                else:
                    kb2 = [[InlineKeyboardButton(w['name'][:30], callback_data=f"opchoose:{w['file']}")] for w in ws[:8]]
                    await msg.reply_text("📂 Выбери чат:", reply_markup=InlineKeyboardMarkup(kb2))
            elif act == "new": 
                if path: subprocess.Popen([path, "--new-window"]); await msg.reply_text("➕ New chat window opened")
            elif act == "close": await msg.reply_text("🗑 Чтобы закрыть чат в OpenCode: Ctrl+W или кнопка закрытия окна. Команда отправлена: Alt+F4")
            elif act == "front":
                if pyautogui:
                    # try to bring to front via Alt+Tab simulation
                    pyautogui.hotkey('alt','tab'); await msg.reply_text("🖥 Попытка вернуть фокус OpenCode")
                else: await msg.reply_text("❌ pyautogui needed")
            else: await msg.reply_text(f"op:{act} — в разработке")
        elif data.startswith("term:"):
            sub = data[5:]
            uid = update.effective_user.id
            if sub == "new":
                sid = f"term{len(term_sessions.get(uid, {}))+1}"
                get_term(uid, sid)
                await msg.reply_text(f"➕ Создан {sid}")
            elif sub == "wins":
                wins = list_windows()
                if not wins: await msg.reply_text("Нет окон")
                else:
                    txt = "🪟 *Windows:*\n" + "\n".join([f"`{hwnd}` {t}" for hwnd,t in wins[:15]])
                    kb2 = [[InlineKeyboardButton(f"🔝 {t[:20]}", callback_data=f"win:front:{hwnd}"), InlineKeyboardButton(f"❌ {hwnd}", callback_data=f"win:close:{hwnd}")] for hwnd,t in wins[:8]]
                    await msg.reply_text(txt, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(kb2) if kb2 else None)
            elif sub == "close":
                if uid in term_sessions and term_sessions[uid]:
                    sid = list(term_sessions[uid].keys())[-1]
                    try: term_sessions[uid][sid]["proc"].terminate()
                    except: pass
                    term_sessions[uid].pop(sid, None)
                    await msg.reply_text(f"🗑 Closed {sid}")
                else: await msg.reply_text("Нет терминалов")
            elif sub == "killall":
                for sid in list(term_sessions.get(uid, {}).keys()):
                    try: term_sessions[uid][sid]["proc"].kill()
                    except: pass
                term_sessions[uid] = {}
                await msg.reply_text("💀 All killed")
            elif sub.startswith("use:"):
                sid = sub[4:]
                await msg.reply_text(f"💻 Активен {sid} — следующие `/exec` пойдут туда. Введи команду.")
                awaiting_exec.add(uid)
        elif data.startswith("win:"):
            _, act, hwnd = data.split(":",2)
            try:
                import ctypes
                hwnd = int(hwnd)
                if act == "front":
                    ctypes.windll.user32.SetForegroundWindow(hwnd)
                    await msg.reply_text(f"🔝 Front {hwnd}")
                elif act == "close":
                    ctypes.windll.user32.PostMessageW(hwnd, 0x0010, 0, 0)
                    await msg.reply_text(f"❌ Close sent {hwnd}")
            except Exception as e: await msg.reply_text(f"❌ {e}")
        elif data.startswith("opchoose:"):
            await msg.reply_text(f"📂 Открываю {data[9:][:40]} — запусти OpenCode и выбери workspace вручную (путь скопирован).")
        elif data.startswith("srv:"):
            act = data[4:]
            if act == "start":
                subprocess.Popen([sys.executable, "server_nocors.py"], cwd=str(Path(__file__).parent))
                await msg.reply_text("▶️ server_nocors.py started")
            elif act == "restart":
                if psutil:
                    for p in psutil.process_iter(['pid','name','cmdline']):
                        try:
                            cl=" ".join(p.info['cmdline'] or [])
                            if "server_nocors" in cl: psutil.Process(p.info['pid']).kill()
                        except: pass
                    time.sleep(1)
                subprocess.Popen([sys.executable, "server_nocors.py"], cwd=str(Path(__file__).parent))
                await msg.reply_text("🔄 Restarted")
            elif act == "stop":
                killed=0
                if psutil:
                    for p in psutil.process_iter(['pid','name','cmdline']):
                        try:
                            cl=" ".join(p.info['cmdline'] or [])
                            if "server_nocors" in cl: psutil.Process(p.info['pid']).kill(); killed+=1
                        except: pass
                await msg.reply_text(f"⏹ Stopped {killed}")
            elif act == "status": await server_cmd(update, ctx)
            elif act == "logs": await msg.reply_text("📜 Логи смотри в консоли где запущен python server_nocors.py")
        else: await msg.reply_text(f"Unknown: {data}")
    except Exception as e: await msg.reply_text(f"❌ {e}")

def sanitize(s: str) -> str:
    # Telegram via proxy fails on \u2800 braille, replace
    return s.replace("\u2800", " ").replace("\u200b","").replace("\x00","")

async def on_text(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not is_allowed(update.effective_user.id): return
    uid = update.effective_user.id
    txt_raw = update.message.text or ""
    txt = sanitize(txt_raw)
    # live commands: "открой файл C:\..." / "open file C:\..."
    low = txt.lower().strip()
    low_raw = txt_raw.lower().strip()
    if low.startswith("открой") or low.startswith("open"):
        m = re.search(r'(?:открой|open)\s+(?:файл|папку|file|folder)?\s*(.+)', txt_raw, re.IGNORECASE)
        raw = m.group(1).strip().strip('"').strip("'") if m else ""
        if raw:
            p = Path(raw)
            try:
                if p.exists():
                    if p.is_dir():
                        os.startfile(str(p)) if os.name=="nt" else subprocess.Popen(["xdg-open", str(p)])
                        await update.message.reply_text(f"📂 Открыл папку `{sanitize(str(p))}`")
                    else:
                        os.startfile(str(p)) if os.name=="nt" else subprocess.Popen(["xdg-open", str(p)])
                        await update.message.reply_text(f"📄 Открыл файл `{sanitize(str(p))}`")
                    d, e = capture_screen_bytes()
                    if not e: await update.message.reply_photo(photo=d, caption=f"🖥 После открытия {sanitize(p.name)}")
                else:
                    await update.message.reply_text(f"❌ Не найден: `{sanitize(str(p))}`")
            except Exception as e: await update.message.reply_text(f"❌ {sanitize(str(e))}")
            return
    if low.startswith("скрин") or low == "screen" or low.startswith("снимок"):
        d, e = capture_screen_bytes()
        if e: await update.message.reply_text(f"❌ {e}")
        else: await update.message.reply_photo(photo=d, caption="🖥 Моментальный скрин")
        return
    if uid in awaiting_cmd:
        awaiting_cmd.discard(uid)
        await update.message.reply_text(f"⏳ Executing in PowerShell: `{txt}`", parse_mode="Markdown")
        try:
            r = subprocess.run(["powershell.exe", "-NoProfile", "-Command", txt_raw], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30, cwd=str(Path.home()), creationflags=subprocess.CREATE_NO_WINDOW if os.name=="nt" else 0)
            out = (r.stdout or "") + ("\n"+r.stderr if r.stderr else "")
            if not out: out = f"(exit {r.returncode})"
            out = sanitize(out)[-3800:]
            await update.message.reply_text(f"```\n{out}\n```\nExit: {r.returncode}", parse_mode="Markdown")
        except Exception as e: await update.message.reply_text(f"❌ {sanitize(str(e))}")
        return
    if uid in awaiting_exec:
        awaiting_exec.discard(uid)
        await update.message.reply_text(f"⏳ Exec (persistent, no new window): `{txt}`", parse_mode="Markdown")
        try:
            out = sanitize(exec_persistent(txt_raw, uid))
            await update.message.reply_text(f"```\n{out[-3800:]}\n```", parse_mode="Markdown")
        except Exception as e: await update.message.reply_text(f"❌ {sanitize(str(e))}")
        return
    if txt.startswith("/"): return
    if uid in term_sessions and term_sessions[uid]:
        pass

async def error_handler(update, ctx):
    print(f"error: {ctx.error}")

def main():
    import asyncio
    while True:
        try:
            builder = Application.builder().token(BOT_TOKEN)
            if PROXY_URL:
                from telegram.request import HTTPXRequest
                builder = builder.request(HTTPXRequest(proxy=PROXY_URL))
            app = builder.build()
            app.add_handler(CommandHandler("start", start))
            app.add_handler(CommandHandler("help", help_cmd))
            app.add_handler(CommandHandler("screen", screen_cmd))
            app.add_handler(CommandHandler("sysinfo", sysinfo_cmd))
            app.add_handler(CommandHandler("files", files_cmd))
            app.add_handler(CommandHandler("exec", exec_cmd))
            app.add_handler(CommandHandler("cmd", cmd_winr))
            app.add_handler(CommandHandler("opencode", opencode_cmd))
            app.add_handler(CommandHandler("server", server_cmd))
            app.add_handler(CommandHandler("lock", lock_cmd))
            app.add_handler(CommandHandler("shutdown", shutdown_cmd))
            app.add_handler(CommandHandler("reboot", reboot_cmd))
            app.add_handler(CommandHandler("volume", volume_cmd))
            app.add_handler(CommandHandler("clipboard", clipboard_cmd))
            app.add_handler(CommandHandler("download", download_cmd))
            app.add_handler(CommandHandler("ps", ps_cmd))
            app.add_handler(CommandHandler("processes", ps_cmd))
            app.add_handler(CallbackQueryHandler(on_callback))
            app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))
            app.add_error_handler(error_handler)
            print(f"[BOT] Starting for {ALLOWED_USER}... (retry forever)")
            app.run_polling(allowed_updates=Update.ALL_TYPES, drop_pending_updates=True, close_loop=False, bootstrap_retries=-1)
        except Exception as e:
            print(f"[BOT] Crash: {e} — retry in 10s")
            time.sleep(10)
        else:
            print("[BOT] Stopped — retry in 10s")
            time.sleep(10)

if __name__ == "__main__":
    main()
