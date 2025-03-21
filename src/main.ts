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
        },
        frame: true,
        transparent: false,
        backgroundColor: '#ffffff'
    });

    mainWindow.loadFile(path.join(__dirname, '../src/index.html'));
}

// 创建鼠标位置窗口
function createMousePositionWindow() {
    mousePositionWindow = new BrowserWindow({
        width: 200,
        height: 100,
        frame: true,
        transparent: false,
        alwaysOnTop: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mousePositionWindow.loadFile(path.join(__dirname, '../src/mouse-position.html'));

    // 监听窗口关闭事件
    mousePositionWindow.on('closed', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('mouse-position-window-closed');
        }
        mousePositionWindow = null;
    });

    // 设置窗口位置在屏幕右上角
    const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
    const windowBounds = mousePositionWindow.getBounds();
    mousePositionWindow.setPosition(screenWidth - windowBounds.width - 20, 40);
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

ipcMain.on('close-mouse-position-window', () => {
    if (mousePositionWindow && !mousePositionWindow.isDestroyed()) {
        mousePositionWindow.close();
        mousePositionWindow = null;
    }
});

// 添加截图功能
ipcMain.handle('capture-screenshot', async () => {
    try {
        // 临时将窗口设为透明
        if (mainWindow && !mainWindow.isDestroyed()) {
            const originalOpacity = mainWindow.getOpacity();
            mainWindow.setOpacity(0);
            
            // 等待一小段时间确保透明度生效
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 获取主显示器
            const primaryDisplay = screen.getPrimaryDisplay();
            const { width, height } = primaryDisplay.size;
            
            // 获取所有屏幕源
            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: {
                    width,
                    height
                }
            });

            // 找到主显示器的源（如果找不到就使用第一个源）
            const primarySource = sources[0];

            // 获取截图
            const screenshot = primarySource.thumbnail.toDataURL();
            
            // 恢复窗口原来的不透明度
            mainWindow.setOpacity(originalOpacity);
            
            return {
                screenshot,
                resolution: {
                    width,
                    height
                }
            };
        }
        
        throw new Error('主窗口不可用');
    } catch (error) {
        console.error('Screenshot error:', error);
        // 确保在出错时也恢复窗口不透明度
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setOpacity(1);
        }
        return null;
    }
});

// 添加IPC处理程序
ipcMain.handle('get-screen-size', () => {
    const primaryDisplay = screen.getPrimaryDisplay();
    return {
        width: primaryDisplay.size.width,
        height: primaryDisplay.size.height
    };
});

// 添加窗口控制处理程序
ipcMain.handle('minimize-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.minimize();
    }
});

ipcMain.handle('restore-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        mainWindow.show();
        mainWindow.focus();
    }
});