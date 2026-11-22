/*
 * 番茄钟时间格式化。纯函数。
 */
(function (root) {
  'use strict';

  function clock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function minutes(v) {
    const n = Math.round((Number(v) || 0) * 10) / 10;
    return n ? `${n} 分钟` : '0 分钟';
  }

  const api = { clock, minutes };
  root.PetLib = root.PetLib || {};
  root.PetLib.timeFormat = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);