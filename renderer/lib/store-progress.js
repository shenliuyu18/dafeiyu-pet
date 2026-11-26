/*
 * 商店下载进度的纯函数：夹取、单调合并、百分比取整。
 * 下载事件很密（40MB 约 160 次），合并逻辑独立出来才方便测。
 */
(function (root) {
  'use strict';

  /** @param {number} downloaded @param {number} total */
  function fraction(downloaded, total) {
    const d = Number(downloaded);
    const t = Number(total);
    if (!Number.isFinite(d) || !Number.isFinite(t) || t <= 0 || d <= 0) return 0;
    return Math.min(1, d / t);
  }

  /** @param {number} f */
  function percent(f) {
    const n = Number(f);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(100, Math.round(n * 100));
  }

  /** 进度不回退：乱序 / 重试事件不会让进度条倒退 */
  function mergeProgress(prev, downloaded, total) {
    const next = fraction(downloaded, total);
    const old = Number(prev);
    const base = Number.isFinite(old) ? old : 0;
    return next > base ? next : base;
  }

  const api = { fraction, percent, mergeProgress };
  root.PetLib = root.PetLib || {};
  root.PetLib.storeProgress = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);