"""Fallback HTTP server - no fastapi needed, pure stdlib + mss/pyautogui, CORS fixed for GH Pages"""
import base64, io, os, platform, socket, subprocess, json
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
import mss
import pyautogui
from PIL import Image

HOST="0.0.0.0"; PORT=8765; PASSWORD="admin123"
JPEG_QUALITY=65; SCREEN_SCALE=0.6
pyautogui.FAILSAFE=False
sct=mss.mss()

def capture():
    try:
        mon=sct.monitors[1]; shot=sct.grab(mon)
        img=Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        nw=int(img.width*SCREEN_SCALE); nh=int(img.height*SCREEN_SCALE)
        img=img.resize((nw,nh), Image.Resampling.LANCZOS)
        buf=io.BytesIO(); img.save(buf, format="JPEG", quality=JPEG_QUALITY)
        return buf.getvalue(),nw,nh
    except Exception as e:
        print(e); img=Image.new("RGB",(960,540),(10,10,26)); buf=io.BytesIO(); img.save(buf,format="JPEG",quality=40); return buf.getvalue(),960,540

def sysinfo():
    try:
        import psutil
        cpu=psutil.cpu_percent(interval=0.2); mem=psutil.virtual_memory(); disk=psutil.disk_usage("/")
        sw,sh=pyautogui.size()
        return {"os":platform.system(),"os_version":platform.version(),"hostname":platform.node(),"cpu_percent":cpu,"ram_percent":mem.percent,"ram_used_gb":round(mem.used/1024**3,1),"ram_total_gb":round(mem.total/1024**3,1),"disk_percent":disk.percent,"disk_used_gb":round(disk.used/1024**3,1),"disk_total_gb":round(disk.total/1024**3,1),"screen_width":sw,"screen_height":sh}
    except: sw,sh=pyautogui.size(); return {"os":platform.system(),"os_version":platform.version(),"hostname":platform.node(),"screen_width":sw,"screen_height":sh}

def list_dir(p):
    try:
        pa=Path(p).expanduser().resolve()
        if not pa.exists(): return {"error":"Path not found","path":p}
        if not pa.is_dir(): return {"error":"Not a dir","path":str(pa)}
        items=[]
        for it in sorted(pa.iterdir(), key=lambda x:(not x.is_dir(), x.name.lower())):
            try: st=it.stat(); items.append({"name":it.name,"is_dir":it.is_dir(),"size":st.st_size,"path":str(it)})
            except: items.append({"name":it.name,"is_dir":it.is_dir(),"size":0,"path":str(it)})
        return {"path":str(pa),"items":items}
    except Exception as e: return {"error":str(e)}

def read_file(p):
    try:
        pa=Path(p).expanduser().resolve()
        if pa.stat().st_size>1024*1024: return {"error":"File too large"}
        return {"content":pa.read_text(encoding="utf-8",errors="replace"),"path":str(pa)}
    except Exception as e: return {"error":str(e)}

def run_cmd(cmd):
    try:
        r=subprocess.run(cmd,shell=True,capture_output=True,text=True,timeout=30,cwd=os.path.expanduser("~"))
        return {"stdout":r.stdout[-6000:],"stderr":r.stderr[-3000:],"returncode":r.returncode}
    except Exception as e: return {"error":str(e)}

def scale(x,y,sw,sh,cw,ch):
    return int(x/cw*sw) if cw else int(x), int(y/ch*sh) if ch else int(y)

