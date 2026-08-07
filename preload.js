const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    toggleAlwaysOnTop: (isPinned) => ipcRenderer.send('toggle-always-on-top', isPinned),
    openMiniTimer: (data) => ipcRenderer.send('open-mini-timer', data),
    closeMiniTimer: () => ipcRenderer.send('close-mini-timer'),
    syncTimerToMini: (timerData) => ipcRenderer.send('sync-timer-to-mini', timerData),
    onSyncTimerFromMain: (callback) => ipcRenderer.on('sync-timer', (_event, value) => callback(value)),
    sendTimerActionToMain: (action) => ipcRenderer.send('timer-action-from-mini', action),
    onTimerActionInMain: (callback) => ipcRenderer.on('timer-action-main', (_event, action) => callback(action))
});
