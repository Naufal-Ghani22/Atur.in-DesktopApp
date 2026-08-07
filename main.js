const { app, BrowserWindow, Menu, ipcMain, screen } = require('electron');
const path = require('path');

let mainWindow = null;
let miniTimerWindow = null;
let isMainPinned = false;

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 960,
        minHeight: 650,
        title: "ATUR.IN - Asisten Produktivitas & Manajemen Harian",
        autoHideMenuBar: true,
        backgroundColor: '#090d16',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('index.html');

    const template = [
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    mainWindow.setMenuBarVisibility(false);

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (miniTimerWindow) {
            miniTimerWindow.close();
            miniTimerWindow = null;
        }
    });
}

function createMiniTimerWindow(initialData) {
    if (miniTimerWindow) {
        miniTimerWindow.focus();
        return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;

    miniTimerWindow = new BrowserWindow({
        width: 300,
        height: 180,
        x: screenWidth - 320,
        y: 40,
        frame: false,
        transparent: true,
        alwaysOnTop: true, // Pinned at top layer by default
        resizable: false,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    miniTimerWindow.loadFile('mini-timer.html');

    miniTimerWindow.webContents.on('did-finish-load', () => {
        if (initialData) {
            miniTimerWindow.webContents.send('sync-timer', initialData);
        }
    });

    miniTimerWindow.on('closed', () => {
        miniTimerWindow = null;
    });
}

// IPC Main Message Handlers
ipcMain.on('toggle-always-on-top', (event, isPinned) => {
    isMainPinned = isPinned;
    if (mainWindow) {
        mainWindow.setAlwaysOnTop(isPinned, 'screen-saver');
    }
});

ipcMain.on('open-mini-timer', (event, data) => {
    createMiniTimerWindow(data);
});

ipcMain.on('close-mini-timer', () => {
    if (miniTimerWindow) {
        miniTimerWindow.close();
        miniTimerWindow = null;
    }
});

ipcMain.on('sync-timer-to-mini', (event, timerData) => {
    if (miniTimerWindow && !miniTimerWindow.isDestroyed()) {
        miniTimerWindow.webContents.send('sync-timer', timerData);
    }
});

ipcMain.on('timer-action-from-mini', (event, action) => {
    if (action === 'toggle-pin-mini') {
        if (miniTimerWindow && !miniTimerWindow.isDestroyed()) {
            const currentOnTop = miniTimerWindow.isAlwaysOnTop();
            const newOnTop = !currentOnTop;
            miniTimerWindow.setAlwaysOnTop(newOnTop, 'screen-saver');
            miniTimerWindow.webContents.send('sync-timer', { isPinned: newOnTop });
        }
        return;
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('timer-action-main', action);
    }
});

app.whenReady().then(() => {
    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
