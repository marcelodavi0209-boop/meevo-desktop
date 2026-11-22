// MEEVO para Windows
// O app abre o MEEVO publicado numa janela própria. Assim, toda atualização
// do site chega automaticamente, sem precisar reinstalar.
const { app, BrowserWindow, session, desktopCapturer, shell, ipcMain, Menu } = require('electron');
let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch (_) {}
const path = require('path');
const fs = require('fs');

const APP_URL = 'https://meevo-21vz.onrender.com';
const APP_ORIGIN = new URL(APP_URL).origin;

app.setAppUserModelId('com.dallyverso.meevo'); // notificações do Windows com nome e ícone do MEEVO
// Evita a "tela verde" ao exibir vídeo em tela cheia em algumas placas de vídeo
app.commandLine.appendSwitch('disable-direct-composition-video-overlays');

// Só uma janela do MEEVO aberta por vez
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && win.isVisible()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
}

let win = null;
let splash = null;

// ---------- lembra tamanho e posição da janela
const stateFile = () => path.join(app.getPath('userData'), 'janela.json');
function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (_) { return { width: 1280, height: 800 }; }
}
function saveState() {
  if (!win || win.isDestroyed()) return;
  const b = win.getNormalBounds();
  try { fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() })); } catch (_) {}
}

const isAppUrl = (u) => { try { return new URL(u).origin === APP_ORIGIN; } catch (_) { return false; } };

// ---------- abertura animada: janelinha com o M do MEEVO enquanto o app carrega
function createSplash() {
  splash = new BrowserWindow({
    width: 340, height: 300, frame: false, resizable: false, movable: true, minimizable: false, maximizable: false,
    skipTaskbar: false, center: true, show: false, backgroundColor: '#0B0A14', title: 'MEEVO',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  splash.once('ready-to-show', () => splash && !splash.isDestroyed() && splash.show());
  splash.on('closed', () => { splash = null; });
  splash.loadFile(path.join(__dirname, 'splash.html'));
}

function createWindow() {
  const st = loadState();
  const openedAt = Date.now();
  let revealed = false;
  // Mostra a janela principal quando o MEEVO avisa que terminou de carregar
  // (mínimo de 1,8 s para a animação da abertura completar)
  const reveal = () => {
    if (revealed || !win || win.isDestroyed()) return;
    revealed = true;
    setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      if (st.maximized) win.maximize();
      win.show(); win.focus();
      if (splash && !splash.isDestroyed()) splash.close();
    }, Math.max(0, 1800 - (Date.now() - openedAt)));
  };
  win = new BrowserWindow({
    x: st.x, y: st.y, width: st.width || 1280, height: st.height || 800,
    minWidth: 940, minHeight: 600,
    backgroundColor: '#0B0A14',
    title: 'MEEVO',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    autoHideMenuBar: true,
    show: false,
    // Barra de título moderna: o MEEVO desenha a barra, e o Windows só mostra os botões de janela
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0B0A14', symbolColor: '#A7A1BA', height: 36 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  ipcMain.on('app:ready', (e) => { if (win && e.sender === win.webContents) reveal(); });
  // Versões do site sem o aviso, ou página de "sem conexão": mostra assim que a página carrega
  win.webContents.on('did-finish-load', () => {
    const u = win.webContents.getURL();
    if (!isAppUrl(u)) return reveal();
    win.webContents.executeJavaScript('typeof window.meevoReady === "function"').then((has) => { if (!has) reveal(); }).catch(reveal);
  });
  setTimeout(reveal, 20000); // segurança: nunca fica preso na abertura
  win.on('close', saveState);

  win.loadURL(APP_URL);

  // Sem internet ou servidor fora do ar: mostra uma tela amigável com "Tentar de novo"
  win.webContents.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'), { query: { url: APP_URL } });
  });

  // Links de outros sites abrem no navegador padrão
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url) && !url.startsWith('file:')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });

  // Atalhos: F5 recarrega, Ctrl+Shift+I abre as ferramentas de desenvolvedor, F11 tela cheia
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5') { win.webContents.reload(); e.preventDefault(); }
    if (input.control && input.shift && input.key.toLowerCase() === 'i') { win.webContents.toggleDevTools(); e.preventDefault(); }
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
}