def handle_input(d):
    a=d.get("action")
    if a in ("mouse_move","mouse_click","mouse_down","mouse_up"):
        sw,sh=pyautogui.size(); rx,ry=scale(d.get("x",0),d.get("y",0),sw,sh,d.get("cw",1),d.get("ch",1)); btn=d.get("button","left")
        if a=="mouse_move": pyautogui.moveTo(rx,ry,_pause=False)
        elif a=="mouse_click": pyautogui.click(rx,ry,button=btn,_pause=False)
        elif a=="mouse_down": pyautogui.mouseDown(rx,ry,button=btn,_pause=False)
        elif a=="mouse_up": pyautogui.mouseUp(rx,ry,button=btn,_pause=False)
    elif a=="scroll":
        dx,dy=d.get("dx",0),d.get("dy",0)
        if dy: pyautogui.scroll(int(-dy*3),_pause=False)
        if dx: pyautogui.keyDown('shift',_pause=False); pyautogui.scroll(int(-dx*3),_pause=False); pyautogui.keyUp('shift',_pause=False)
    elif a in ("key_press","key","type"):
        k=d.get("key",""); 
        if not k: return
        spec={'enter':'enter','backspace':'backspace','tab':'tab','escape':'escape','delete':'delete','space':'space','up':'up','down':'down','left':'left','right':'right'}
        if k.lower() in spec: pyautogui.press(spec[k.lower()],_pause=False)
        elif len(k)==1:
            try:
                import ctypes; u=ctypes.windll.user32; inp=ctypes.wintypes.INPUT(); inp.type=1; inp.ki.wScan=ord(k); inp.ki.dwFlags=0x0004; u.SendInput(1,ctypes.byref(inp),ctypes.sizeof(inp)); inp.ki.dwFlags=0x0006; u.SendInput(1,ctypes.byref(inp),ctypes.sizeof(inp))
            except: pyautogui.write(k,interval=0)
        else: pyautogui.press(k,_pause=False)

class H(BaseHTTPRequestHandler):
    def log_message(self,f,*a): pass
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin","*")
        self.send_header("Access-Control-Allow-Methods","GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers","Content-Type, Authorization")
        super().end_headers()
    def do_OPTIONS(self):
        self.send_response(204); self.end_headers()
    def do_GET(self):
        if self.path in ("/","/api/ping"):
            self.send_response(200); self.send_header("Content-type","application/json"); self.end_headers()
            self.wfile.write(json.dumps({"status":"ok","version":"2.0-nocors"}).encode()); return
        self.send_response(404); self.end_headers()
    def do_POST(self):
        length=int(self.headers.get("Content-Length",0)); body=self.rfile.read(length) if length else b"{}"
        try: data=json.loads(body) if body else {}
        except: data={}
        path=self.path.split("?")[0]
        action=data.get("action","")
        # normalize /api/auth etc -> action
        if path=="/api/auth": action="auth"
        elif path=="/api/screenshot": action="screenshot"
        elif path=="/api/sysinfo": action="sysinfo"
        elif path=="/api/list_dir": action="list_dir"
        elif path=="/api/read_file": action="read_file"
        elif path=="/api/run_cmd": action="run_cmd"
        elif path=="/api/input": handle_input(data); self.send_response(200); self.send_header("Content-type","application/json"); self.end_headers(); self.wfile.write(json.dumps({"ok":True}).encode()); return

        res={}
        if action=="auth":
            if data.get("password")==PASSWORD: res={"action":"auth_ok","info":sysinfo()}
            else: self.send_response(401); self.send_header("Content-type","application/json"); self.end_headers(); self.wfile.write(json.dumps({"action":"auth_fail"}).encode()); return
        elif action=="screenshot":
            b,w,h=capture(); res={"action":"screenshot","image":base64.b64encode(b).decode(),"width":w,"height":h}
        elif action=="sysinfo": res={"action":"sysinfo",**sysinfo()}
        elif action=="list_dir": res={"action":"dir_list",**list_dir(data.get("path",os.path.expanduser("~")))}
        elif action=="read_file": res={"action":"file_content",**read_file(data.get("path",""))}
        elif action=="run_cmd": res={"action":"cmd_result",**run_cmd(data.get("cmd",""))}
        elif action in ("mouse_move","mouse_click","mouse_down","mouse_up","scroll","key_press","key","type"): handle_input(data); res={"ok":True}
        else: res={"action":"error","message":"unknown "+action}
        self.send_response(200); self.send_header("Content-type","application/json"); self.end_headers()
        self.wfile.write(json.dumps(res).encode())

def ip():
    try:
        s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(("8.8.8.8",80)); v=s.getsockname()[0]; s.close(); return v
    except: return "127.0.0.1"

if __name__=="__main__":
    print(f"NEON NOCORS server http://{ip()}:{PORT}  password {PASSWORD}")
    HTTPServer((HOST,PORT),H).serve_forever()
