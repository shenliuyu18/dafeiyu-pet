const test = require('node:test');
const assert = require('node:assert/strict');
const { clock, minutes } = require('../renderer/lib/time-format.js');

test('倒计时向上取整并补零', () => {
  assert.equal(clock(0), '00:00');
  assert.equal(clock(61_000), '01:01');
  assert.equal(clock(1), '00:01');
});

test('番茄钟分钟保留一位小数', () => {
  assert.equal(minutes(25), '25 分钟');
  assert.equal(minutes(2.34), '2.3 分钟');
  assert.equal(minutes(0), '0 分钟');
});