/*
 * 运动引擎的纯函数部分：不碰 DOM、不读全局状态，方便 node:test 直接覆盖。
 * 浏览器里挂在 window.PetLib.motion；Node 里通过 module.exports 使用。
 */
(function (root) {
  'use strict';

  function clamp(v, lo, hi) {
    return Math.min(Math.max(v, lo), hi);
  }

  function wanderSpeed(satiety) {
    if (satiety < 25) return 46;
    if (satiety < 60) return 70;
    return 95;
  }

  // 偶尔好奇地朝鼠标附近凑过去，其余时间在边界内随机选点。
  function pickTarget(b, mouse, cx, cy, rng) {
    const rand = rng || Math.random;
    let tx;
    let ty;
    if (rand() < 0.22 && mouse && (mouse.x || mouse.y)) {
      tx = mouse.x - cx + (rand() - 0.5) * 300;
      ty = mouse.y - cy + (rand() - 0.5) * 200;
    } else {
      tx = b.minX + rand() * (b.maxX - b.minX);
      ty = b.minY + rand() * (b.maxY - b.minY);
    }
    return { x: clamp(tx, b.minX, b.maxX), y: clamp(ty, b.minY, b.maxY) };
  }

  // 原地更新位置 / 速度；返回与目标的距离，供调用方判断是否到点。
  function steer(p, tx, ty, speed, dt) {
    const dx = tx - p.x;
    const dy = ty - p.y;
    const dist = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, dt * 3.2);
    p.vx += ((dx / dist) * speed - p.vx) * k;
    p.vy += ((dy / dist) * speed - p.vy) * k;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    return dist;
  }

  function coast(p, dt, damp) {
    p.vx *= damp;
    p.vy *= damp;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  const api = { clamp, wanderSpeed, pickTarget, steer, coast };
  root.PetLib = root.PetLib || {};
  root.PetLib.motion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);