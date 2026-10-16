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
  'show-settings',
  'show-picker',
];

contextBridge.exposeInMainWorld('pet', {
  ready: () => ipcRenderer.send('ready'),
  reportPos: (pos) => ipcRenderer.send('pos', pos),
  setPanel: (rect) => ipcRenderer.send('panel', rect),
  setDragging: (on) => ipcRenderer.send('drag', on),
  updateStats: (s) => ipcRenderer.send('stats', s),
  saveSettings: (s) => ipcRenderer.send('settings', s),
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
