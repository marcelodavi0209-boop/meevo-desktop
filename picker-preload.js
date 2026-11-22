const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('picker', {
  ready: () => ipcRenderer.send('picker:ready'),
  onSources: (cb) => ipcRenderer.on('picker:sources', (_e, data) => cb(data)),
  choose: (choice) => ipcRenderer.send('picker:choice', choice),
});
