import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import { SerialManager } from './serial/SerialManager'
import { GrblStreamer } from './serial/GrblStreamer'
import { registerIpcHandlers } from './ipc/handlers'

const store = new Store({
  defaults: {
    macros: [],
    machineProfiles: [],
    jobHistory: [],
    lastPort: '',
    lastBaud: 115200,
    preferences: {
      safeZ: 5,
      probeThickness: 15,
      probeApproachSpeed: 100,
      probeRetract: 2,
      autoConnect: false,
      units: 'mm',
    },
  },
})

const serial = new SerialManager()
const streamer = new GrblStreamer(serial)

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#09090b',
    titleBarStyle: 'default',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  })

  win.on('ready-to-show', () => {
    win.maximize()
    win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  registerIpcHandlers(serial, streamer, store as any, win)

  return win
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  serial.disconnect().catch(() => {})
  if (process.platform !== 'darwin') app.quit()
})
