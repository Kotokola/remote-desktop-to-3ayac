# NEON DESK v2.0 — Cyberpunk Remote Desktop

Пересобран с нуля: Next.js 14 + Tailwind + FastAPI.

## Структура
```
remote-desktop-new/
├── server/
│   ├── server.py        # FastAPI + WS + HTTP polling (порт 8765)
│   └── requirements.txt
├── client/              # Next.js App Router
│   ├── app/page.tsx     # Киберпанк UI
│   ├── app/globals.css
│   └── package.json
└── README.md
```

## Запуск

### Сервер (Python)
```powershell
cd server
pip install -r requirements.txt
python server.py
# http://localhost:8765  ws://localhost:8765/ws
```

Конфиг в server.py: PASSWORD, PORT, JPEG_QUALITY, SCREEN_SCALE, FPS.

### Клиент (Next.js)
```powershell
cd client
npm install
npm run dev    # http://localhost:3000
npm run build && npm start  # prod
```

В логине введи: `http://192.168.x.x:8765` + пароль `admin123`.

## Фичи
- Экран ~10 FPS (HTTP) / до 30 FPS (WS), touch/mouse, скролл
- Файлы: навигация, превью
- Терминал: run_cmd
- Система: CPU/RAM/Disk/OS/host/screen
- Кибер-клавиатура RU/EN

## Дизайн
Киберпанк: тёмный #050510, неон #00f0ff / #ff00a0, Orbitron + JetBrains Mono, grid + scanline + glow.
