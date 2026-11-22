const test = require('node:test');
const assert = require('node:assert/strict');
const { visibleRect } = require('../renderer/lib/pet-rect.js');

test('可见包围盒按缩放换算', () => {
  const r = visibleRect(100, 200, 0.5, { x0: 10, x1: 110, y0: 20, y1: 220 });
  assert.deepEqual(r, { left: 105, right: 155, top: 210, bottom: 310 });
});