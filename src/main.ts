import { app, BrowserWindow, ipcMain, systemPreferences, screen, desktopCapturer } from 'electron';
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

let mainWindow: BrowserWindow | null;
let mousePositionWindow: BrowserWindow | null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../src/index.html'));
}

// 创建鼠标位置窗口
function createMousePositionWindow() {
    mousePositionWindow = new BrowserWindow({
        width: 100,
        height: 50,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mousePositionWindow.loadFile(path.join(__dirname, '../src/mouse-position.html'));
}

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

ipcMain.on('open-mouse-position-window', () => {
    if (!mousePositionWindow || mousePositionWindow.isDestroyed()) {
        createMousePositionWindow();
    }
});

ipcMain.on('update-mouse-position', (event, position) => {
    if (mousePositionWindow && !mousePositionWindow.isDestroyed()) {
        mousePositionWindow.webContents.send('update-mouse-position', position);
    }
});

// 添加截图功能
ipcMain.handle('capture-screenshot', async () => {
    try {
        // 隐藏主窗口
        mainWindow?.hide();
        
        // 等待一小段时间确保窗口完全隐藏
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 获取主显示器
        const primaryDisplay = screen.getPrimaryDisplay();
        
        // 捕获屏幕
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
                width: primaryDisplay.size.width,
                height: primaryDisplay.size.height
            }
        });
        
        // 获取截图
        const screenshot = sources[0].thumbnail.toDataURL();
        
        // 显示主窗口
        mainWindow?.show();
        
        return screenshot;
    } catch (error) {
        console.error('Screenshot error:', error);
        mainWindow?.show();
        return null;
    }
});