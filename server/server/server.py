"""
Remote Desktop Server - Rebuilt from scratch
Cyberpunk edition | FastAPI + WebSocket + HTTP polling fallback
"""
import asyncio
import base64
import io
import os
import platform
import socket
import subprocess
import time
from pathlib import Path
from typing import Optional

import mss
import pyautogui
from PIL import Image
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

# ── Config ──────────────────────────────────────────────────────────
HOST = "0.0.0.0"
PORT = 8765
PASSWORD = "admin123"
JPEG_QUALITY = 65
SCREEN_SCALE = 0.6
FPS = 30

pyautogui.FAILSAFE = False

# ── App ─────────────────────────────────────────────────────────────
app = FastAPI(title="Remote Desktop Cyberpunk", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Explicit OPTIONS handler for GH Pages preflight (cloudflared needs it)
@app.options("/{path:path}")
async def options_handler(path: str, request: Request):
    return JSONResponse(
        {},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
    )

# ── Screen capture ──────────────────────────────────────────────────
_sct = mss.mss()

def capture_screen():
    try:
        mon = _sct.monitors[1]
        shot = _sct.grab(mon)
        img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        nw = int(img.width * SCREEN_SCALE)
        nh = int(img.height * SCREEN_SCALE)
        img = img.resize((nw, nh), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=JPEG_QUALITY)
        return buf.getvalue(), nw, nh
    except Exception as e:
        print(f"[screen] error: {e}")
        img = Image.new("RGB", (960, 540), (10, 10, 26))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=40)
        return buf.getvalue(), 960, 540

def scale_coords(x, y, sw, sh, cw, ch):
    if cw == 0 or ch == 0:
        return int(x), int(y)
    return int(x / cw * sw), int(y / ch * sh)

# ── System helpers ──────────────────────────────────────────────────
def get_system_info():
    try:
        import psutil
        cpu = psutil.cpu_percent(interval=0.2)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        sw, sh = pyautogui.size()
        return {
            "os": platform.system(),
            "os_version": platform.version(),
            "hostname": platform.node(),
            "cpu_percent": cpu,
            "ram_percent": mem.percent,
            "ram_used_gb": round(mem.used / (1024**3), 1),
            "ram_total_gb": round(mem.total / (1024**3), 1),
            "disk_percent": disk.percent,
            "disk_used_gb": round(disk.used / (1024**3), 1),
            "disk_total_gb": round(disk.total / (1024**3), 1),
            "screen_width": sw,
            "screen_height": sh,
        }
    except Exception:
        sw, sh = pyautogui.size()
        return {
            "os": platform.system(),
            "os_version": platform.version(),
            "hostname": platform.node(),
            "screen_width": sw,
            "screen_height": sh,
        }

def list_directory(path: str):
    try:
        p = Path(path).expanduser().resolve()
        if not p.exists():
            return {"error": "Path not found", "path": path}
        if not p.is_dir():
            return {"error": "Not a directory", "path": str(p)}
        items = []
        for item in sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
            try:
                st = item.stat()
                items.append({
                    "name": item.name,
                    "is_dir": item.is_dir(),
                    "size": st.st_size,
                    "modified": st.st_mtime,
                    "path": str(item),
                })
            except:
                items.append({"name": item.name, "is_dir": item.is_dir(), "size": 0, "modified": 0, "path": str(item)})
        # parent
        parent = str(p.parent) if str(p.parent) != str(p) else None
        return {"path": str(p), "parent": parent, "items": items}
    except Exception as e:
        return {"error": str(e)}

def read_file(path: str, max_size=1024*1024):
    try:
        p = Path(path).expanduser().resolve()
        if not p.exists():
            return {"error": "File not found"}
        if p.stat().st_size > max_size:
            return {"error": "File too large (>1MB)"}
        try:
            content = p.read_text(encoding="utf-8", errors="replace")
            return {"content": content, "path": str(p)}
        except:
            return {"error": "Binary file"}
    except Exception as e:
        return {"error": str(e)}

def run_command(cmd: str, cwd: Optional[str] = None):
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True, timeout=30,
            cwd=cwd or os.path.expanduser("~")
        )
        return {
            "stdout": result.stdout[-6000:] if result.stdout else "",
            "stderr": result.stderr[-3000:] if result.stderr else "",
            "returncode": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"error": "Timeout 30s"}
    except Exception as e:
        return {"error": str(e)}

