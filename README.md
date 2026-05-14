# CNC Controller

A full-featured desktop application for controlling CNC machines running [grblHAL](https://github.com/grblHAL) firmware. Built with Electron, React, and TypeScript.

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
- **Settings editor** — Browse and edit all grblHAL `$$` parameters in-app
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

1. Plug in your grblHAL controller via USB
2. Select the COM port and baud rate (default 115200) in the connection bar
3. Click **Connect**
4. The DRO will populate and status polling begins automatically

---

## License

MIT
