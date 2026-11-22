/*
 * 基础动画选择：输入当前状态，输出应播放的动作类别。
 * 纯函数，不读 DOM，方便单测覆盖「拖拽 > 睡眠 > 番茄钟 > 饥饿 > 移动/待机」优先级。
 */
(function (root) {
  'use strict';

  function baseKind(s) {
    if (s.dragging) return 'drag';
    if (!s.awake || s.autoDoze) return 'sleep';
    if (s.pomoRunning) return s.pomoResting ? 'idle' : 'pomo';
    if (s.satiety < 32) return 'sad';
    return s.swimming ? 'move' : 'idle';
  }

  const api = { baseKind };
  root.PetLib = root.PetLib || {};
  root.PetLib.anim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);