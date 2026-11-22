// Informa ao site que ele está rodando dentro do app de Windows
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('meevoDesktop', {
  platform: 'windows',
  version: '1.0.0',
});
