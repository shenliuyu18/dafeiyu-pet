const test = require('node:test');
const assert = require('node:assert/strict');
const { fraction, percent, mergeProgress } = require('../renderer/lib/store-progress.js');

test('进度比例夹在 0..1', () => {
  assert.equal(fraction(5, 10), 0.5);
  assert.equal(fraction(20, 10), 1);
  assert.equal(fraction(0, 10), 0);
  assert.equal(fraction(-1, 10), 0);
});

test('非法或零总量按 0 处理', () => {
  assert.equal(fraction(5, 0), 0);
  assert.equal(fraction(NaN, 10), 0);
  assert.equal(fraction(5, NaN), 0);
  assert.equal(fraction('x', 10), 0);
  assert.equal(fraction(undefined, undefined), 0);
});

test('百分比四舍五入并封顶 100', () => {
  assert.equal(percent(0.333), 33);
  assert.equal(percent(0.336), 34);
  assert.equal(percent(1.5), 100);
  assert.equal(percent(-0.2), 0);
  assert.equal(percent(NaN), 0);
});

test('合并进度只增不减', () => {
  assert.equal(mergeProgress(0.2, 5, 10), 0.5);
  assert.equal(mergeProgress(0.5, 3, 10), 0.5);
  assert.equal(mergeProgress(0.5, 5, 0), 0.5);
  assert.equal(mergeProgress(undefined, 1, 4), 0.25);
  assert.equal(mergeProgress(NaN, 9, 10), 0.9);
});