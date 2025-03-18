import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';

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

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});