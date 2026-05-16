import { app, net, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { EventEmitter } from 'events'

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; percent: number; version: string }
  | { state: 'ready'; version: string }
  | { state: 'fallback'; version: string; releaseUrl: string }
  | { state: 'up-to-date' }
  | { state: 'error'; message: string }

// Two-tier update strategy:
//   1. electron-updater pulls latest.yml from GitHub Releases and downloads
//      the installer in the background, then installs on quit.
//   2. If electron-updater errors (no signed installer on macOS, no
//      latest.yml on the release, network issue, etc.) we fall back to the
//      GitHub Releases API and surface a "Download from GitHub" link.
export class UpdateManager extends EventEmitter {
  private status: UpdateStatus = { state: 'idle' }
  private fallbackInflight = false

  constructor(private repoOwner: string, private repoName: string) {
    super()
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowDowngrade = false

    autoUpdater.on('checking-for-update', () => this.setStatus({ state: 'checking' }))
    autoUpdater.on('update-available', (info) =>
      this.setStatus({ state: 'available', version: info.version }))
    autoUpdater.on('update-not-available', () => this.setStatus({ state: 'up-to-date' }))
    autoUpdater.on('download-progress', (p) => {
      const v = (this.status.state === 'available' || this.status.state === 'downloading')
        ? (this.status as any).version
        : ''
      this.setStatus({ state: 'downloading', percent: Math.round(p.percent), version: v })
    })
    autoUpdater.on('update-downloaded', (info) =>
      this.setStatus({ state: 'ready', version: info.version }))
    autoUpdater.on('error', (err) => this.fallback(err))
  }

  getStatus() { return this.status }

  async check(): Promise<void> {
    if (this.status.state === 'downloading' || this.status.state === 'ready') return
    try {
      await autoUpdater.checkForUpdates()
    } catch (err: any) {
      this.fallback(err)
    }
  }

  install(): void {
    if (this.status.state === 'ready') autoUpdater.quitAndInstall()
  }

  openReleasePage(): void {
    if (this.status.state === 'fallback') shell.openExternal(this.status.releaseUrl)
  }

  private setStatus(s: UpdateStatus) {
    this.status = s
    this.emit('status', s)
  }

  private async fallback(err: any) {
    if (this.fallbackInflight) return
    this.fallbackInflight = true
    try {
      const latest = await this.fetchLatestRelease()
      if (!latest) {
        // No releases yet, rate-limited, or offline — treat as up-to-date silently
        this.setStatus({ state: 'up-to-date' })
        return
      }
      const remote = latest.tag_name.replace(/^v/i, '')
      if (isNewer(remote, app.getVersion())) {
        this.setStatus({ state: 'fallback', version: remote, releaseUrl: latest.html_url })
      } else {
        this.setStatus({ state: 'up-to-date' })
      }
    } catch {
      this.setStatus({ state: 'error', message: err?.message ?? 'Update check failed' })
    } finally {
      this.fallbackInflight = false
    }
  }

  private fetchLatestRelease(): Promise<{ tag_name: string; html_url: string } | null> {
    return new Promise((resolve) => {
      const req = net.request(`https://api.github.com/repos/${this.repoOwner}/${this.repoName}/releases/latest`)
      req.setHeader('User-Agent', 'cnc-controller-updater')
      req.setHeader('Accept', 'application/vnd.github+json')
      let body = ''
      req.on('response', (res) => {
        res.on('data', (chunk) => { body += chunk.toString() })
        res.on('end', () => {
          if (res.statusCode !== 200) return resolve(null)
          try { resolve(JSON.parse(body)) } catch { resolve(null) }
        })
      })
      req.on('error', () => resolve(null))
      req.end()
    })
  }
}

function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const ai = pa[i] ?? 0, bi = pb[i] ?? 0
    if (ai > bi) return true
    if (ai < bi) return false
  }
  return false
}
