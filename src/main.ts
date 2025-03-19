import { app, BrowserWindow, ipcMain, systemPreferences } from 'electron';
import * as path from 'path';

async function requestScreenAccess() {
    try {
        // 检查是否有屏幕录制权限
        if (!systemPreferences.getMediaAccessStatus('screen')) {
            // 在 macOS 上，屏幕录制权限需要用户在系统偏好设置中手动授予
            console.log('请在系统偏好设置 > 安全性与隐私 > 隐私 > 屏幕录制 中授予权限');
        }
        
        // 请求辅助功能权限
        if (!systemPreferences.isTrustedAccessibilityClient(false)) {
            systemPreferences.isTrustedAccessibilityClient(true);
        }
    } catch (error) {
        console.error('权限请求失败:', error);
    }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 600,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: true
    }
  });


  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));
}

let mousePositionWindow: BrowserWindow | null;

ipcMain.on('open-mouse-position-window', () => {
  mousePositionWindow = new BrowserWindow({
    width: 400,
    height: 200,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: true
    }
  });

  mousePositionWindow.loadFile(path.join(__dirname, '../src/mouse-position.html'));

  mousePositionWindow.on('closed', () => {
    mousePositionWindow = null;
  });
});

ipcMain.on('update-mouse-position', (event, position) => {
  if (mousePositionWindow && !mousePositionWindow.isDestroyed()) {
    mousePositionWindow.webContents.send('update-mouse-position', position);
  }
});

app.whenReady().then(async () => {
  // 启动时请求必要的权限
  await requestScreenAccess();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});