# ── Input handlers ──────────────────────────────────────────────────
def handle_mouse(data: dict, action: str):
    sw, sh = pyautogui.size()
    x, y, cw, ch = data.get("x", 0), data.get("y", 0), data.get("cw", 1), data.get("ch", 1)
    rx, ry = scale_coords(x, y, sw, sh, cw, ch)
    btn = data.get("button", "left")
    if action == "mouse_move":
        pyautogui.moveTo(rx, ry, _pause=False)
    elif action == "mouse_click":
        pyautogui.click(rx, ry, button=btn, _pause=False)
    elif action == "mouse_down":
        pyautogui.mouseDown(rx, ry, button=btn, _pause=False)
    elif action == "mouse_up":
        pyautogui.mouseUp(rx, ry, button=btn, _pause=False)

def handle_scroll(data: dict):
    dx, dy = data.get("dx", 0), data.get("dy", 0)
    if dy != 0:
        pyautogui.scroll(int(-dy * 3), _pause=False)
    if dx != 0:
        pyautogui.keyDown('shift', _pause=False)
        pyautogui.scroll(int(-dx * 3), _pause=False)
        pyautogui.keyUp('shift', _pause=False)

def handle_key(data: dict):
    key = data.get("key", "")
    if not key:
        return
    special = {'enter':'enter','backspace':'backspace','tab':'tab','escape':'escape',
               'delete':'delete','space':'space','up':'up','down':'down',
               'left':'left','right':'right','home':'home','end':'end',
               'pageup':'pageup','pagedown':'pagedown','capslock':'capslock'}
    kl = key.lower()
    if kl in special:
        pyautogui.press(special[kl], _pause=False)
    elif len(key) == 1:
        # Use unicode SendInput for better language support
        try:
            import ctypes
            user32 = ctypes.windll.user32
            inp = ctypes.wintypes.INPUT()
            inp.type = 1
            inp.ki.wScan = ord(key)
            inp.ki.dwFlags = 0x0004
            inp.ki.time = 0
            inp.ki.dwExtraInfo = 0
            user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(inp))
            inp.ki.dwFlags = 0x0004 | 0x0002
            user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(inp))
        except:
            try:
                import pyperclip
                old = pyperclip.paste()
                pyperclip.copy(key)
                pyautogui.hotkey('ctrl', 'v')
                time.sleep(0.02)
                pyperclip.copy(old)
            except:
                pyautogui.write(key, interval=0)
    else:
        pyautogui.press(key, _pause=False)

# ── HTTP API ────────────────────────────────────────────────────────
@app.get("/api/ping")
async def ping():
    return {"status": "ok", "version": "2.0"}

@app.post("/api/auth")
async def auth(req: Request):
    data = await req.json()
    if data.get("password") == PASSWORD:
        return {"action": "auth_ok", "info": get_system_info()}
    return JSONResponse({"action": "auth_fail"}, status_code=401)

@app.post("/api/screenshot")
async def screenshot(req: Request):
    data = await req.json() if await req.body() else {}
    # optional password check via header
    img_bytes, w, h = capture_screen()
    b64 = base64.b64encode(img_bytes).decode()
    return {"action": "screenshot", "image": b64, "width": w, "height": h}

@app.post("/api/sysinfo")
async def sysinfo():
    return {"action": "sysinfo", **get_system_info()}

@app.post("/api/list_dir")
async def api_list_dir(req: Request):
    data = await req.json()
    return {"action": "dir_list", **list_directory(data.get("path", os.path.expanduser("~")))}

@app.post("/api/read_file")
async def api_read_file(req: Request):
    data = await req.json()
    return {"action": "file_content", **read_file(data.get("path", ""))}

@app.post("/api/run_cmd")
async def api_run_cmd(req: Request):
    data = await req.json()
    return {"action": "cmd_result", **run_command(data.get("cmd", ""), data.get("cwd"))}

@app.post("/api/input")
async def api_input(req: Request):
    data = await req.json()
    action = data.get("action")
    if action in ("mouse_move", "mouse_click", "mouse_down", "mouse_up"):
        handle_mouse(data, action)
    elif action == "scroll":
        handle_scroll(data)
    elif action in ("key_press", "key", "type"):
        handle_key(data)
    return {"ok": True}

