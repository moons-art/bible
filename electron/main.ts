import { app, BrowserWindow, ipcMain, protocol, net, dialog } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import http from 'node:http'
import { shell, Tray, Menu, nativeImage } from 'electron'
import { createHymnalLogic } from './hymnalIPC'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

// 빌드된 환경에서 성경 데이터가 저장되는 경로 (extraResources 경로)
const BIBLE_DATA_PATH = app.isPackaged 
  ? path.join(process.resourcesPath, 'public/data')
  : path.join(process.env.APP_ROOT, 'public/data')

// 중복 실행 방지 (Single Instance Lock)
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // 이미 실행 중인 인스턴스가 있으면 현재 인스턴스 종료
  app.quit()
} else {
  // 두 번째 인스턴스가 실행될 때 기존 창을 포커스
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

console.log('[Main] Bible Data Path:', BIBLE_DATA_PATH);

let win: BrowserWindow | null = null
let localServer: http.Server | null = null
let tray: Tray | null = null
let hymnalLogic: any = null

const FIXED_PORT = 8080
let lastProgress = { processed: 0, total: 0 }

// 찬송가 데이터 폴더 초기화
async function initHymnalDir() {
  const hymnalDir = path.join(app.getPath('userData'), 'hymnal')
  const imagesDir = path.join(hymnalDir, 'hymnal_images')
  const dbPath = path.join(hymnalDir, 'music_data.json')
  const contisPath = path.join(hymnalDir, 'saved_contis.json')
  const settingsPath = path.join(hymnalDir, 'settings.json')

  if (!fs.existsSync(hymnalDir)) fs.mkdirSync(hymnalDir, { recursive: true })
  if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true })
  if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, '[]', 'utf8')
  if (!fs.existsSync(contisPath)) fs.writeFileSync(contisPath, '[]', 'utf8')
  if (!fs.existsSync(settingsPath)) fs.writeFileSync(settingsPath, '{}', 'utf8')

  // 최초 데이터 Seed (내장 DB 생성)
  if (hymnalLogic && typeof hymnalLogic.seedInitialData === 'function') {
    const result = await hymnalLogic.seedInitialData();
    if (result.success && result.count) {
      console.log(`[Init] Seeded ${result.count} songs to built-in DB.`);
    }
  }
}

// 로컬 HTTP 서버 가동 로직은 하단에 통합되었습니다.

