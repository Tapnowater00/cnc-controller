import { ipcMain, dialog, BrowserWindow, WebContents, app } from 'electron'
import { readFile } from 'fs/promises'
import { SerialManager } from '../serial/SerialManager'
import { GrblStreamer } from '../serial/GrblStreamer'
import { UpdateManager } from '../updater/UpdateManager'
import Store from 'electron-store'

export function registerIpcHandlers(
  serial: SerialManager,
  streamer: GrblStreamer,
  store: Store,
  win: BrowserWindow,
  updater: UpdateManager,
) {
  const wc: WebContents = win.webContents

  // Forward all serial data to renderer AND feed ok to streamer
  serial.on('data', (line: string) => {
    wc.send('serial:data', line)
    if (line === 'ok') streamer.onOk()
  })

  serial.on('connectionChange', (connected: boolean) => {
    wc.send('serial:connectionChange', connected)
  })

  serial.on('error', (err: Error) => {
    wc.send('serial:error', err.message)
  })

  streamer.on('progress', (p) => wc.send('stream:progress', p))
  streamer.on('complete', () => wc.send('stream:complete'))
  streamer.on('error', (e) => wc.send('stream:error', e))

  // Serial
  ipcMain.handle('serial:listPorts', () => serial.listPorts())
  ipcMain.handle('serial:connect', (_e, path: string, baud: number) => serial.connect(path, baud))
  ipcMain.handle('serial:disconnect', () => serial.disconnect())
  ipcMain.handle('serial:write', (_e, data: string) => serial.write(data))
  ipcMain.handle('serial:writeRealtime', (_e, byte: number) => serial.writeRealtime(byte))

  // Streaming
  ipcMain.handle('stream:load', (_e, lines: string[]) => streamer.load(lines))
  ipcMain.handle('stream:start', () => streamer.start())
  ipcMain.handle('stream:pause', () => streamer.pause())
  ipcMain.handle('stream:resume', () => streamer.resume())
  ipcMain.handle('stream:stop', () => streamer.stop())

  // Store
  ipcMain.handle('store:get', (_e, key: string) => store.get(key))
  ipcMain.handle('store:set', (_e, key: string, value: unknown) => store.set(key, value))

  // Updater
  updater.on('status', (s) => wc.send('updater:status', s))
  ipcMain.handle('updater:check', () => updater.check())
  ipcMain.handle('updater:install', () => updater.install())
  ipcMain.handle('updater:openReleasePage', () => updater.openReleasePage())
  ipcMain.handle('updater:getStatus', () => updater.getStatus())
  ipcMain.handle('updater:getVersion', () => app.getVersion())

  // File dialog
  ipcMain.handle('dialog:openFileContent', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: 'G-code Files', extensions: ['nc', 'gcode', 'gc', 'ngc', 'tap', 'cnc', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const path = result.filePaths[0]
    const content = await readFile(path, 'utf8')
    return { path, content }
  })
}