# Generic fallback for old client compatibility
@app.post("/api")
async def api_generic(req: Request):
    data = await req.json()
    action = data.get("action", "")
    if action == "auth":
        if data.get("password") == PASSWORD:
            return {"action": "auth_ok", "info": get_system_info()}
        return JSONResponse({"action": "auth_fail"}, status_code=401)
    if action == "screenshot":
        img_bytes, w, h = capture_screen()
        return {"action": "screenshot", "image": base64.b64encode(img_bytes).decode(), "width": w, "height": h}
    if action == "sysinfo":
        return {"action": "sysinfo", **get_system_info()}
    if action == "list_dir":
        return {"action": "dir_list", **list_directory(data.get("path", os.path.expanduser("~")))}
    if action == "read_file":
        return {"action": "file_content", **read_file(data.get("path", ""))}
    if action == "run_cmd":
        return {"action": "cmd_result", **run_command(data.get("cmd", ""), data.get("cwd"))}
    if action in ("mouse_move", "mouse_click", "mouse_down", "mouse_up"):
        handle_mouse(data, action)
        return {"ok": True}
    if action == "scroll":
        handle_scroll(data)
        return {"ok": True}
    if action in ("key_press", "key", "type", "key_down", "key_up"):
        handle_key(data)
        return {"ok": True}
    return {"action": "error", "message": "unknown action"}

# ── WebSocket ───────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    authenticated = False
    client_id = id(ws)
    print(f"[+] WS connected {client_id}")
    try:
        while True:
            try:
                data = await ws.receive_json()
            except:
                # binary or text fallback
                try:
                    raw = await ws.receive_text()
                    import json
                    data = json.loads(raw)
                except:
                    continue
            action = data.get("action")
            if action == "auth":
                if data.get("password") == PASSWORD:
                    authenticated = True
                    await ws.send_json({"action": "auth_ok", "info": get_system_info()})
                    print(f"[✓] WS auth {client_id}")
                else:
                    await ws.send_json({"action": "auth_fail"})
                continue
            if not authenticated:
                await ws.send_json({"action": "error", "message": "Not authenticated"})
                continue

            if action == "start_screen":
                asyncio.create_task(ws_screen_stream(ws))
                continue
            if action in ("mouse_move", "mouse_click", "mouse_down", "mouse_up"):
                handle_mouse(data, action)
            elif action == "scroll":
                handle_scroll(data)
            elif action in ("key_press", "key", "type"):
                handle_key(data)
            elif action == "list_dir":
                await ws.send_json({"action": "dir_list", **list_directory(data.get("path", os.path.expanduser("~")))})
            elif action == "read_file":
                await ws.send_json({"action": "file_content", **read_file(data.get("path", ""))})
            elif action == "run_cmd":
                await ws.send_json({"action": "cmd_result", **run_command(data.get("cmd", ""), data.get("cwd"))})
            elif action == "sysinfo":
                await ws.send_json({"action": "sysinfo", **get_system_info()})
            elif action == "screenshot":
                img_bytes, w, h = capture_screen()
                b64 = base64.b64encode(img_bytes).decode()
                await ws.send_json({"action": "screenshot", "image": b64, "width": w, "height": h})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[WS] error {client_id}: {e}")
    finally:
        print(f"[-] WS disconnected {client_id}")

async def ws_screen_stream(ws: WebSocket):
    interval = 1.0 / FPS
    try:
        while True:
            img_bytes, w, h = capture_screen()
            # Send as binary: 4 bytes w + 4 bytes h + jpeg
            header = w.to_bytes(4, 'big') + h.to_bytes(4, 'big')
            await ws.send_bytes(header + img_bytes)
            await asyncio.sleep(interval)
    except:
        pass

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

if __name__ == "__main__":
    ip = get_local_ip()
    sw, sh = pyautogui.size()
    print(f"""
╔══════════════════════════════════════════════════╗
║     REMOTE DESKTOP CYBERPUNK v2.0                ║
╠══════════════════════════════════════════════════╣
║  Password : {PASSWORD:<30} ║
║  Screen   : {sw}x{sh:<30} ║
║  Mode     : FastAPI + WS + HTTP polling           ║
╠══════════════════════════════════════════════════╣
║  Local    : http://{ip}:{PORT:<27} ║
║  WS       : ws://{ip}:{PORT}/ws{' '*(24-len(str(PORT)))} ║
╚══════════════════════════════════════════════════╝
""")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
