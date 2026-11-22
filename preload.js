// Ponte entre o site e o app de Windows
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('meevoDesktop', {
  platform: 'windows',
  // Atualização do app: { state: 'downloading' | 'ready', version, percent }
  getUpdate: () => ipcRenderer.invoke('update:get'),
  onUpdate: (cb) => ipcRenderer.on('update:status', (_e, state) => cb(state)),
  installUpdate: () => ipcRenderer.send('update:install'),
  // Avisa o app que o MEEVO terminou de carregar (fecha a animação de abertura)
  appReady: () => ipcRenderer.send('app:ready'),
});
