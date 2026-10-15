'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const IN_CHANNELS = [
  'init',
  'cursor',
  'feed',
  'awake',
  'bubble',
  'pomodoro',
  'pomodoro-done',
  'show-status',
  'usage',
  'show-usage',
];

contextBridge.exposeInMainWorld('pet', {
  ready: () => ipcRenderer.send('ready'),
  reportPos: (pos) => ipcRenderer.send('pos', pos),
  setMenuOpen: (open) => ipcRenderer.send('menu', open),
  setDragging: (on) => ipcRenderer.send('drag', on),
  updateStats: (s) => ipcRenderer.send('stats', s),
  action: (name) => ipcRenderer.send('action', name),
  notify: (text) => ipcRenderer.send('bubble', text),
  quit: () => ipcRenderer.send('quit'),
  on(channel, fn) {
    if (!IN_CHANNELS.includes(channel)) return () => {};
    const handler = (_e, payload) => fn(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
});
