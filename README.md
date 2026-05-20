# CNC Controller

A full-featured desktop application for controlling CNC machines running [grbl 1.1](https://github.com/gnea/grbl) or [grblHAL](https://github.com/grblHAL) firmware. The streaming buffer auto-tunes itself (127 bytes for standard grbl, 1024 for grblHAL) once the welcome banner is received. Built with Electron, React, and TypeScript.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Download

**[→ Download the latest installer](https://github.com/Tapnowater00/cnc-controller/releases/latest)**

Run the `.exe` and follow the installer. No additional software required.

> Windows SmartScreen may show a warning on first run — click **More info → Run anyway**. This is normal for apps without a paid code signing certificate.

---

## Features

### Machine Control
- **Real-time DRO** — Work and machine position at 6Hz, feed rate, spindle RPM, buffer status
- **Jogging** — Arrow-pad with configurable step sizes (0.001mm → 100mm), continuous jog mode, safe-Z lift
- **Overrides** — Live feed, rapid, and spindle override controls with visual bars
- **Quick actions** — Feed Hold, Cycle Start, Soft Reset always visible
- **Alarm handling** — Alarm banner with code descriptions and one-click clear

### G-code Sender
- Open `.nc`, `.gcode`, `.tap` files
- Character-counting streaming protocol (not simple ok-wait) for maximum throughput
- Real-time progress bar, ETA countdown, current line highlight
- Pause / Resume / Stop with feed hold integration
- Job history (last 10 jobs)

### 3D Visualizer
- Three.js toolpath preview — rapids in gray, cuts in green
- Orbit, pan, zoom with mouse
- Live tool position marker
- Machine envelope box from profile dimensions

### CAM Workspace
- **2D canvas** — Draw rectangles, circles, and polylines directly on a mm grid
- **SVG / DXF import** — Import existing designs
- **Operations** — Profile, Pocket, Drill, Engrave with full depth and feed control
- **Toolpath generation** — 2.5D contour and raster pocket strategies
- **Tool library** — Save and manage end mills, V-bits, ball nose cutters
- **Feeds & speeds calculator** — Material presets, SFM-based RPM, chip load
- **G-code export** — Preview, save `.nc`, or send directly to the sender

### Probing
- **Z probe** — Touch plate with configurable thickness and approach speed
- **XYZ corner** — Three-axis corner finding
- **Bore center** — Four-probe bore center finding

### Extras
- **Macro grid** — 12 programmable macros with F1–F8 keyboard shortcuts
- **Console** — Full serial log with color coding, timestamps, command history
- **Settings editor** — Browse and edit all `$$` parameters in-app (grbl 1.1 / grblHAL)
- **Keyboard shortcuts** — Arrow keys jog, Space = feed hold, R = cycle start, Esc = reset
- **Auto-connect** — Reconnects to last port on startup
- **Persistent settings** — Port, preferences, macros, and job history saved across sessions

---

## Build from Source

**Requirements**
- [Node.js](https://nodejs.org) v18+
- [Git](https://git-scm.com)
- Windows Build Tools (for serialport native module)

```bash
# Install build tools (run once, as administrator)
npm install -g windows-build-tools
```

```bash
git clone https://github.com/Tapnowater00/cnc-controller
cd cnc-controller
npm install
npm run dev        # development mode with hot reload
```

**Build installer**
```bash
npm run dist       # outputs to dist/
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Electron 33 |
| Build | electron-vite |
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS |
| State | Zustand |
| Serial | serialport v12 |
| 3D | @react-three/fiber + Three.js |
| Layout | react-resizable-panels |
| Storage | electron-store |

---

## Connecting to Your Machine

1. Plug in your grbl 1.1 or grblHAL controller via USB
2. Select the COM port and baud rate (default 115200) in the connection bar
3. Click **Connect**
4. The DRO will populate and status polling begins automatically

---

## iPad / Web Client (Raspberry Pi 5 bridge)

You can run the same UI on an iPad (or any tablet / laptop browser) by hosting
the web build on a Raspberry Pi 5 that sits next to the CNC. The Pi handles
the USB serial connection to grblHAL; the iPad is a thin client over Wi‑Fi.

### Build

```bash
npm install
npm run build:pi     # builds out/web (static UI) and out/server (Node bridge)
```

Copy `out/` and `package.json` to the Pi (or `git clone` and build there — a
Pi 5 builds the whole thing in well under a minute).

### Run on the Pi

```bash
# First launch only: seed the shared password (hashed into data/store.json).
CNC_PASSWORD='choose-a-strong-password' npm run start:server

# Subsequent launches:
npm run start:server
```

Defaults: listens on `0.0.0.0:8080`, stores settings in `./data/store.json`,
serves the web UI from `out/web/`. Override with env vars:

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `8080` | HTTP(S) + WebSocket port |
| `HOST` | `0.0.0.0` | Bind address |
| `STORE_PATH` | `./data/store.json` | Settings, macros, job history, hashed password |
| `STATIC_DIR` | `out/web` (next to the bundle) | Built renderer to serve |
| `TLS_CERT`, `TLS_KEY` | _(unset)_ | If both point to existing files, the server speaks HTTPS instead of HTTP |
| `CNC_PASSWORD` | _(unset)_ | Required only on the very first launch to seed the password hash |

Run it under `systemd` so it survives reboots:

```ini
# /etc/systemd/system/cnc-controller.service
[Unit]
Description=CNC Controller (grblHAL web bridge)
After=network-online.target

[Service]
WorkingDirectory=/home/pi/cnc-controller
Environment=PORT=8080
ExecStart=/usr/bin/npm run start:server
Restart=on-failure
User=pi

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now cnc-controller
```

### Open it on the iPad

1. On the Pi, find the LAN address: `hostname -I`
2. On the iPad, open Safari → `http://<pi-ip>:8080` (or `https://` if TLS is on)
3. Enter the password — Safari remembers it via the bearer token in `localStorage`
4. Share menu → **Add to Home Screen** for a fullscreen, app-like icon

### Reachable from anywhere

The server's password + bearer-token auth runs everywhere, but for real
remote access you also need TLS. Two reasonable paths:

- **Easy (recommended)** — install [Tailscale](https://tailscale.com/) on the
  Pi and the iPad. They get private IPs over an encrypted mesh and you connect
  to `http://<pi-tailscale-name>:8080` from anywhere as if you were on the LAN.
  No port forwarding, no certificate management.
- **Direct exposure** — point a domain at your home IP, forward port 443 to
  the Pi, and run [Caddy](https://caddyserver.com/) or `nginx` in front for
  automatic Let's Encrypt certificates and reverse-proxy to `localhost:8080`.
  Alternatively, set `TLS_CERT` and `TLS_KEY` on the server itself.

Either way, never expose the Pi over plain HTTP outside the LAN — the bearer
token would travel in clear text.

### Dev workflow

```bash
# In one terminal: backend
CNC_PASSWORD=dev npm run dev:server

# In another: Vite dev server with HMR for the renderer
npm run dev:web
```

Then browse to `http://localhost:5174`. Vite proxies `/api` and `/ws` to the
backend, so login + WebSocket Just Work.

---

## License

MIT
