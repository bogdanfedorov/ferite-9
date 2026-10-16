const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('path');

const isDev = !app.isPackaged || process.argv.includes('--dev');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function hardenSession() {
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, done) => done(false));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#090c12',
    title: 'Ферит-9',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev,
      backgroundThrottling: false,
      spellcheck: false
    }
  });

  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'app', 'index.html'));

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
      return;
    }
    if (isDev) return;
    const key = (input.key || '').toLowerCase();
    const devCombo =
      key === 'f12' ||
      (input.control && input.shift && (key === 'i' || key === 'j' || key === 'c')) ||
      (input.meta && input.alt && key === 'i') ||
      (input.control && key === 'r') ||
      key === 'f5';
    if (devCombo) event.preventDefault();
  });
}

app.whenReady().then(() => {
  hardenSession();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => app.quit());
