/*
 * 把 alpha 包围盒比例换算成屏幕坐标。纯函数。
 *
 * 关键：比例（x0/y0/x1/y1）与位置无关，必须每次用当前矩形换算。
 * 之前把换算结果连同绝对坐标一起缓存，拖拽时视频源不变、速度又被归零，
 * 缓存要 250ms 才过期，于是 Region 会停在拖拽前的位置，松手切回非整窗时
 * 直接裁掉形象（看起来就是闪烁）。
 */
(function (root) {
  'use strict';

  function boxFromAlpha(rect, alpha, mirrored) {
    if (!rect || !alpha) return null;
    const { left, top, width, height } = rect;
    if (!(width > 0) || !(height > 0)) return null;
    const x0 = mirrored ? 1 - alpha.x1 : alpha.x0;
    const x1 = mirrored ? 1 - alpha.x0 : alpha.x1;
    return {
      x: left + x0 * width,
      y: top + alpha.y0 * height,
      w: (x1 - x0) * width,
      h: (alpha.y1 - alpha.y0) * height,
    };
  }

  const api = { boxFromAlpha };
  root.PetLib = root.PetLib || {};
  root.PetLib.regionBox = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
