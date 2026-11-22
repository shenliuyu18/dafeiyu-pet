const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldFlipDown, edgeShift, topShift } = require('../renderer/lib/bubble-layout.js');

test('上方空间不足时气泡翻到下方', () => {
  assert.equal(shouldFlipDown(10, 240, 1), true);
  assert.equal(shouldFlipDown(300, 120, 1), false);
});

test('缩放后仍按实际高度判断是否下翻', () => {
  assert.equal(shouldFlipDown(20, 240, 0.5), true);
  assert.equal(shouldFlipDown(120, 240, 0.5), false);
});

test('左右越界返回向内位移', () => {
  assert.equal(edgeShift({ left: -12, right: 200 }, 800), 16);
  assert.equal(edgeShift({ left: 600, right: 812 }, 800), -16);
  assert.equal(edgeShift({ left: 100, right: 300 }, 800), 0);
});

test('顶部越界返回下移量', () => {
  assert.equal(topShift({ top: -10 }), 14);
  assert.equal(topShift({ top: 20 }), 0);
});
