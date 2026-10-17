const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ferit9', {
  fault: (line) => ipcRenderer.send('fault', String(line))
});
