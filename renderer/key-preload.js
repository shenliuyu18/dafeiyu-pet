'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('keyApi', {
  info: () => ipcRenderer.invoke('key-info'),
  save: (key) => ipcRenderer.invoke('key-save', key),
  clear: () => ipcRenderer.invoke('key-clear'),
  close: () => ipcRenderer.send('key-close'),
  onTarget: (fn) => ipcRenderer.on('key-target', (_e, info) => fn(info)),
});
