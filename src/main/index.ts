import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import { SerialManager } from './serial/SerialManager'
import { GrblStreamer } from './serial/GrblStreamer'
import { UpdateManager } from './updater/UpdateManager'
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
const updater = new UpdateManager('Tapnowater00', 'cnc-controller')

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

  registerIpcHandlers(serial, streamer, store as any, win, updater)

  return win
}

app.whenReady().then(() => {
  const win = createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  // Kick off the first update check 5 s after launch so it doesn't compete
  // with port enumeration and the renderer mount.
  if (!is.dev) {
    setTimeout(() => updater.check().catch(() => {}), 5000)
  }
})

app.on('window-all-closed', () => {
  serial.disconnect().catch(() => {})
  if (process.platform !== 'darwin') app.quit()
})
