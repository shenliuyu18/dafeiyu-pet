const test = require('node:test');
const assert = require('node:assert/strict');
const { compareVersion, isNewer } = require('../renderer/lib/format.js');

test('compareVersion 处理常见版本号', () => {
  assert.equal(compareVersion('1.2.3', '1.2.3'), 0);
  assert.equal(compareVersion('1.2.4', '1.2.3'), 1);
  assert.equal(compareVersion('1.3', '1.2.9'), 1);
  assert.equal(compareVersion('v1.5.3', '1.5.3'), 0);
  assert.equal(compareVersion('1.5.3-beta', '1.5.3'), -1);
  assert.equal(compareVersion('1.5.3', '1.5.3-beta'), 1);
});

test('isNewer 处理缺失版本', () => {
  assert.equal(isNewer('1.0.1', '1.0.0'), true);
  assert.equal(isNewer('1.0.0', '1.0.0'), false);
  assert.equal(isNewer('', '1.0.0'), false);
  assert.equal(isNewer('1.0.0', ''), true);
});