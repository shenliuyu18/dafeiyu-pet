/*
 * 角色本体可见包围盒（不含透明留白）。纯函数，菜单/面板按它对齐。
 */
(function (root) {
  'use strict';

  function visibleRect(x, y, scale, box) {
    return {
      left: x + box.x0 * scale,
      right: x + box.x1 * scale,
      top: y + box.y0 * scale,
      bottom: y + box.y1 * scale,
    };
  }

  const api = { visibleRect };
  root.PetLib = root.PetLib || {};
  root.PetLib.petRect = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);