/*
 * 气泡排版几何：只做坐标判断，不读 DOM，方便单测。
 * 调用方负责量测 rect 与套用位移。
 */
(function (root) {
  'use strict';

  // 鱼上方放不下气泡时翻到下方。128 是鱼身基准高度，h 为气泡实测高度。
  function shouldFlipDown(petY, bubbleH, scale) {
    return petY + (128 - bubbleH) * scale < 6;
  }

  // 气泡左右越界时需要往屏幕内挪多少像素（正数向右，负数向左）。
  function edgeShift(rect, viewportWidth, margin) {
    const m = Number.isFinite(margin) ? margin : 4;
    if (rect.left < m) return m - rect.left;
    if (rect.right > viewportWidth - m) return (viewportWidth - m) - rect.right;
    return 0;
  }

  // 气泡顶部被窗口上沿裁掉时需要下移多少像素。
  function topShift(rect, margin) {
    const m = Number.isFinite(margin) ? margin : 4;
    return Math.max(0, m - rect.top);
  }

  const api = { shouldFlipDown, edgeShift, topShift };
  root.PetLib = root.PetLib || {};
  root.PetLib.bubble = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);