async function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true, // 전용 앱 창을 바로 보여줌 (창 확장 기능 사용을 위해)
    // show: false, // 기존: 브라우저 사용 권장 시 설정
    icon: path.join(process.env.VITE_PUBLIC || path.join(__dirname, '../public'), 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      webSecurity: true,
      contextIsolation: true,
      nodeIntegration: false
    },
  })

  const chromeUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  win.webContents.setUserAgent(chromeUA);

  // Hymnal IPC 등록 (기존 호환성 유지)
  const { registerHymnalIPC } = await import('./hymnalIPC')

  // 설교문 전용 새 창 열기 핸들러
  ipcMain.removeHandler('open-sermon-editor'); // 중복 등록 방지
  ipcMain.handle('open-sermon-editor', (event, sermonId) => {
    const editorWin = new BrowserWindow({
      width: 1200,
      height: 900,
      title: '설교문 작성 - 새 창',
      webPreferences: {
        preload: path.join(__dirname, 'preload.mjs'),
        webSecurity: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    if (VITE_DEV_SERVER_URL) {
      editorWin.loadURL(`${VITE_DEV_SERVER_URL}#/sermon-editor/${sermonId}`);
    } else {
      editorWin.loadURL(`http://localhost:${FIXED_PORT}/index.html#/sermon-editor/${sermonId}`);
    }
    return true;
  });
  registerHymnalIPC(win)

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadURL(`http://localhost:${FIXED_PORT}/index.html`)
  }
}

function createTray() {
  const iconPath = path.join(process.env.VITE_PUBLIC || path.join(__dirname, '../public'), 'icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  
  const contextMenu = Menu.buildFromTemplate([
    { label: '찬양 브라우저 열기', click: () => shell.openExternal(`http://localhost:${FIXED_PORT}`) },
    { label: '관리 창 열기 (Electron)', click: () => { if (win) win.show(); else createWindow().then(() => win?.show()); } },
    { type: 'separator' },
    { label: '종료', click: () => { app.isQuitting = true; app.quit(); } }
  ])

  tray.setToolTip('ceum 성경CCM')
  tray.setContextMenu(contextMenu)
  
  tray.on('click', () => {
    shell.openExternal(`http://localhost:${FIXED_PORT}`)
  })
}

// 로컬 HTTP 서버 가동
function startLocalServer(): Promise<number> {
  return new Promise((resolve) => {
    localServer = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      let urlPath = decodeURIComponent(req.url || '/').split('?')[0]
      
      // API 핸들러
      if (urlPath.startsWith('/api/')) {
        const action = urlPath.replace('/api/', '')
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          try {
            const parsedBody = body ? JSON.parse(body) : {}
            let result: any = { error: 'Unknown action' }

            // HymnalLogic 메서드 매핑
            if (action === 'get-songs') result = await hymnalLogic.getSongs()
            else if (action === 'get-settings') result = await hymnalLogic.getSettings()
            else if (action === 'save-settings') result = await hymnalLogic.saveSettings(parsedBody)
            else if (action === 'get-saved-contis') result = await hymnalLogic.getSavedContis()
            else if (action === 'save-conti') result = await hymnalLogic.saveConti(parsedBody)
            else if (action === 'delete-saved-conti') result = await hymnalLogic.deleteSavedConti(parsedBody.id)
            else if (action === 'add-album') result = await hymnalLogic.addAlbum(parsedBody)
            else if (action === 'update-album') result = await hymnalLogic.updateAlbum(parsedBody)
            else if (action === 'delete-album') result = await hymnalLogic.deleteAlbum(parsedBody.id)
            else if (action === 'update-song') result = await hymnalLogic.updateSong(parsedBody)
            else if (action === 'delete-song') result = await hymnalLogic.deleteSong(parsedBody)
            else if (action === 'process-images') {
              lastProgress = { processed: 0, total: parsedBody.total || 100 }
              result = await hymnalLogic.processImages(parsedBody, (p: any) => {
                lastProgress = p;
              })
            }
            else if (action === 'sync-gdrive') {
              lastProgress = { processed: 0, total: 100 }
              result = await hymnalLogic.syncGDrive(parsedBody.albumId, (p: any) => {
                lastProgress = p;
              })
            }
            else if (action === 'get-progress') {
              result = lastProgress
            }
            else if (action === 'get-auth-url') result = { url: await hymnalLogic.getAuthUrl() }
            else if (action === 'confirm-auth') result = await hymnalLogic.confirmAuth(parsedBody.code)
            else if (action === 'open-external') { hymnalLogic.openExternal(parsedBody.url); result = { success: true }; }
            else if (action === 'select-folder') {
              app.focus({ steal: true });
              const dialogResult = await dialog.showOpenDialog({
                properties: ['openDirectory'],
                title: '앨범 이미지 폴더 선택'
              });
              result = { path: dialogResult.filePaths && dialogResult.filePaths.length > 0 ? dialogResult.filePaths[0] : null };
            } else if (action === 'resize-window') {
              if (win) {
                const { width, height } = parsedBody;
                if (width && height) {
                  win.setSize(width, height, true); // true for animation
                  result = { success: true };
                }
              }
            } else {
              console.log('Unknown API action requested:', action);
            }

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(result))
          } catch (err: any) {
            res.writeHead(500)
            res.end(JSON.stringify({ error: err.message }))
          }
        })
        return
      }

      // 리소스(이미지) 핸들러
      if (urlPath.startsWith('/resource/')) {
        let fileName = urlPath.replace('/resource/', '')
        // hymnal_images/ 가 포함된 경우 제거 (경로 중복 방지)
        fileName = fileName.replace('hymnal_images/', '')
        const filePath = path.join(app.getPath('userData'), 'hymnal', 'hymnal_images', fileName)
        
        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(404)
            res.end('Resource Not Found')
            return
          }
          res.writeHead(200, { 'Content-Type': 'image/webp' })
          res.end(data)
        })
        return
      }

      // 정적 파일 서빙
      if (urlPath === '/' || urlPath === '') urlPath = '/index.html'
      // urlPath가 /로 시작하면 path.join이 절대 경로로 오해하므로 슬래시 제거 후 결합
      const relativePath = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath
      
      // 성경 데이터(/data/...) 요청 처리
      if (urlPath.startsWith('/data/')) {
        const bibleFileName = path.basename(urlPath)
        const bibleFilePath = path.join(BIBLE_DATA_PATH, bibleFileName)
        
        console.log(`[Main] Serving Bible File: ${bibleFileName} from ${bibleFilePath}`);
        
        fs.access(bibleFilePath, fs.constants.F_OK, (err) => {
          if (err) { 
            console.error(`[Main] Bible File Not Found at: ${bibleFilePath}`);
            res.writeHead(404); 
            res.end('Bible File Not Found'); 
            return; 
          }
          
          fs.readFile(bibleFilePath, (err, data) => {
            if (err) { 
              console.error(`[Main] Error reading bible file: ${err.message}`);
              res.writeHead(500); 
              res.end('Error reading bible file'); 
              return; 
            }
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
            res.end(data)
          })
        })
        return
      }

      const filePath = path.join(RENDERER_DIST, relativePath)
      
      fs.access(filePath, fs.constants.F_OK, (err) => {
        const finalPath = err ? path.join(RENDERER_DIST, 'index.html') : filePath
        
        fs.readFile(finalPath, (err, data) => {
          if (err) { res.writeHead(404); res.end('Not Found'); return; }

          const ext = path.extname(finalPath).toLowerCase()
          const mimeTypes: Record<string, string> = {
            '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
            '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2',
            '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.txt': 'text/plain'
          }

          res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' })
          res.end(data)
        })
      })
    })

    localServer.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        const msg = `포트 ${FIXED_PORT}가 이미 사용 중입니다.\n\n앱이 이미 실행 중이거나 다른 프로그램이 해당 포트를 쓰고 있습니다.\n기존 앱을 종료하거나 컴퓨터를 재부팅 후 다시 시도해 주세요.`;
        dialog.showErrorBox('서버 구동 실패', msg);
        app.quit();
      } else {
        dialog.showErrorBox('서버 오류', `서버 구동 중 예기치 못한 오류가 발생했습니다: ${err.message}`);
      }
    });

    localServer.listen(FIXED_PORT, '0.0.0.0', () => {
      console.log(`Local server running at http://localhost:${FIXED_PORT}`)
      resolve(FIXED_PORT)
    })
  })
}

// 중복된 코드 제거 및 app.whenReady 통합

app.whenReady().then(async () => {
  // 앱 준비 후 로직 초기화
  const { createHymnalLogic } = await import('./hymnalIPC')
  hymnalLogic = createHymnalLogic()

  // 폴더 초기화 실행
  await initHymnalDir()

  // 서버 시작
  await startLocalServer()
  
  /* 기존: 외부 브라우저(크롬 등) 자동 실행 코드 (안될 경우 대비 백업)
  if (!VITE_DEV_SERVER_URL) {
    shell.openExternal(`http://localhost:${FIXED_PORT}`)
  }
  */

  createTray()
  // 전용 앱 창 생성을 기본으로 활성화
  createWindow()
  // // 백그라운드 서비스이므로 초기 윈도우 생성은 생략하거나 최소화
  // // createWindow()
})

app.on('window-all-closed', () => {
  // 트레이 앱으로 동작하므로 모든 창이 닫혀도 종료하지 않음
  if (process.platform !== 'darwin') {
    // app.quit()
  }
})

app.on('activate', () => {
  // if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// 종료 시 서버 닫기
app.on('before-quit', () => {
  if (localServer) localServer.close()
})

