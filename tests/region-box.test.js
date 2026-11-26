const test = require('node:test');
const assert = require('node:assert/strict');
const { boxFromAlpha } = require('../renderer/lib/region-box.js');

const rect = (left, top, width, height) => ({ left, top, width, height });

// 亚像素误差来自 1 - x1 这类浮点运算，按 1e-6 比较
function assertBox(actual, expected) {
  assert.ok(actual, '包围盒不应为 null');
  for (const key of ['x', 'y', 'w', 'h']) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 1e-6, `${key}: ${actual[key]} != ${expected[key]}`);
  }
}

test('按当前矩形换算 alpha 包围盒，未镜像', () => {
  assertBox(boxFromAlpha(rect(100, 200, 300, 350), { x0: 0.2, y0: 0.3, x1: 0.8, y1: 0.9 }, false),
    { x: 160, y: 305, w: 180, h: 210 });
});

test('同一份比例随位置移动即时换算出新坐标（拖拽不能沿用旧绝对坐标）', () => {
  const ab = { x0: 0.2, y0: 0.3, x1: 0.8, y1: 0.9 };
  const before = boxFromAlpha(rect(100, 200, 300, 350), ab, false);
  const after = boxFromAlpha(rect(500, 420, 300, 350), ab, false);
  assert.equal(after.x - before.x, 400);
  assert.equal(after.y - before.y, 220);
  assert.equal(after.w, before.w);
  assert.equal(after.h, before.h);
});

test('镜像时左右翻转，且仍以当前矩形为准', () => {
  // 对称比例镜像后不变
  assertBox(boxFromAlpha(rect(100, 200, 300, 350), { x0: 0.2, y0: 0.3, x1: 0.8, y1: 0.9 }, true),
    { x: 160, y: 305, w: 180, h: 210 });
  // 偏左的比例镜像后应落到右侧
  assertBox(boxFromAlpha(rect(100, 200, 300, 350), { x0: 0.1, y0: 0.2, x1: 0.4, y1: 0.5 }, true),
    { x: 280, y: 270, w: 90, h: 105 });
});

test('矩形尚未布局时返回 null', () => {
  assert.equal(boxFromAlpha(rect(0, 0, 0, 0), { x0: 0, y0: 0, x1: 1, y1: 1 }, false), null);
  assert.equal(boxFromAlpha(rect(10, 10, 100, 0), { x0: 0, y0: 0, x1: 1, y1: 1 }, false), null);
});
