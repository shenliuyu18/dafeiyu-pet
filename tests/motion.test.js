const test = require('node:test');
const assert = require('node:assert/strict');
const motion = require('../renderer/lib/motion.js');

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('clamp 限制上下界', () => {
  assert.equal(motion.clamp(5, 0, 10), 5);
  assert.equal(motion.clamp(-1, 0, 10), 0);
  assert.equal(motion.clamp(11, 0, 10), 10);
});

test('wanderSpeed 随饱食度分档', () => {
  assert.equal(motion.wanderSpeed(10), 46);
  assert.equal(motion.wanderSpeed(40), 70);
  assert.equal(motion.wanderSpeed(80), 95);
});

test('steer 会靠近目标并返回距离', () => {
  const p = { x: 0, y: 0, vx: 0, vy: 0 };
  const before = Math.hypot(100 - p.x, 50 - p.y);
  let last = before;
  for (let i = 0; i < 120; i++) {
    last = motion.steer(p, 100, 50, 95, 1 / 60);
  }
  assert.ok(last < before, `distance should shrink: ${last} vs ${before}`);
  assert.ok(Math.abs(p.vx) <= 95 + 1e-6 && Math.abs(p.vy) <= 95 + 1e-6);
});

test('coast 按阻尼衰减速度', () => {
  const p = { x: 0, y: 0, vx: 100, vy: -50 };
  motion.coast(p, 0.1, 0.5);
  assert.equal(p.vx, 50);
  assert.equal(p.vy, -25);
  assert.equal(p.x, 5);
  assert.equal(p.y, -2.5);
});

test('pickTarget 始终落在边界内，并会朝鼠标偏移', () => {
  const b = { minX: -100, maxX: 200, minY: -50, maxY: 150 };
  const rand = seeded(42);
  for (let i = 0; i < 500; i++) {
    const t = motion.pickTarget(b, { x: 0, y: 0 }, 150, 228, rand);
    assert.ok(t.x >= b.minX && t.x <= b.maxX, `x out of bounds: ${t.x}`);
    assert.ok(t.y >= b.minY && t.y <= b.maxY, `y out of bounds: ${t.y}`);
  }
  // 强制走“好奇鼠标”分支：鼠标远在右侧，目标会被夹到右边界
  const t = motion.pickTarget(b, { x: 1000, y: 100 }, 150, 228, () => 0.01);
  assert.equal(t.x, b.maxX);
});