// ---------- estado da atualização (enviado para a barra do app)
let updateState = null;
function sendUpdate(state) {
  updateState = state;
  if (win && !win.isDestroyed()) win.webContents.send('update:status', state);
}
ipcMain.handle('update:get', () => updateState);
ipcMain.on('update:install', () => {
  if (autoUpdater && updateState && updateState.state === 'ready') autoUpdater.quitAndInstall(true, true);
});

// ---------- seletor de tela/janela para transmitir
let pickerOpen = false;
function openPicker(sources, audioRequested) {
  return new Promise((resolve) => {
    if (pickerOpen) return resolve(null);
    pickerOpen = true;
    let done = false;
    const finish = (v) => { if (done) return; done = true; pickerOpen = false; ipcMain.removeAllListeners('picker:ready'); ipcMain.removeAllListeners('picker:choice'); resolve(v); };

    const pw = new BrowserWindow({
      parent: win, modal: true, width: 860, height: 640, resizable: true, minimizable: false, maximizable: false,
      backgroundColor: '#12101E', title: 'Transmitir tela - MEEVO', icon: path.join(__dirname, 'build', 'icon.ico'),
      autoHideMenuBar: true, show: false,
      titleBarStyle: 'hidden', titleBarOverlay: { color: '#12101E', symbolColor: '#A7A1BA', height: 36 },
      webPreferences: { preload: path.join(__dirname, 'picker-preload.js'), contextIsolation: true, sandbox: true },
    });
    pw.once('ready-to-show', () => pw.show());
    ipcMain.once('picker:ready', (e) => {
      if (e.sender !== pw.webContents) return;
      pw.webContents.send('picker:sources', {
        audioRequested,
        sources: sources.map((s) => ({
          id: s.id, name: s.name, type: s.id.startsWith('screen') ? 'screen' : 'window',
          thumb: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : null,
          icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
        })),
      });
    });
    ipcMain.once('picker:choice', (e, choice) => {
      finish(choice || null);
      if (!pw.isDestroyed()) pw.close();
    });
    pw.on('closed', () => finish(null));
    pw.loadFile(path.join(__dirname, 'picker.html'));
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const ses = session.defaultSession;

  // Permissões (microfone, câmera, notificações, tela cheia) só para o MEEVO
  const allowed = new Set(['media', 'notifications', 'fullscreen', 'clipboard-sanitized-write', 'display-capture']);
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(allowed.has(permission) && isAppUrl(details.requestingUrl || wc.getURL()));
  });
  ses.setPermissionCheckHandler((wc, permission, origin) => allowed.has(permission) && (origin === APP_ORIGIN || isAppUrl(origin)));

  // Quando o MEEVO pede para transmitir a tela, mostramos o seletor do app
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'], thumbnailSize: { width: 400, height: 225 }, fetchWindowIcons: true,
      });
      const choice = await openPicker(sources, !!request.audioRequested);
      const src = choice && sources.find((s) => s.id === choice.id);
      if (!src) return callback({});
      // "loopback" = som do computador (Windows)
      callback(choice.audio ? { video: src, audio: 'loopback' } : { video: src });
    } catch (err) {
      console.error(err);
      callback({});
    }
  });

  createSplash();
  createWindow();

  // Atualização automática: baixa em segundo plano e mostra um ícone verde na barra do app
  if (autoUpdater && app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available', (info) => sendUpdate({ state: 'downloading', version: info.version, percent: 0 }));
    autoUpdater.on('download-progress', (p) => sendUpdate({ state: 'downloading', version: updateState && updateState.version, percent: Math.round(p.percent || 0) }));
    autoUpdater.on('update-downloaded', (info) => sendUpdate({ state: 'ready', version: info.version }));
    autoUpdater.on('error', (err) => console.error('update', err && err.message));
    const check = () => autoUpdater.checkForUpdates().catch(() => {});
    check();
    setInterval(check, 60 * 60 * 1000);
  }
});

app.on('window-all-closed', () => app.quit());
