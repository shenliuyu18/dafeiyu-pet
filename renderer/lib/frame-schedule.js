/*
 * 帧调度：空闲 / 漫游 / 拖拽的降帧阈值，以及位置上报节流。
 * 纯函数，避免把性能策略埋进 rAF 回调里。
 */
(function (root) {
  'use strict';

  const BUSY_SPEED = 14;

  function gapLimit(s) {
    if (s.dragging) return 0;
    const busy = Math.abs(s.vx) > BUSY_SPEED || Math.abs(s.vy) > BUSY_SPEED;
    return busy ? s.roamGap : s.idleGap;
  }

  // 80ms 上报粒度；位置没变时 400ms 保活一次（气泡/倒计时牌靠它刷新命中框）。
  function shouldReportPosition(now, lastPosAt, lastReportAt, x, y, lastX, lastY) {
    if (now - lastPosAt <= 80) return false;
    return x !== lastX || y !== lastY || now - lastReportAt > 400;
  }

  const api = { gapLimit, shouldReportPosition, BUSY_SPEED };
  root.PetLib = root.PetLib || {};
  root.PetLib.frameSchedule = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);